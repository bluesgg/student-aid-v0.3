/**
 * PPT PDF Sticker Generator
 * Generates one sticker per page for presentation-style PDFs.
 */

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { extractPageText } from '@/lib/pdf/extract'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { retrieveContextForPage, buildContextHint } from '@/lib/context'
import { updateSessionProgress } from './window-manager'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'

/**
 * Function calling tool definition for PPT slide explanation
 * OpenAI guarantees the response will match this schema
 */
const PPT_EXPLANATION_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_slide_explanation',
    description: 'Create a comprehensive explanation for a presentation slide',
    parameters: {
      type: 'object',
      properties: {
        anchorText: {
          type: 'string',
          description: 'Brief topic or title of this slide (max 100 characters)',
        },
        explanation: {
          type: 'string',
          description: 'Detailed explanation with Markdown formatting and LaTeX math ($...$ for inline, $$...$$ for block)',
        },
      },
      required: ['anchorText', 'explanation'],
    },
  },
}

/**
 * Generated sticker data
 */
export interface GeneratedSticker {
  page: number
  anchorText: string
  contentMarkdown: string
  pageRange: null // PPT doesn't use cross-page stickers
}

/**
 * Generation result for a single page
 */
export interface PageGenerationResult {
  success: boolean
  page: number
  stickers?: GeneratedSticker[]
  error?: string
}

/**
 * Generate sticker for a single PPT page
 * @param pdfBuffer - PDF file buffer
 * @param page - Page number to generate
 * @param options - Generation options
 * @returns Generation result
 */
export async function generatePptPageSticker(
  pdfBuffer: Buffer,
  page: number,
  options: {
    userId: string
    courseId: string
    fileId: string
    pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    totalPages: number
    sessionId?: string
    signal?: AbortSignal
  }
): Promise<PageGenerationResult> {
  const { userId, courseId, fileId, pdfType, totalPages, sessionId, signal } = options

  try {
    // Check abort signal
    if (signal?.aborted) {
      return { success: false, page, error: 'ABORTED' }
    }

    // Update session progress - page started
    if (sessionId) {
      await updateSessionProgress(sessionId, { pageStarted: page })
    }

    // Extract page text
    const { text: pageText } = await extractPageText(pdfBuffer, page)

    if (!pageText || pageText.trim().length < 20) {
      // Skip nearly empty pages
      if (sessionId) {
        await updateSessionProgress(sessionId, { pageCompleted: page })
      }
      return {
        success: true,
        page,
        stickers: [],
      }
    }

    // Check abort signal before API call
    if (signal?.aborted) {
      return { success: false, page, error: 'ABORTED' }
    }

    // Retrieve context (optional enhancement)
    let contextHint = ''
    try {
      const contextResult = await retrieveContextForPage({
        userId,
        courseId,
        fileId,
        currentPage: page,
        pageText,
      })
      if (contextResult.entries.length > 0) {
        contextHint = buildContextHint(contextResult.entries)
      }
    } catch {
      // Silent degradation
    }

    // Build context for the slide
    const typeContext = {
      Lecture: 'lecture slide',
      Homework: 'assignment slide',
      Exam: 'exam slide',
      Other: 'presentation slide',
    }[pdfType]

    const baseSystemMessage = `You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations.

This is a ${typeContext} from a presentation (slide ${page} of ${totalPages}). Provide a single, comprehensive summary covering all key points on the slide.

Your explanation should:
1. Cover all key points on the slide
2. Explain the main concepts in simple terms
3. Provide context and significance
4. Include relevant mathematical formulas in LaTeX when applicable ($...$ for inline, $$...$$ for block)
5. Be thorough but concise (150-400 words)
6. Use proper Markdown formatting (headers, lists, bold/italic)`

    const systemMessage = contextHint
      ? `${baseSystemMessage}\n\n${contextHint}`
      : baseSystemMessage

    const userPrompt = `Please explain this slide:\n\n${pageText}`

    // Call OpenAI with Function Calling
    // This guarantees structured output without JSON parsing issues
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt },
      ],
      tools: [PPT_EXPLANATION_TOOL],
      tool_choice: { type: 'function', function: { name: 'create_slide_explanation' } },
      temperature: 0.7,
      max_tokens: 2000,
    })

    // Check abort signal after API call
    if (signal?.aborted) {
      return { success: false, page, error: 'ABORTED' }
    }

    // Extract function call arguments (OpenAI guarantees this matches our schema)
    const toolCall = completion.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall || toolCall.function.name !== 'create_slide_explanation') {
      if (sessionId) {
        await updateSessionProgress(sessionId, { pageFailed: page })
      }
      return { success: false, page, error: 'AI_NO_FUNCTION_CALL' }
    }

    // Parse function arguments - this is guaranteed to be valid JSON by OpenAI
    let args: { anchorText: string; explanation: string }
    try {
      args = JSON.parse(toolCall.function.arguments)
    } catch (parseError) {
      console.error(`Failed to parse function arguments for page ${page}:`, parseError)
      if (sessionId) {
        await updateSessionProgress(sessionId, { pageFailed: page })
      }
      return { success: false, page, error: 'PARSE_ERROR' }
    }

    // Convert to sticker
    const stickers: GeneratedSticker[] = [{
      page,
      anchorText: String(args.anchorText || '').slice(0, 100),
      contentMarkdown: String(args.explanation || ''),
      pageRange: null,
    }]

    // Update session progress - page completed
    if (sessionId) {
      await updateSessionProgress(sessionId, { pageCompleted: page })
    }

    return {
      success: true,
      page,
      stickers,
    }
  } catch (error) {
    console.error(`Error generating PPT sticker for page ${page}:`, error)

    if (sessionId) {
      await updateSessionProgress(sessionId, { pageFailed: page })
    }

    const errorMessage = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
    return { success: false, page, error: errorMessage }
  }
}

/**
 * Generate stickers for multiple PPT pages
 * Respects concurrency limits via the window manager
 * When saveImmediately is true, saves each sticker to database right after generation
 */
export async function generatePptPdfStickers(
  pdfBuffer: Buffer,
  pages: number[],
  options: {
    userId: string
    courseId: string
    fileId: string
    pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    totalPages: number
    sessionId?: string
    onPageComplete?: (result: PageGenerationResult) => void
    /** Save stickers immediately after each page generation (for progressive display) */
    saveImmediately?: boolean
  }
): Promise<GeneratedSticker[]> {
  const allStickers: GeneratedSticker[] = []

  for (const page of pages) {
    const result = await generatePptPageSticker(pdfBuffer, page, options)

    if (result.success && result.stickers) {
      allStickers.push(...result.stickers)

      // Save stickers immediately for progressive display
      if (options.saveImmediately && result.stickers.length > 0) {
        await saveStickersToDatabase(result.stickers, {
          userId: options.userId,
          courseId: options.courseId,
          fileId: options.fileId,
        })
      }
    }

    if (options.onPageComplete) {
      options.onPageComplete(result)
    }
  }

  return allStickers
}

/**
 * Save generated stickers to database
 */
export async function saveStickersToDatabase(
  stickers: GeneratedSticker[],
  options: {
    userId: string
    courseId: string
    fileId: string
  }
): Promise<string[]> {
  if (stickers.length === 0) {
    return []
  }

  const supabase = createAdminClient()

  const stickersToCreate = stickers.map((s) => ({
    user_id: options.userId,
    course_id: options.courseId,
    file_id: options.fileId,
    type: 'auto' as const,
    page: s.page,
    anchor_text: s.anchorText,
    // PPT stickers use full-page anchor with isFullPage flag
    anchor_rect: {
      rect: { x: 0, y: 0, width: 1, height: 1 },
      isFullPage: true,
    },
    parent_id: null,
    content_markdown: s.contentMarkdown,
    page_range: s.pageRange,
    current_version: 1,
    folded: false,
    depth: 0,
  }))

  const { data, error } = await supabase
    .from('stickers')
    .insert(stickersToCreate)
    .select('id')

  if (error) {
    console.error('Error saving stickers:', error)
    return []
  }

  return data?.map((s) => s.id) || []
}
