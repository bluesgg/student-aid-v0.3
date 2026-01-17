/**
 * Text PDF Sticker Generator
 * Generates stickers for text-heavy PDFs using paragraph accumulation.
 * Merges small paragraphs across pages to reach 300-500 word threshold.
 */

import { createAdminClient } from '@/lib/supabase/server'
import {
  extractParagraphs,
  extractFirstSentence,
  type ExtractedParagraph,
} from '@/lib/pdf/paragraph-extractor'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { retrieveContextForPage, buildContextHint } from '@/lib/context'
import { updateSessionProgress } from './window-manager'

// Word count thresholds for accumulation
const MIN_WORD_COUNT = 300
const MAX_WORD_COUNT = 500
const ABSOLUTE_MIN_WORD_COUNT = 100 // For end-of-window remainder

/**
 * Page range for cross-page stickers
 */
export interface PageRange {
  start: { page: number; yStart: number; yEnd: number }
  end: { page: number; yStart: number; yEnd: number }
}

/**
 * Generated sticker with cross-page support
 */
export interface TextPdfSticker {
  page: number // Display page (start page of range)
  anchorText: string
  contentMarkdown: string
  pageRange: PageRange | null
}

/**
 * Accumulator state for paragraph merging
 */
interface Accumulator {
  paragraphs: Array<ExtractedParagraph & { page: number }>
  totalWords: number
  startPage: number
  startY: number
}

/**
 * Build a text prompt for explanation
 */
function buildTextExplanationPrompt(
  text: string,
  pageInfo: string
): string {
  return `Please provide a clear, educational explanation for the following content from ${pageInfo}.

Focus on:
1. The main concept or idea being presented
2. Key definitions or formulas
3. Why this is important for students to understand

Content:
${text}

Provide your explanation in markdown format. Be thorough but concise.`
}

/**
 * Generate explanation for accumulated text
 */
async function generateExplanation(
  text: string,
  pageInfo: string,
  options: {
    userId: string
    courseId: string
    fileId: string
    currentPage: number
    signal?: AbortSignal
  }
): Promise<string | null> {
  const { userId, courseId, fileId, currentPage, signal } = options

  if (signal?.aborted) {
    return null
  }

  // Retrieve context (optional)
  let contextHint = ''
  try {
    const contextResult = await retrieveContextForPage({
      userId,
      courseId,
      fileId,
      currentPage,
      pageText: text,
    })
    if (contextResult.entries.length > 0) {
      contextHint = buildContextHint(contextResult.entries)
    }
  } catch {
    // Silent degradation
  }

  const baseSystemMessage =
    'You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations.'
  const systemMessage = contextHint
    ? `${baseSystemMessage}\n${contextHint}`
    : baseSystemMessage

  const prompt = buildTextExplanationPrompt(text, pageInfo)

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    })

    if (signal?.aborted) {
      return null
    }

    return completion.choices[0]?.message?.content || null
  } catch (error) {
    console.error('Error generating explanation:', error)
    return null
  }
}

/**
 * Flush accumulator - generate sticker from accumulated content
 */
async function flushAccumulator(
  acc: Accumulator,
  options: {
    userId: string
    courseId: string
    fileId: string
    signal?: AbortSignal
  }
): Promise<TextPdfSticker | null> {
  if (acc.paragraphs.length === 0 || acc.totalWords < ABSOLUTE_MIN_WORD_COUNT) {
    return null
  }

  const { userId, courseId, fileId, signal } = options

  // Build text from paragraphs
  const fullText = acc.paragraphs.map((p) => p.text).join('\n\n')

  // Determine page info
  const startPage = acc.paragraphs[0].page
  const endPage = acc.paragraphs[acc.paragraphs.length - 1].page
  const pageInfo =
    startPage === endPage
      ? `page ${startPage}`
      : `pages ${startPage}-${endPage}`

  // Generate explanation
  const explanation = await generateExplanation(fullText, pageInfo, {
    userId,
    courseId,
    fileId,
    currentPage: startPage,
    signal,
  })

  if (!explanation) {
    return null
  }

  // Build sticker
  const firstPara = acc.paragraphs[0]
  const lastPara = acc.paragraphs[acc.paragraphs.length - 1]

  const pageRange: PageRange | null =
    startPage !== endPage
      ? {
          start: {
            page: startPage,
            yStart: firstPara.yStart,
            yEnd: firstPara.yEnd,
          },
          end: {
            page: endPage,
            yStart: lastPara.yStart,
            yEnd: lastPara.yEnd,
          },
        }
      : null

  return {
    page: startPage, // Display on start page
    anchorText: extractFirstSentence(acc.paragraphs[0].text),
    contentMarkdown: explanation,
    pageRange,
  }
}

/**
 * Generate stickers for text PDF pages using paragraph accumulation
 * @param pdfBuffer - PDF file buffer
 * @param pages - Pages to process (should be in order)
 * @param options - Generation options
 * @returns Array of generated stickers
 */
export async function generateTextPdfStickers(
  pdfBuffer: Buffer,
  pages: number[],
  options: {
    userId: string
    courseId: string
    fileId: string
    sessionId?: string
    onPageComplete?: (page: number, stickerCount: number) => void
    signal?: AbortSignal
    /** Save stickers immediately after generation (for progressive display) */
    saveImmediately?: boolean
  }
): Promise<TextPdfSticker[]> {
  const { userId, courseId, fileId, sessionId, onPageComplete, signal, saveImmediately } = options
  const stickers: TextPdfSticker[] = []

  // Accumulator for cross-page paragraphs
  let accumulator: Accumulator = {
    paragraphs: [],
    totalWords: 0,
    startPage: 0,
    startY: 0,
  }

  // Sort pages to ensure sequential processing
  const sortedPages = [...pages].sort((a, b) => a - b)

  for (const page of sortedPages) {
    if (signal?.aborted) {
      break
    }

    // Update session - page started
    if (sessionId) {
      await updateSessionProgress(sessionId, { pageStarted: page })
    }

    // Extract paragraphs from page
    const { paragraphs } = await extractParagraphs(pdfBuffer, page)

    let pageStickers = 0

    for (const para of paragraphs) {
      if (signal?.aborted) {
        break
      }

      // Add paragraph to accumulator
      if (accumulator.paragraphs.length === 0) {
        accumulator.startPage = page
        accumulator.startY = para.yStart
      }

      accumulator.paragraphs.push({ ...para, page })
      accumulator.totalWords += para.wordCount

      // Check if we've reached the target range
      if (accumulator.totalWords >= MIN_WORD_COUNT) {
        // Flush accumulator - generate sticker
        const sticker = await flushAccumulator(accumulator, {
          userId,
          courseId,
          fileId,
          signal,
        })

        if (sticker) {
          stickers.push(sticker)
          pageStickers++

          // Save sticker immediately for progressive display
          if (saveImmediately) {
            await saveTextStickersToDatabase([sticker], {
              userId,
              courseId,
              fileId,
            })
          }
        }

        // Reset accumulator
        accumulator = {
          paragraphs: [],
          totalWords: 0,
          startPage: 0,
          startY: 0,
        }
      }
    }

    // Update session - page processed
    if (sessionId) {
      await updateSessionProgress(sessionId, { pageCompleted: page })
    }

    if (onPageComplete) {
      onPageComplete(page, pageStickers)
    }
  }

  // Handle remaining content at end of window
  if (accumulator.paragraphs.length > 0 && !signal?.aborted) {
    const sticker = await flushAccumulator(accumulator, {
      userId,
      courseId,
      fileId,
      signal,
    })

    if (sticker) {
      stickers.push(sticker)

      // Save final sticker immediately for progressive display
      if (saveImmediately) {
        await saveTextStickersToDatabase([sticker], {
          userId,
          courseId,
          fileId,
        })
      }
    }
  }

  return stickers
}

/**
 * Save text PDF stickers to database
 */
export async function saveTextStickersToDatabase(
  stickers: TextPdfSticker[],
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
    anchor_rect: null,
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
    console.error('Error saving text stickers:', error)
    return []
  }

  return data?.map((s) => s.id) || []
}
