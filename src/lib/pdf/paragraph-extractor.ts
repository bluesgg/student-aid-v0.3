/**
 * Paragraph Extraction Module
 * Extracts paragraphs from PDF pages with coordinates for cross-page sticker support.
 * Used by text-pdf-generator for paragraph accumulation strategy.
 */

import { countWords } from './page-metadata'

// pdf-parse for text extraction with coordinates
const pdf = require('pdf-parse') as (
  buffer: Buffer,
  options?: {
    pagerender?: (pageData: PageData) => Promise<string>
  }
) => Promise<{ numpages: number; text: string }>

interface PageData {
  getTextContent: () => Promise<TextContent>
}

interface TextItem {
  str: string
  transform?: number[] // [scaleX, skewX, skewY, scaleY, translateX, translateY]
  width?: number
  height?: number
}

interface TextContent {
  items: TextItem[]
}

/**
 * Extracted paragraph with position information
 */
export interface ExtractedParagraph {
  text: string
  wordCount: number
  yStart: number // Y coordinate of top of paragraph
  yEnd: number // Y coordinate of bottom of paragraph
  lineCount: number
}

/**
 * Result of paragraph extraction from a page
 */
export interface PageParagraphs {
  pageNumber: number
  paragraphs: ExtractedParagraph[]
  totalWordCount: number
}

// Vertical proximity threshold for grouping text items into lines
const LINE_PROXIMITY_THRESHOLD = 5 // pixels

// Gap threshold for detecting paragraph breaks
const PARAGRAPH_GAP_THRESHOLD = 15 // pixels

/**
 * Group text items by their Y coordinate (form lines)
 */
function groupIntoLines(
  items: TextItem[]
): Array<{ y: number; text: string; items: TextItem[] }> {
  if (items.length === 0) return []

  // Sort by Y coordinate (descending - PDF coordinates have Y from bottom)
  const sortedItems = [...items].sort((a, b) => {
    const yA = a.transform?.[5] ?? 0
    const yB = b.transform?.[5] ?? 0
    return yB - yA // Higher Y first (top of page)
  })

  const lines: Array<{ y: number; text: string; items: TextItem[] }> = []
  let currentLine: { y: number; text: string; items: TextItem[] } | null = null

  for (const item of sortedItems) {
    const y = item.transform?.[5] ?? 0

    if (!currentLine) {
      currentLine = { y, text: item.str, items: [item] }
    } else if (Math.abs(currentLine.y - y) <= LINE_PROXIMITY_THRESHOLD) {
      // Same line - append
      currentLine.text += ' ' + item.str
      currentLine.items.push(item)
    } else {
      // New line
      lines.push(currentLine)
      currentLine = { y, text: item.str, items: [item] }
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  // Sort lines by Y descending (top to bottom)
  return lines.sort((a, b) => b.y - a.y)
}

/**
 * Group lines into paragraphs based on vertical gaps
 */
function groupIntoParagraphs(
  lines: Array<{ y: number; text: string; items: TextItem[] }>
): ExtractedParagraph[] {
  if (lines.length === 0) return []

  const paragraphs: ExtractedParagraph[] = []
  let currentParagraph: {
    lines: Array<{ y: number; text: string }>
    yStart: number
    yEnd: number
  } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!currentParagraph) {
      currentParagraph = {
        lines: [{ y: line.y, text: line.text }],
        yStart: line.y,
        yEnd: line.y,
      }
    } else {
      // Check gap between current line and previous line
      const gap = currentParagraph.yEnd - line.y

      if (gap > PARAGRAPH_GAP_THRESHOLD) {
        // New paragraph - save current and start new
        const paragraphText = currentParagraph.lines.map((l) => l.text).join(' ')
        paragraphs.push({
          text: paragraphText.trim(),
          wordCount: countWords(paragraphText),
          yStart: currentParagraph.yStart,
          yEnd: currentParagraph.yEnd,
          lineCount: currentParagraph.lines.length,
        })

        currentParagraph = {
          lines: [{ y: line.y, text: line.text }],
          yStart: line.y,
          yEnd: line.y,
        }
      } else {
        // Same paragraph - append
        currentParagraph.lines.push({ y: line.y, text: line.text })
        currentParagraph.yEnd = line.y
      }
    }
  }

  // Don't forget last paragraph
  if (currentParagraph && currentParagraph.lines.length > 0) {
    const paragraphText = currentParagraph.lines.map((l) => l.text).join(' ')
    paragraphs.push({
      text: paragraphText.trim(),
      wordCount: countWords(paragraphText),
      yStart: currentParagraph.yStart,
      yEnd: currentParagraph.yEnd,
      lineCount: currentParagraph.lines.length,
    })
  }

  // Filter out empty paragraphs
  return paragraphs.filter((p) => p.text.length > 0 && p.wordCount > 0)
}

/**
 * Extract paragraphs from a specific PDF page with coordinate information.
 * Groups text items into lines, then lines into paragraphs based on vertical gaps.
 *
 * @param buffer - PDF file as Buffer
 * @param pageNumber - 1-indexed page number
 * @returns PageParagraphs with array of paragraphs and their positions
 */
export async function extractParagraphs(
  buffer: Buffer,
  pageNumber: number
): Promise<PageParagraphs> {
  try {
    let textItems: TextItem[] = []
    let currentPage = 0

    const options = {
      pagerender: function (pageData: PageData) {
        currentPage++
        if (currentPage === pageNumber) {
          return pageData.getTextContent().then(function (textContent) {
            textItems = textContent.items
            return textContent.items.map((item) => item.str).join(' ')
          })
        }
        return Promise.resolve('')
      },
    }

    await pdf(buffer, options)

    // Group into lines, then paragraphs
    const lines = groupIntoLines(textItems)
    const paragraphs = groupIntoParagraphs(lines)

    const totalWordCount = paragraphs.reduce((sum, p) => sum + p.wordCount, 0)

    return {
      pageNumber,
      paragraphs,
      totalWordCount,
    }
  } catch (error) {
    console.error(`Error extracting paragraphs from page ${pageNumber}:`, error)
    return {
      pageNumber,
      paragraphs: [],
      totalWordCount: 0,
    }
  }
}

/**
 * Extract paragraphs from multiple pages.
 * Used for window-based generation.
 *
 * @param buffer - PDF file as Buffer
 * @param startPage - First page (1-indexed)
 * @param endPage - Last page (1-indexed, inclusive)
 * @returns Array of PageParagraphs
 */
export async function extractParagraphsFromRange(
  buffer: Buffer,
  startPage: number,
  endPage: number
): Promise<PageParagraphs[]> {
  const results: PageParagraphs[] = []

  for (let page = startPage; page <= endPage; page++) {
    const pageParagraphs = await extractParagraphs(buffer, page)
    results.push(pageParagraphs)
  }

  return results
}

/**
 * Get the first sentence from a text (for anchor_text)
 * @param text - Full paragraph text
 * @returns First sentence or first 50 characters
 */
export function extractFirstSentence(text: string): string {
  // Try to find first sentence ending
  const sentenceEndings = ['. ', '。', '? ', '？', '! ', '！']

  let firstEnd = text.length
  for (const ending of sentenceEndings) {
    const idx = text.indexOf(ending)
    if (idx !== -1 && idx < firstEnd) {
      firstEnd = idx + ending.length
    }
  }

  // Cap at 100 characters
  const sentence = text.substring(0, Math.min(firstEnd, 100)).trim()

  // If still too long, truncate with ellipsis
  if (sentence.length > 80) {
    return sentence.substring(0, 77) + '...'
  }

  return sentence
}

/**
 * Merge text from multiple paragraphs (for cross-page stickers)
 * @param paragraphs - Array of paragraphs to merge
 * @returns Merged text with paragraph breaks
 */
export function mergeParagraphText(paragraphs: ExtractedParagraph[]): string {
  return paragraphs.map((p) => p.text).join('\n\n')
}

/**
 * Export for testing
 */
export const _testing = {
  groupIntoLines,
  groupIntoParagraphs,
}
