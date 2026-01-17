import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errors } from '@/lib/api-response'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { checkQuota } from '@/lib/quota/check'
import { deductQuota } from '@/lib/quota/deduct'
import { extractPageText } from '@/lib/pdf/extract'
import { buildExplainSelectionPrompt } from '@/lib/openai/prompts/explain-selection'
import { createStreamingResponse, createSSEResponse } from '@/lib/openai/streaming'
import {
  retrieveContextForPage,
  buildEnhancedSystemMessage,
  getContextSummary,
  type ContextRetrievalResult,
} from '@/lib/context'
import { z } from 'zod'
import { getLocalizedSystemPrompt, getUserExplainLocale, type Locale } from '@/lib/user-preferences'

const requestSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  page: z.number().int().positive(),
  selectedText: z.string().min(1).max(5000),
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
  locale: z.enum(['en', 'zh']).optional(),
  parentContext: z.string().optional(),
})

/**
 * POST /api/ai/qa-explain - Explain selected text and save to Q&A history
 * Similar to explain-selection but stores in qa_interactions table
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

    const { courseId, fileId, page, selectedText, pdfType, locale: requestLocale, parentContext } = parseResult.data

    // Get locale - use request locale or fall back to user preference
    const locale: Locale = requestLocale ?? await getUserExplainLocale(user.id)

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

    // Check quota
    const quotaCheck = await checkQuota(supabase, user.id, 'learningInteractions')

    if (!quotaCheck.allowed) {
      return errors.custom('QUOTA_EXCEEDED', 'Learning interactions quota exceeded', 429, {
        bucket: 'learningInteractions',
        used: quotaCheck.quota.used,
        limit: quotaCheck.quota.limit,
        resetAt: quotaCheck.quota.resetAt,
      })
    }

    // Get page context
    let pageText = ''
    try {
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('course-files')
        .download(file.storage_key)

      if (!downloadError && pdfData) {
        const buffer = Buffer.from(await pdfData.arrayBuffer())
        const result = await extractPageText(buffer, page)
        pageText = result.text
      }
    } catch {
      // Proceed without page context if extraction fails
      pageText = ''
    }

    // Retrieve context from shared context library (graceful degradation on failure)
    let contextResult: ContextRetrievalResult = { entries: [], totalTokens: 0, retrievalTimeMs: 0 }
    try {
      contextResult = await retrieveContextForPage({
        userId: user.id,
        courseId,
        fileId,
        currentPage: page,
        pageText,
        question: selectedText,
      })
      if (contextResult.entries.length > 0) {
        console.log('Context retrieved:', getContextSummary(contextResult))
      }
    } catch (contextError) {
      // Silent degradation - continue without context
      console.error('Context retrieval failed, proceeding without context:', contextError)
    }

    // Build prompt - include parentContext if provided (for sticker follow-ups)
    let prompt = buildExplainSelectionPrompt({
      selectedText,
      pageText,
      pageNumber: page,
      pdfType,
      depth: 0,
    })

    if (parentContext) {
      prompt = `Previous explanation context:\n${parentContext}\n\nNow explain this follow-up text:\n${prompt}`
    }

    // Build system message with context enhancement and locale
    const baseSystemMessage =
      'You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations. Use Markdown formatting and LaTeX for math ($inline$ or $$block$$).'
    const localizedSystemMessage = getLocalizedSystemPrompt(baseSystemMessage, locale)
    const systemMessage = buildEnhancedSystemMessage(localizedSystemMessage, contextResult)

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

    // Create Q&A record with interaction_type='explain'
    const { data: qaRecord, error: createError } = await supabase
      .from('qa_interactions')
      .insert({
        user_id: user.id,
        course_id: courseId,
        file_id: fileId,
        question: selectedText.slice(0, 200), // Use selected text as "question"
        answer_markdown: '', // Will be updated after streaming
        references: [{ page, type: 'explain' }],
        interaction_type: 'explain',
        source_page: page,
        selected_text: selectedText,
      })
      .select()
      .single()

    if (createError || !qaRecord) {
      console.error('Error creating Q&A explain record:', createError)
      return errors.internalError()
    }

    // Create streaming response
    const { stream: responseStream } = createStreamingResponse(
      stream,
      async (content) => {
        // Update Q&A record with final content
        await supabase
          .from('qa_interactions')
          .update({ answer_markdown: content })
          .eq('id', qaRecord.id)

        // Deduct quota
        await deductQuota(supabase, user.id, 'learningInteractions')
      }
    )

    // Return streaming response with Q&A metadata
    const response = createSSEResponse(responseStream)
    response.headers.set('X-QA-Id', qaRecord.id)

    return response
  } catch (error) {
    console.error('QA explain error:', error)
    return errors.internalError()
  }
}
