import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { checkQuota } from '@/lib/quota/check'
import { deductQuota } from '@/lib/quota/deduct'
import { extractPdfInfo, extractPagesText } from '@/lib/pdf/extract'
import {
  buildDocumentSummaryPrompt,
  buildSectionSummaryPrompt,
  getSummaryType,
} from '@/lib/openai/prompts/summarize'
import { createStreamingResponse, createSSEResponse } from '@/lib/openai/streaming'
import { z } from 'zod'

const requestSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
  startPage: z.number().int().positive().optional(),
  endPage: z.number().int().positive().optional(),
})

/**
 * POST /api/ai/summarize - Generate document or section summary
 * Returns streaming response
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

    const { courseId, fileId, pdfType, startPage, endPage } = parseResult.data

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
      return errors.custom('FILE_IS_SCANNED', 'Scanned PDFs do not support summarization', 400)
    }

    // Determine summary type
    const summaryType = getSummaryType(startPage, endPage, file.page_count)
    const quotaBucket = summaryType === 'document' ? 'documentSummary' : 'sectionSummary'

    // Check for existing summary (caching)
    const existingQuery = supabase
      .from('summaries')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .eq('type', summaryType)

    if (summaryType === 'section' && startPage && endPage) {
      existingQuery
        .eq('page_range_start', startPage)
        .eq('page_range_end', endPage)
    }

    const { data: existingSummary } = await existingQuery.single()

    if (existingSummary && existingSummary.content_markdown) {
      // Return cached summary
      return successResponse({
        id: existingSummary.id,
        type: summaryType,
        content: existingSummary.content_markdown,
        pageRangeStart: existingSummary.page_range_start,
        pageRangeEnd: existingSummary.page_range_end,
        cached: true,
        createdAt: existingSummary.created_at,
      })
    }

    // Check quota
    const quotaCheck = await checkQuota(supabase, user.id, quotaBucket)

    if (!quotaCheck.allowed) {
      return errors.custom('QUOTA_EXCEEDED', `${quotaBucket} quota exceeded`, 429, {
        bucket: quotaBucket,
        used: quotaCheck.quota.used,
        limit: quotaCheck.quota.limit,
        resetAt: quotaCheck.quota.resetAt,
      })
    }

    // Get PDF content
    let textContent = ''
    try {
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('course-files')
        .download(file.storage_key)

      if (!downloadError && pdfData) {
        const buffer = Buffer.from(await pdfData.arrayBuffer())

        if (summaryType === 'section' && startPage && endPage) {
          // Extract specific pages
          textContent = await extractPagesText(buffer, startPage, endPage)
        } else {
          // Extract entire document
          const pdfInfo = await extractPdfInfo(buffer)
          textContent = pdfInfo.textContent
        }
      }
    } catch {
      return errors.custom('PDF_EXTRACTION_FAILED', 'Failed to extract PDF content', 500)
    }

    if (!textContent || textContent.trim().length < 50) {
      return errors.custom('INSUFFICIENT_CONTENT', 'PDF does not contain enough text for summarization', 400)
    }

    // Truncate if too long
    const maxChars = summaryType === 'document' ? 100000 : 50000
    if (textContent.length > maxChars) {
      textContent = textContent.slice(0, maxChars) + '\n\n[Content truncated due to length...]'
    }

    // Build prompt
    const prompt = summaryType === 'document'
      ? buildDocumentSummaryPrompt({
          documentText: textContent,
          pdfType,
          fileName: file.name,
          totalPages: file.page_count,
        })
      : buildSectionSummaryPrompt({
          sectionText: textContent,
          pdfType,
          fileName: file.name,
          startPage: startPage!,
          endPage: endPage!,
        })

    // Call OpenAI with streaming
    const openai = getOpenAIClient()
    const stream = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert educational AI tutor creating clear, helpful summaries for university students. Structure your summaries logically with headers and bullet points. Use Markdown formatting and LaTeX for math ($inline$ or $$block$$).',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5, // Lower temperature for more consistent summaries
      max_tokens: summaryType === 'document' ? 3000 : 1500,
      stream: true,
    })

    // Create summary record first with empty content
    const { data: summaryRecord, error: createError } = await supabase
      .from('summaries')
      .insert({
        user_id: user.id,
        course_id: courseId,
        file_id: fileId,
        type: summaryType,
        page_range_start: startPage || null,
        page_range_end: endPage || null,
        content_markdown: '', // Will be updated after streaming
      })
      .select()
      .single()

    if (createError || !summaryRecord) {
      console.error('Error creating summary record:', createError)
      return errors.internalError()
    }

    // Create streaming response
    const { stream: responseStream } = createStreamingResponse(
      stream,
      async (content) => {
        // Update summary record with final content
        await supabase
          .from('summaries')
          .update({ content_markdown: content })
          .eq('id', summaryRecord.id)

        // Deduct quota
        await deductQuota(supabase, user.id, quotaBucket)
      }
    )

    // Return streaming response with summary ID
    const response = createSSEResponse(responseStream)
    response.headers.set('X-Summary-Id', summaryRecord.id)
    response.headers.set('X-Summary-Type', summaryType)

    return response
  } catch (error) {
    console.error('Summarize error:', error)
    return errors.internalError()
  }
}

/**
 * GET /api/ai/summarize - Get summaries for a file
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
    const fileId = searchParams.get('fileId')
    const type = searchParams.get('type') // 'document' | 'section'

    if (!fileId) {
      return errors.invalidInput('fileId is required')
    }

    // Verify file ownership
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('id')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()

    if (fileError || !file) {
      return errors.notFound('File')
    }

    // Build query
    let query = supabase
      .from('summaries')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (type === 'document' || type === 'section') {
      query = query.eq('type', type)
    }

    const { data: summaries, error: summaryError } = await query.limit(20)

    if (summaryError) {
      console.error('Error fetching summaries:', summaryError)
      return errors.internalError()
    }

    return successResponse({
      items: summaries || [],
    })
  } catch (error) {
    console.error('Summaries fetch error:', error)
    return errors.internalError()
  }
}
