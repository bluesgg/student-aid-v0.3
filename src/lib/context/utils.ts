/**
 * Utility functions for context library.
 * Includes word counting, token estimation, batch strategy, and language detection.
 */

import { BATCH_CONFIG, type BatchStrategy } from './types'

/**
 * Estimate word count from text.
 * Uses simple whitespace splitting with CJK character handling.
 */
export function estimateWordCount(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0
  }

  // Count CJK characters (Chinese, Japanese, Korean)
  // Each CJK character is roughly equivalent to one word
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0

  // Remove CJK characters and count remaining words
  const withoutCjk = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, ' ')
  const words = withoutCjk
    .split(/\s+/)
    .filter((word) => word.length > 0)

  return words.length + cjkCount
}

/**
 * Estimate token count from text.
 * Uses a simple heuristic: ~0.75 tokens per word for English,
 * ~1.5 tokens per CJK character.
 */
export function estimateTokenCount(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0
  }

  // Count CJK characters
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  const cjkTokens = Math.ceil(cjkCount * 1.5)

  // Count English words
  const withoutCjk = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, ' ')
  const words = withoutCjk.split(/\s+/).filter((word) => word.length > 0)
  const englishTokens = Math.ceil(words.length * 1.3) // ~1.3 tokens per word

  return cjkTokens + englishTokens
}

/**
 * Detect if text is primarily non-English (requires translation).
 * Returns 'en' for English content, 'non-en' otherwise.
 */
export function detectLanguage(text: string): 'en' | 'non-en' {
  if (!text || typeof text !== 'string') {
    return 'en'
  }

  // Count CJK characters
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0

  // Count total non-whitespace characters
  const totalChars = text.replace(/\s/g, '').length

  if (totalChars === 0) {
    return 'en'
  }

  // If >30% CJK characters, treat as non-English
  if (cjkCount / totalChars > 0.3) {
    return 'non-en'
  }

  return 'en'
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Calculate batch strategy based on PDF content density.
 * Samples first N pages to estimate word density and determine optimal batch size.
 */
export function calculateBatchStrategy(
  totalPages: number,
  sampleWordCount: number,
  sampledPages: number
): BatchStrategy {
  // Calculate average words per page from sample
  const avgWordsPerPage = sampledPages > 0 ? sampleWordCount / sampledPages : 0

  // Estimate total words in PDF
  const estimatedTotalWords = Math.round(avgWordsPerPage * totalPages)

  // Determine words per batch based on density
  const wordsPerBatch = clamp(
    BATCH_CONFIG.targetWordsPerBatch,
    BATCH_CONFIG.minWordsPerBatch,
    BATCH_CONFIG.maxWordsPerBatch
  )

  // Calculate total batches
  const totalBatches = Math.max(1, Math.ceil(estimatedTotalWords / wordsPerBatch))

  return {
    wordsPerBatch,
    totalBatches,
    estimatedTotalWords,
    avgWordsPerPage,
  }
}

/**
 * Calculate retry delay with exponential backoff.
 * Returns delay in milliseconds.
 */
export function calculateRetryDelay(retryCount: number): number {
  const baseDelay = 60_000 // 1 minute
  const maxDelay = 240_000 // 4 minutes

  // Exponential backoff: 1min, 2min, 4min
  const delay = baseDelay * Math.pow(2, retryCount)
  return Math.min(delay, maxDelay)
}

/**
 * Get current month in YYYY-MM format.
 */
export function getCurrentMonthYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Calculate next month's first day (for quota reset date).
 */
export function getNextMonthFirstDay(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

/**
 * Normalize title for deduplication comparison.
 * Lowercases, trims, and removes extra whitespace.
 */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Extract keywords from a question or page text.
 * This is a simple heuristic - the actual keyword extraction uses LLM.
 */
export function extractSimpleKeywords(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return []
  }

  // Simple word extraction (for fallback only)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3) // Skip short words

  // Remove common stop words
  const stopWords = new Set([
    'this', 'that', 'these', 'those', 'what', 'which', 'where', 'when',
    'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should',
    'about', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'because', 'each', 'some', 'such',
  ])

  const keywords = words.filter((word) => !stopWords.has(word))

  // Return unique keywords
  return Array.from(new Set(keywords))
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Validate SHA-256 hash format.
 */
export function isValidSHA256Hash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash)
}

/**
 * Generate a cache key for keyword extraction caching.
 */
export function generateKeywordCacheKey(pageText: string, question?: string): string {
  const combined = `${pageText}|${question || ''}`
  // Simple hash for cache key (not cryptographic)
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `keywords:${Math.abs(hash).toString(16)}`
}
