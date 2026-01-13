/**
 * LLM-based keyword extraction for context retrieval.
 * Uses gpt-4o-mini for cost efficiency with in-memory caching.
 */

import { getOpenAIClient } from '@/lib/openai/client'
import { generateKeywordCacheKey } from './utils'

/**
 * Model for keyword extraction (cost-efficient)
 */
const KEYWORD_MODEL = 'gpt-4o-mini'

/**
 * System prompt for keyword extraction
 */
const KEYWORD_SYSTEM_PROMPT = `You are a keyword extraction expert for academic content. Your task is to identify 3-8 relevant keywords from the given text that would be useful for finding related definitions, formulas, theorems, and concepts.

Guidelines:
- Focus on academic/technical terms
- Include both broad concepts and specific terms
- Prioritize nouns and noun phrases
- Include mathematical concepts when present
- Keep keywords in English

Return keywords as a JSON array of strings.

Example input: "We will now compute the derivative using the chain rule and the product rule."
Example output: ["derivative", "chain rule", "product rule", "differentiation", "calculus"]`

/**
 * In-memory cache for extracted keywords.
 * TTL: 5 minutes (cleared on process restart)
 */
interface CacheEntry {
  keywords: string[]
  timestamp: number
}

const keywordCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Cache statistics for monitoring
 */
interface CacheStats {
  hits: number
  misses: number
  lastResetTime: number
}

const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  lastResetTime: Date.now(),
}

/**
 * Clean up expired cache entries
 */
function cleanupCache(): void {
  const now = Date.now()
  const entries = Array.from(keywordCache.entries())
  for (const [key, entry] of entries) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      keywordCache.delete(key)
    }
  }
}

/**
 * Extract keywords from text using LLM with caching.
 *
 * @param pageText - The current page text (optional)
 * @param question - User question if in Q&A mode (optional)
 * @returns Array of extracted keywords
 */
export async function extractKeywords(
  pageText?: string,
  question?: string
): Promise<string[]> {
  // Cleanup old entries periodically
  if (keywordCache.size > 1000) {
    cleanupCache()
  }

  // Generate cache key
  const combinedText = [pageText || '', question || ''].filter(Boolean).join('\n\n')
  if (!combinedText.trim()) {
    return []
  }

  const cacheKey = generateKeywordCacheKey(pageText || '', question)

  // Check cache
  const cached = keywordCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    cacheStats.hits++
    return cached.keywords
  }

  // Cache miss
  cacheStats.misses++

  try {
    const openai = getOpenAIClient()

    // Truncate input to avoid excessive token usage
    const truncatedText = combinedText.slice(0, 4000)

    const response = await openai.chat.completions.create({
      model: KEYWORD_MODEL,
      messages: [
        { role: 'system', content: KEYWORD_SYSTEM_PROMPT },
        {
          role: 'user',
          content: question
            ? `Page text:\n${truncatedText}\n\nUser question: ${question}\n\nExtract keywords that would help find relevant context for answering this question.`
            : `Extract keywords from this academic content:\n\n${truncatedText}`
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return fallbackKeywords(combinedText)
    }

    // Parse JSON response
    let keywords: string[] = []
    try {
      const parsed = JSON.parse(content)
      // Handle both { keywords: [...] } and direct [...] formats
      if (Array.isArray(parsed)) {
        keywords = parsed.filter((k): k is string => typeof k === 'string')
      } else if (parsed.keywords && Array.isArray(parsed.keywords)) {
        keywords = (parsed.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
      }
    } catch {
      // If JSON parsing fails, try to extract keywords from plain text
      keywords = fallbackKeywords(combinedText)
    }

    // Normalize and limit keywords
    keywords = keywords
      .map((k) => k.toLowerCase().trim())
      .filter((k) => k.length > 2 && k.length < 100)
      .slice(0, 10)

    // Cache the result
    keywordCache.set(cacheKey, {
      keywords,
      timestamp: Date.now(),
    })

    return keywords
  } catch (error) {
    console.error('Keyword extraction failed:', error)
    // Return fallback keywords on error
    return fallbackKeywords(combinedText)
  }
}

/**
 * Fallback keyword extraction using simple heuristics.
 * Used when LLM extraction fails.
 */
function fallbackKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
    'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'but',
    'and', 'or', 'if', 'because', 'as', 'until', 'while', 'of', 'at',
    'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up',
    'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  ])

  // Extract words (3+ chars, not stop words)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))

  // Count frequency and get top keywords
  const frequency = new Map<string, number>()
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1)
  }

  // Sort by frequency and return top 8
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word)
}

/**
 * Clear the keyword cache (for testing)
 */
export function clearKeywordCache(): void {
  keywordCache.clear()
}

/**
 * Cache statistics result type
 */
export interface KeywordCacheStatsResult {
  size: number
  hits: number
  misses: number
  hitRate: number
  totalRequests: number
  uptimeMs: number
}

/**
 * Get cache stats (for monitoring)
 */
export function getKeywordCacheStats(): KeywordCacheStatsResult {
  cleanupCache()

  const totalRequests = cacheStats.hits + cacheStats.misses
  const hitRate = totalRequests > 0 ? cacheStats.hits / totalRequests : 0

  return {
    size: keywordCache.size,
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate,
    totalRequests,
    uptimeMs: Date.now() - cacheStats.lastResetTime,
  }
}

/**
 * Reset cache stats (for testing/monitoring windows)
 */
export function resetCacheStats(): void {
  cacheStats.hits = 0
  cacheStats.misses = 0
  cacheStats.lastResetTime = Date.now()
}

/**
 * Log cache stats to console (for monitoring)
 */
export function logCacheStats(): void {
  const stats = getKeywordCacheStats()
  console.log('[KeywordCache] Stats:', {
    size: stats.size,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
    totalRequests: stats.totalRequests,
    uptimeMinutes: Math.floor(stats.uptimeMs / 60000),
  })
}
