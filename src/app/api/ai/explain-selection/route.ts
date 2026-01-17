import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { checkQuota } from '@/lib/quota/check'
import { deductQuota } from '@/lib/quota/deduct'
import { extractPageText } from '@/lib/pdf/extract'
import {
  buildExplainSelectionPrompt,
  buildFollowUpPrompt,
} from '@/lib/openai/prompts/explain-selection'
import { createStreamingResponse, createSSEResponse } from '@/lib/openai/streaming'
import {
  retrieveContextForPage,
  buildEnhancedSystemMessage,
  getContextSummary,
  type ContextRetrievalResult,
} from '@/lib/context'
import { z } from 'zod'
import { getLocalizedSystemPrompt, getUserExplainLocale, type Locale } from '@/lib/user-preferences'

const MAX_FOLLOW_UP_DEPTH = 10

const requestSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  page: z.number().int().positive(),
  selectedText: z.string().min(1).max(5000),
  parentId: z.string().uuid().nullable().optional(),
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
  locale: z.enum(['en', 'zh']).optional(),
})

/**
 * POST /api/ai/explain-selection - Explain selected text
 * Supports follow-up questions via parentId
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

    const { courseId, fileId, page, selectedText, parentId, pdfType, locale: requestLocale } = parseResult.data

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

    // Validate depth for follow-up questions
    let depth = 0
    let parentContent: string | undefined

    if (parentId) {
      const { data: parent, error: parentError } = await supabase
        .from('stickers')
        .select('*')
        .eq('id', parentId)
        .eq('user_id', user.id)
        .single()

      if (parentError || !parent) {
        return errors.notFound('Parent sticker')
      }

      depth = (parent.depth || 0) + 1
      parentContent = parent.content_markdown

      if (depth > MAX_FOLLOW_UP_DEPTH) {
        return errors.custom(
          'MAX_DEPTH_REACHED',
          `Follow-up depth limit of ${MAX_FOLLOW_UP_DEPTH} reached`,
          400
        )
      }
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
        question: selectedText, // Use selected text as context for keyword extraction
      })
      if (contextResult.entries.length > 0) {
        console.log('Context retrieved:', getContextSummary(contextResult))
      }
    } catch (contextError) {
      // Silent degradation - continue without context
      console.error('Context retrieval failed, proceeding without context:', contextError)
    }

    // Build prompt
    const prompt = parentContent
      ? buildFollowUpPrompt({
          selectedText,
          pageText,
          pageNumber: page,
          pdfType,
          parentContent,
          depth,
        })
      : buildExplainSelectionPrompt({
          selectedText,
          pageText,
          pageNumber: page,
          pdfType,
          depth: 0,
        })

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

    // Create sticker record first with empty content
    const { data: sticker, error: createError } = await supabase
      .from('stickers')
      .insert({
        user_id: user.id,
        course_id: courseId,
        file_id: fileId,
        type: 'manual',
        page,
        anchor_text: selectedText.slice(0, 100),
        anchor_rect: null,
        parent_id: parentId || null,
        content_markdown: '', // Will be updated after streaming completes
        folded: false,
        depth,
      })
      .select()
      .single()

    if (createError || !sticker) {
      console.error('Error creating sticker:', createError)
      return errors.internalError()
    }

    // Create streaming response
    const { stream: responseStream, contentPromise } = createStreamingResponse(
      stream,
      async (content) => {
        // Update sticker with final content
        await supabase
          .from('stickers')
          .update({ content_markdown: content })
          .eq('id', sticker.id)

        // Deduct quota
        await deductQuota(supabase, user.id, 'learningInteractions')
      }
    )

    // Return streaming response with sticker metadata
    const response = createSSEResponse(responseStream)

    // Add sticker ID to response headers for client to track
    response.headers.set('X-Sticker-Id', sticker.id)

    return response
  } catch (error) {
    console.error('Explain selection error:', error)
    return errors.internalError()
  }
}

/**
 * Non-streaming version of explain-selection
 * Internal helper function for testing or batch operations
 */
async function explainSelectionSync(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  params: {
    courseId: string
    fileId: string
    page: number
    selectedText: string
    parentId?: string | null
    pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    pageText: string
  }
) {
  const { courseId, fileId, page, selectedText, parentId, pdfType, pageText } = params

  // Validate depth for follow-up questions
  let depth = 0
  let parentContent: string | undefined

  if (parentId) {
    const { data: parent } = await supabase
      .from('stickers')
      .select('*')
      .eq('id', parentId)
      .eq('user_id', userId)
      .single()

    if (parent) {
      depth = (parent.depth || 0) + 1
      parentContent = parent.content_markdown
    }
  }

  // Build prompt
  const prompt = parentContent
    ? buildFollowUpPrompt({
        selectedText,
        pageText,
        pageNumber: page,
        pdfType,
        parentContent,
        depth,
      })
    : buildExplainSelectionPrompt({
        selectedText,
        pageText,
        pageNumber: page,
        pdfType,
        depth: 0,
      })

  // Call OpenAI without streaming
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations. Use Markdown formatting and LaTeX for math ($inline$ or $$block$$).',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  })

  const content = completion.choices[0]?.message?.content || ''

  // Create sticker
  const { data: sticker, error: createError } = await supabase
    .from('stickers')
    .insert({
      user_id: userId,
      course_id: courseId,
      file_id: fileId,
      type: 'manual',
      page,
      anchor_text: selectedText.slice(0, 100),
      anchor_rect: null,
      parent_id: parentId || null,
      content_markdown: content,
      folded: false,
      depth,
    })
    .select()
    .single()

  if (createError) {
    throw new Error('Failed to create sticker')
  }

  // Deduct quota
  await deductQuota(supabase, userId, 'learningInteractions')

  return sticker
}
