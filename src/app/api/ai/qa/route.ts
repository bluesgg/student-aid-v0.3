import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { checkQuota } from '@/lib/quota/check'
import { deductQuota } from '@/lib/quota/deduct'
import { extractPdfInfo } from '@/lib/pdf/extract'
import { buildQAPrompt, extractPageReferences } from '@/lib/openai/prompts/qa'
import { createStreamingResponse, createSSEResponse } from '@/lib/openai/streaming'
import {
  retrieveContextForPage,
  buildEnhancedSystemMessage,
  getContextSummary,
  type ContextRetrievalResult,
} from '@/lib/context'
import { getUserExplainLocale, getLocalizedSystemPrompt } from '@/lib/user-preferences'
import { z } from 'zod'

const requestSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
})

/**
 * POST /api/ai/qa - Ask a question about a PDF document
 * Returns streaming response with page references
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

    // Get user's preferred explanation language
    const explainLocale = await getUserExplainLocale(user.id)


    // Parse and validate request body
    const body = await request.json()
    const parseResult = requestSchema.safeParse(body)

    if (!parseResult.success) {
      return errors.invalidInput(parseResult.error.errors[0].message)
    }

    const { courseId, fileId, question, pdfType } = parseResult.data

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
      return errors.custom('FILE_IS_SCANNED', 'Scanned PDFs do not support Q&A', 400)
    }

    // Check quota (uses learningInteractions bucket)
    const quotaCheck = await checkQuota(supabase, user.id, 'learningInteractions')

    if (!quotaCheck.allowed) {
      return errors.custom('QUOTA_EXCEEDED', 'Learning interactions quota exceeded', 429, {
        bucket: 'learningInteractions',
        used: quotaCheck.quota.used,
        limit: quotaCheck.quota.limit,
        resetAt: quotaCheck.quota.resetAt,
      })
    }

    // Get PDF content
    let documentText = ''
    try {
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('course-files')
        .download(file.storage_key)

      if (!downloadError && pdfData) {
        const buffer = Buffer.from(await pdfData.arrayBuffer())
        const pdfInfo = await extractPdfInfo(buffer)
        documentText = pdfInfo.textContent
      }
    } catch {
      return errors.custom('PDF_EXTRACTION_FAILED', 'Failed to extract PDF content', 500)
    }

    if (!documentText || documentText.trim().length < 50) {
      return errors.custom('INSUFFICIENT_CONTENT', 'PDF does not contain enough text for Q&A', 400)
    }

    // Truncate document text if too long (keep first ~100k chars)
    const maxChars = 100000
    if (documentText.length > maxChars) {
      documentText = documentText.slice(0, maxChars) + '\n\n[Document truncated due to length...]'
    }

    // Retrieve context from shared context library (graceful degradation on failure)
    let contextResult: ContextRetrievalResult = { entries: [], totalTokens: 0, retrievalTimeMs: 0 }
    try {
      contextResult = await retrieveContextForPage({
        userId: user.id,
        courseId,
        fileId,
        currentPage: 1, // Q&A is document-wide, use page 1 as reference
        pageText: documentText.slice(0, 5000), // Sample of document for context
        question, // User's question for keyword extraction
      })
      if (contextResult.entries.length > 0) {
        console.log('Context retrieved for Q&A:', getContextSummary(contextResult))
      }
    } catch (contextError) {
      // Silent degradation - continue without context
      console.error('Context retrieval failed, proceeding without context:', contextError)
    }

    // Build prompt
    const prompt = buildQAPrompt({
      question,
      documentText,
      pdfType,
      fileName: file.name,
      totalPages: file.page_count,
    })

    // Build system message with context enhancement
    const baseSystemMessage =
      'You are an expert educational AI tutor. You help students understand academic material by answering their questions thoroughly and accurately. Always reference page numbers when the information comes from specific pages. Use Markdown formatting and LaTeX for math ($inline$ or $$block$$).'
    const localizedBaseMessage = getLocalizedSystemPrompt(baseSystemMessage, explainLocale)
    const systemMessage = buildEnhancedSystemMessage(localizedBaseMessage, contextResult)

    // Call OpenAI with streaming
    const openai = getOpenAIClient()
    const stream = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: systemMessage,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    })

    // Create Q&A record first with empty answer
    const { data: qaRecord, error: createError } = await supabase
      .from('qa_interactions')
      .insert({
        user_id: user.id,
        course_id: courseId,
        file_id: fileId,
        question,
        answer_markdown: '', // Will be updated after streaming
        references: [], // Will be updated after streaming
      })
      .select()
      .single()

    if (createError || !qaRecord) {
      console.error('Error creating Q&A record:', createError)
      return errors.internalError()
    }

    // Create streaming response
    const { stream: responseStream } = createStreamingResponse(
      stream,
      async (content) => {
        // Extract page references from the answer
        const pageRefs = extractPageReferences(content)

        // Update Q&A record with final answer
        await supabase
          .from('qa_interactions')
          .update({
            answer_markdown: content,
            references: pageRefs.map((page) => ({ page, type: 'page' })),
          })
          .eq('id', qaRecord.id)

        // Deduct quota
        await deductQuota(supabase, user.id, 'learningInteractions')
      }
    )

    // Return streaming response with Q&A ID
    const response = createSSEResponse(responseStream)
    response.headers.set('X-QA-Id', qaRecord.id)

    return response
  } catch (error) {
    console.error('Q&A error:', error)
    return errors.internalError()
  }
}

/**
 * GET /api/ai/qa - Get Q&A history for a file
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

    // Get Q&A history
    const { data: qaHistory, error: qaError } = await supabase
      .from('qa_interactions')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (qaError) {
      console.error('Error fetching Q&A history:', qaError)
      return errors.internalError()
    }

    return successResponse({
      items: qaHistory || [],
    })
  } catch (error) {
    console.error('Q&A history error:', error)
    return errors.internalError()
  }
}
