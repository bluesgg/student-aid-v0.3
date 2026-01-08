import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { checkQuota } from '@/lib/quota/check'
import { deductQuota } from '@/lib/quota/deduct'
import { extractPageText } from '@/lib/pdf/extract'
import {
  buildExplainPagePrompt,
  parseExplainPageResponse,
} from '@/lib/openai/prompts/explain-page'
import { z } from 'zod'

const requestSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  page: z.number().int().positive(),
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
})

/**
 * POST /api/ai/explain-page - Generate auto-stickers for a page
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

    const { courseId, fileId, page, pdfType } = parseResult.data

    // Get file info
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .single()

    if (fileError || !file) {
      return errors.notFound('File')
    }

    // Check if file is scanned
    if (file.is_scanned) {
      return errors.custom('FILE_IS_SCANNED', 'Scanned PDFs do not support AI explain', 400)
    }

    // Check if page is valid
    if (page > file.page_count) {
      return errors.invalidInput(`Page ${page} does not exist (file has ${file.page_count} pages)`)
    }

    // Check for existing auto stickers for this page (cache hit)
    const { data: existingStickers } = await supabase
      .from('stickers')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .eq('page', page)
      .eq('type', 'auto')

    if (existingStickers && existingStickers.length > 0) {
      // Return cached stickers without deducting quota
      const { data: quotas } = await supabase
        .from('quotas')
        .select('*')
        .eq('user_id', user.id)
        .eq('bucket', 'autoExplain')
        .single()

      return successResponse({
        stickers: existingStickers.map((s) => ({
          id: s.id,
          type: s.type,
          page: s.page,
          anchor: {
            textSnippet: s.anchor_text,
            rect: s.anchor_rect,
          },
          contentMarkdown: s.content_markdown,
          folded: s.folded,
          createdAt: s.created_at,
        })),
        quota: {
          autoExplain: {
            used: quotas?.used ?? 0,
            limit: quotas?.limit ?? 300,
            resetAt: quotas?.reset_at ?? new Date().toISOString(),
          },
        },
        cached: true,
      })
    }

    // Check quota
    const quotaCheck = await checkQuota(supabase, user.id, 'autoExplain')

    if (!quotaCheck.allowed) {
      return errors.custom('QUOTA_EXCEEDED', 'Auto explain quota exceeded', 429, {
        bucket: 'autoExplain',
        used: quotaCheck.quota.used,
        limit: quotaCheck.quota.limit,
        resetAt: quotaCheck.quota.resetAt,
      })
    }

    // Download PDF from storage
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from('course-files')
      .download(file.storage_key)

    if (downloadError || !pdfData) {
      console.error('Error downloading PDF:', downloadError)
      return errors.internalError()
    }

    // Extract page text
    const buffer = Buffer.from(await pdfData.arrayBuffer())
    const { text: pageText } = await extractPageText(buffer, page)

    if (!pageText || pageText.length < 50) {
      return errors.custom(
        'INSUFFICIENT_TEXT',
        'This page has insufficient text content for AI explanation',
        400
      )
    }

    // Build prompt
    const prompt = buildExplainPagePrompt({
      pageText,
      pageNumber: page,
      pdfType,
      totalPages: file.page_count,
    })

    // Call OpenAI
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    })

    const responseContent = completion.choices[0]?.message?.content
    if (!responseContent) {
      return errors.custom('AI_ERROR', 'AI did not return a response', 500)
    }

    // Parse the response
    const parsed = parseExplainPageResponse(responseContent)

    // Create stickers in database
    const stickersToCreate = parsed.explanations.map((exp) => ({
      user_id: user.id,
      course_id: courseId,
      file_id: fileId,
      type: 'auto' as const,
      page,
      anchor_text: exp.anchorText,
      anchor_rect: null,
      parent_id: null,
      content_markdown: exp.explanation,
      folded: false,
      depth: 0,
    }))

    const { data: createdStickers, error: createError } = await supabase
      .from('stickers')
      .insert(stickersToCreate)
      .select()

    if (createError) {
      console.error('Error creating stickers:', createError)
      return errors.internalError()
    }

    // Deduct quota
    const deductResult = await deductQuota(supabase, user.id, 'autoExplain')

    return successResponse({
      stickers: (createdStickers || []).map((s) => ({
        id: s.id,
        type: s.type,
        page: s.page,
        anchor: {
          textSnippet: s.anchor_text,
          rect: s.anchor_rect,
        },
        contentMarkdown: s.content_markdown,
        folded: s.folded,
        createdAt: s.created_at,
      })),
      quota: {
        autoExplain: deductResult.quota,
      },
      cached: false,
    })
  } catch (error) {
    console.error('Explain page error:', error)
    return errors.internalError()
  }
}
