/**
 * Page-level metadata extraction and effective_mode determination.
 * Used for determining cache keys before lookup.
 */

import { createClient } from '@/lib/supabase/server'

// Re-export pdf-parse types we need
const pdf = require('pdf-parse') as (
  buffer: Buffer,
  options?: {
    pagerender?: (pageData: PageData) => Promise<string>
  }
) => Promise<{ numpages: number; text: string }>

interface PageData {
  getTextContent: () => Promise<{ items: Array<{ str: string }> }>
  getOperatorList?: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>
}

/**
 * Page metadata result from lightweight detection
 */
export interface PageMetadata {
  hasImages: boolean
  imagesCount: number
  wordCount: number
  isScanned?: boolean
}

/**
 * Effective mode for sticker generation
 */
export type EffectiveMode = 'text_only' | 'with_images'

/**
 * Count words in a text string.
 * Handles both English (space-separated) and CJK (character-based) text.
 */
export function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0
  }

  // Remove extra whitespace
  const normalized = text.replace(/\s+/g, ' ').trim()

  // Count CJK characters (Chinese, Japanese, Korean)
  const cjkChars = normalized.match(/[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g)
  const cjkCount = cjkChars ? cjkChars.length : 0

  // Count English words (space-separated, excluding CJK)
  const nonCjkText = normalized.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g, ' ')
  const englishWords = nonCjkText.split(/\s+/).filter((word) => word.length > 0)
  const englishCount = englishWords.length

  // CJK: roughly 1.5-2 characters per "word" equivalent
  // For simplicity, count each CJK character as 0.5 words
  return Math.round(englishCount + cjkCount * 0.5)
}

/**
 * Lightweight image detection for a specific PDF page.
 * This is a fast check (<100ms) that doesn't extract actual images.
 * 
 * Note: This is a simplified implementation. Full image detection
 * would require parsing PDF operators (BI, ID, Do for XObjects).
 * For MVP, we check if the page has very little text (likely image-heavy).
 * 
 * @param buffer - PDF file as Buffer
 * @param pageNumber - 1-indexed page number
 * @returns PageMetadata with hasImages, imagesCount, wordCount
 */
export async function detectPageMetadata(
  buffer: Buffer,
  pageNumber: number
): Promise<PageMetadata> {
  try {
    let pageText = ''
    let currentPage = 0

    const options = {
      pagerender: function (pageData: PageData) {
        currentPage++
        if (currentPage === pageNumber) {
          return pageData.getTextContent().then(function (textContent) {
            pageText = textContent.items.map((item) => item.str).join(' ')
            return pageText
          })
        }
        return Promise.resolve('')
      },
    }

    await pdf(buffer, options)

    const wordCount = countWords(pageText)

    // Heuristic: If page has very few words (<20), it's likely image-heavy or scanned
    // This is a simplified check; real implementation would parse PDF operators
    const hasImages = wordCount < 20
    const isScanned = wordCount < 5

    return {
      hasImages,
      imagesCount: hasImages ? 1 : 0, // Simplified: assume 1 image if image-heavy
      wordCount,
      isScanned,
    }
  } catch (error) {
    console.error('Error detecting page metadata:', error)
    // Default to text_only on error
    return {
      hasImages: false,
      imagesCount: 0,
      wordCount: 0,
      isScanned: false,
    }
  }
}

/**
 * Get or create page metadata from database.
 * Caches metadata in canonical_page_metadata table.
 * 
 * @param pdfHash - SHA-256 hash of PDF binary content
 * @param page - 1-indexed page number
 * @param pdfBuffer - Optional PDF buffer for detection if not cached
 * @returns PageMetadata
 */
export async function getOrCreatePageMetadata(
  pdfHash: string,
  page: number,
  pdfBuffer?: Buffer
): Promise<PageMetadata> {
  const supabase = createClient()

  // Try to get from cache
  const { data: cached } = await supabase
    .from('canonical_page_metadata')
    .select('has_images, images_count, word_count, is_scanned')
    .eq('pdf_hash', pdfHash)
    .eq('page', page)
    .single()

  if (cached) {
    return {
      hasImages: cached.has_images,
      imagesCount: cached.images_count ?? 0,
      wordCount: cached.word_count ?? 0,
      isScanned: cached.is_scanned ?? undefined,
    }
  }

  // If not cached and no buffer provided, return default
  if (!pdfBuffer) {
    return {
      hasImages: false,
      imagesCount: 0,
      wordCount: 0,
    }
  }

  // Detect metadata from PDF
  const metadata = await detectPageMetadata(pdfBuffer, page)

  // Cache in database (upsert)
  await supabase.from('canonical_page_metadata').upsert(
    {
      pdf_hash: pdfHash,
      page,
      has_images: metadata.hasImages,
      images_count: metadata.imagesCount,
      word_count: metadata.wordCount,
      is_scanned: metadata.isScanned,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'pdf_hash,page',
    }
  )

  return metadata
}

/**
 * Determine effective mode for sticker generation.
 * Must be called BEFORE cache lookup to ensure correct cache key.
 * 
 * @param pdfHash - SHA-256 hash of PDF binary content
 * @param page - 1-indexed page number
 * @param pdfBuffer - Optional PDF buffer for detection if not cached
 * @returns EffectiveMode ('text_only' | 'with_images')
 */
export async function determineEffectiveMode(
  pdfHash: string,
  page: number,
  pdfBuffer?: Buffer
): Promise<EffectiveMode> {
  const metadata = await getOrCreatePageMetadata(pdfHash, page, pdfBuffer)
  return metadata.hasImages ? 'with_images' : 'text_only'
}

/**
 * Calculate target sticker count based on word count.
 * Implements word-count-based sticker generation logic.
 * 
 * @param wordCount - Number of words on the page
 * @returns Target number of stickers to generate
 */
export function calculateTargetStickerCount(wordCount: number): {
  min: number
  max: number
  target: number
} {
  if (wordCount <= 50) {
    // Nearly empty page - minimum 1 sticker
    return { min: 1, max: 1, target: 1 }
  } else if (wordCount <= 150) {
    // Short page - 1 sticker
    return { min: 1, max: 1, target: 1 }
  } else if (wordCount <= 300) {
    // Medium page - 2 stickers
    return { min: 2, max: 2, target: 2 }
  } else if (wordCount <= 500) {
    // Long page - 3-4 stickers
    return { min: 3, max: 4, target: 3 }
  } else {
    // Very long page - up to 8 stickers based on paragraphs
    // Roughly 1 sticker per 100 words, max 8
    const calculated = Math.min(8, Math.ceil(wordCount / 100))
    return { min: 4, max: 8, target: calculated }
  }
}

/**
 * Calculate dynamic expiration time for generation job.
 * Formula: 60s base + 25s per image + 15s per text chunk, max 300s
 * 
 * @param imagesCount - Number of images on the page
 * @param estimatedChunks - Estimated number of text chunks
 * @returns Expiration time in seconds
 */
export function calculateExpirationSeconds(
  imagesCount: number,
  estimatedChunks: number = 1
): number {
  const BASE_SECONDS = 60
  const SECONDS_PER_IMAGE = 25
  const SECONDS_PER_CHUNK = 15
  const MAX_SECONDS = 300

  const calculated = BASE_SECONDS + imagesCount * SECONDS_PER_IMAGE + estimatedChunks * SECONDS_PER_CHUNK

  return Math.min(MAX_SECONDS, calculated)
}
