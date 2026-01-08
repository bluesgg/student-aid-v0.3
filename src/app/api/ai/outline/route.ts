import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { checkQuota } from '@/lib/quota/check'
import { deductQuota } from '@/lib/quota/deduct'
import { extractPdfInfo } from '@/lib/pdf/extract'
import {
  buildOutlinePrompt,
  parseOutlineResponse,
  type OutlineNode,
} from '@/lib/openai/prompts/outline'
import { z } from 'zod'

const requestSchema = z.object({
  courseId: z.string().uuid(),
  regenerate: z.boolean().optional().default(false),
})

/**
 * POST /api/ai/outline - Generate course outline from all course files
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = requestSchema.safeParse(body)

    if (!parseResult.success) {
      return errors.invalidInput(parseResult.error.errors[0].message)
    }

    const { courseId, regenerate } = parseResult.data

    // Get course info
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return errors.notFound('Course')
    }

    // Check for existing outline (unless regenerating)
    if (!regenerate) {
      const { data: existingOutline } = await supabase
        .from('summaries')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .eq('type', 'course')
        .is('file_id', null)
        .single()

      if (existingOutline && existingOutline.content_markdown) {
        try {
          const outlineData = JSON.parse(existingOutline.content_markdown)
          return successResponse({
            id: existingOutline.id,
            outline: outlineData,
            cached: true,
            createdAt: existingOutline.created_at,
          })
        } catch {
          // If parsing fails, regenerate
        }
      }
    }

    // Check quota (courseSummary bucket - 15/month)
    const quotaCheck = await checkQuota(supabase, user.id, 'courseSummary')

    if (!quotaCheck.allowed) {
      return errors.custom('QUOTA_EXCEEDED', 'Course summary quota exceeded', 429, {
        bucket: 'courseSummary',
        used: quotaCheck.quota.used,
        limit: quotaCheck.quota.limit,
        resetAt: quotaCheck.quota.resetAt,
      })
    }

    // Get all files for the course
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .order('type')
      .order('name')

    if (filesError) {
      console.error('Error fetching files:', filesError)
      return errors.internalError()
    }

    if (!files || files.length === 0) {
      return errors.custom('NO_FILES', 'Course has no files to generate outline from', 400)
    }

    // Extract text from all non-scanned PDFs
    const fileContents: Array<{
      id: string
      name: string
      type: 'Lecture' | 'Homework' | 'Exam' | 'Other'
      pageCount: number
      textContent: string
    }> = []

    for (const file of files) {
      if (file.is_scanned) {
        continue // Skip scanned files
      }

      try {
        const { data: pdfData, error: downloadError } = await supabase.storage
          .from('course-files')
          .download(file.storage_key)

        if (!downloadError && pdfData) {
          const buffer = Buffer.from(await pdfData.arrayBuffer())
          const pdfInfo = await extractPdfInfo(buffer)

          if (pdfInfo.textContent.trim().length > 100) {
            fileContents.push({
              id: file.id,
              name: file.name,
              type: file.type as 'Lecture' | 'Homework' | 'Exam' | 'Other',
              pageCount: file.page_count,
              textContent: pdfInfo.textContent,
            })
          }
        }
      } catch (err) {
        console.error(`Error extracting text from ${file.name}:`, err)
        // Continue with other files
      }
    }

    if (fileContents.length === 0) {
      return errors.custom(
        'INSUFFICIENT_CONTENT',
        'No readable text content found in course files',
        400
      )
    }

    // Build prompt
    const prompt = buildOutlinePrompt({
      courseName: course.name,
      school: course.school,
      term: course.term,
      files: fileContents,
    })

    // Call OpenAI (non-streaming for JSON response)
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert educational AI tutor creating course outlines. You analyze course materials and create well-structured, hierarchical outlines that help students understand the course content. Always respond with valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 4000,
    })

    const responseContent = completion.choices[0]?.message?.content || ''

    // Parse the outline
    let outline: OutlineNode[]
    try {
      outline = parseOutlineResponse(responseContent)
    } catch (err) {
      console.error('Failed to parse outline:', err)
      return errors.custom('PARSE_ERROR', 'Failed to generate valid outline', 500)
    }

    // Map file names to IDs in the outline
    const fileNameToId = new Map(fileContents.map((f) => [f.name, f.id]))
    outline = addFileIdsToOutline(outline, fileNameToId)

    // Save or update the outline
    const outlineJson = JSON.stringify(outline)

    // Check if we're updating an existing outline
    const { data: existing } = await supabase
      .from('summaries')
      .select('id')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('type', 'course')
      .is('file_id', null)
      .single()

    let savedOutline
    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from('summaries')
        .update({
          content_markdown: outlineJson,
          created_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating outline:', updateError)
        return errors.internalError()
      }
      savedOutline = updated
    } else {
      // Create new
      const { data: created, error: createError } = await supabase
        .from('summaries')
        .insert({
          user_id: user.id,
          course_id: courseId,
          file_id: null,
          type: 'course',
          content_markdown: outlineJson,
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating outline:', createError)
        return errors.internalError()
      }
      savedOutline = created
    }

    // Deduct quota
    await deductQuota(supabase, user.id, 'courseSummary')

    return successResponse({
      id: savedOutline.id,
      outline,
      cached: false,
      createdAt: savedOutline.created_at,
    })
  } catch (error) {
    console.error('Outline generation error:', error)
    return errors.internalError()
  }
}

/**
 * GET /api/ai/outline - Get existing outline for a course
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')

    if (!courseId) {
      return errors.invalidInput('courseId is required')
    }

    // Verify course ownership
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return errors.notFound('Course')
    }

    // Get existing outline
    const { data: outline, error: outlineError } = await supabase
      .from('summaries')
      .select('*')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('type', 'course')
      .is('file_id', null)
      .single()

    if (outlineError || !outline) {
      return successResponse({
        outline: null,
        exists: false,
      })
    }

    try {
      const outlineData = JSON.parse(outline.content_markdown)
      return successResponse({
        id: outline.id,
        outline: outlineData,
        exists: true,
        createdAt: outline.created_at,
      })
    } catch {
      return successResponse({
        outline: null,
        exists: false,
      })
    }
  } catch (error) {
    console.error('Outline fetch error:', error)
    return errors.internalError()
  }
}

/**
 * Add file IDs to outline references based on file names
 */
function addFileIdsToOutline(
  nodes: OutlineNode[],
  fileNameToId: Map<string, string>
): OutlineNode[] {
  return nodes.map((node) => {
    const updated: OutlineNode = { ...node }

    if (node.references) {
      updated.references = node.references.map((ref) => ({
        ...ref,
        fileId: fileNameToId.get(ref.fileName) || '',
      }))
    }

    if (node.children) {
      updated.children = addFileIdsToOutline(node.children, fileNameToId)
    }

    return updated
  })
}
