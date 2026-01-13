/**
 * Context retrieval from the shared context library.
 * Queries database for relevant context entries based on keywords.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { extractKeywords, getKeywordCacheStats } from './keyword-extraction'
import { estimateTokenCount } from './utils'
import { recordMetric, recordRetrievalLatency } from './metrics'
import {
  RETRIEVAL_CONFIG,
  PRIORITY_SCORES,
  type ContextEntry,
  type ContextRetrievalParams,
  type ContextRetrievalResult,
} from './types'

/**
 * Counter for periodic cache stats logging
 */
let retrievalCounter = 0
const LOG_INTERVAL = 100 // Log cache stats every 100 retrievals

/**
 * Log cache stats periodically
 */
function maybeLogCacheStats(): void {
  retrievalCounter++
  if (retrievalCounter % LOG_INTERVAL === 0) {
    const stats = getKeywordCacheStats()
    console.log('[ContextRetrieval] Keyword cache stats at retrieval #', retrievalCounter, {
      size: stats.size,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
      totalRequests: stats.totalRequests,
    })
  }
}

/**
 * Database row type for context entries
 */
interface ContextEntryRow {
  id: string
  pdf_hash: string
  type: string
  title: string
  content: string
  source_page: number
  keywords: string[]
  quality_score: number
  language: string
  extraction_version: number
  created_at: string
}

/**
 * Convert database row to ContextEntry type
 */
function rowToContextEntry(row: ContextEntryRow): ContextEntry {
  return {
    id: row.id,
    pdfHash: row.pdf_hash,
    type: row.type as ContextEntry['type'],
    title: row.title,
    content: row.content,
    sourcePage: row.source_page,
    keywords: row.keywords,
    qualityScore: row.quality_score,
    language: row.language,
    extractionVersion: row.extraction_version,
    createdAt: row.created_at,
  }
}

/**
 * Calculate priority score for a context entry.
 * Higher score = more relevant.
 */
function calculatePriorityScore(
  entry: ContextEntryRow,
  currentFileId: string,
  fileIdToHashMap: Map<string, string>
): number {
  let score = 0

  // Base score from quality
  score += entry.quality_score * 10

  // Type bonus
  const typeBonus = PRIORITY_SCORES.byType[entry.type as keyof typeof PRIORITY_SCORES.byType] || 0
  score += typeBonus

  // Source bonus: current PDF gets highest priority
  const currentPdfHash = fileIdToHashMap.get(currentFileId)
  if (currentPdfHash && entry.pdf_hash === currentPdfHash) {
    score += PRIORITY_SCORES.currentPdf
  } else {
    // Same course but different file
    score += PRIORITY_SCORES.sameCourse
  }

  return score
}

/**
 * Apply token budget to entries.
 * Returns entries that fit within the token limit.
 */
function applyTokenBudget(
  entries: ContextEntry[],
  maxTokens: number
): { entries: ContextEntry[]; totalTokens: number } {
  const result: ContextEntry[] = []
  let totalTokens = 0

  for (const entry of entries) {
    // Estimate tokens for this entry (title + content)
    const entryTokens = estimateTokenCount(`${entry.title}: ${entry.content}`)

    if (totalTokens + entryTokens > maxTokens) {
      // Stop if adding this entry would exceed budget
      break
    }

    result.push(entry)
    totalTokens += entryTokens
  }

  return { entries: result, totalTokens }
}

/**
 * Retrieve relevant context entries for AI enhancement.
 *
 * Strategy:
 * 1. Extract keywords from current page text and optional question
 * 2. Query database for matching entries within user's course scope
 * 3. Rank by priority (current PDF > same course, type bonus, quality)
 * 4. Apply token budget and return top entries
 */
export async function retrieveContext(
  params: ContextRetrievalParams
): Promise<ContextRetrievalResult> {
  const startTime = Date.now()

  const { userId, courseId, fileId, currentPage, query } = params

  try {
    // Get page text for keyword extraction (passed separately from caller)
    // For now we'll use the query or empty string
    const keywords = await extractKeywords(undefined, query)

    if (keywords.length === 0) {
      return {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: Date.now() - startTime,
      }
    }

    const supabase = createAdminClient()

    // Step 1: Get all files in this course for the user (to build scope)
    const { data: scopeData, error: scopeError } = await supabase
      .from('user_context_scope')
      .select('file_id, pdf_hash')
      .eq('user_id', userId)
      .eq('course_id', courseId)

    if (scopeError || !scopeData || scopeData.length === 0) {
      return {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: Date.now() - startTime,
      }
    }

    // Build file ID to hash map
    const fileIdToHashMap = new Map<string, string>()
    const pdfHashes = new Set<string>()
    for (const scope of scopeData) {
      fileIdToHashMap.set(scope.file_id, scope.pdf_hash)
      pdfHashes.add(scope.pdf_hash)
    }

    // Step 2: Query context entries matching keywords
    // Using GIN index for keyword array overlap
    const pdfHashArray = Array.from(pdfHashes)

    // Build keyword patterns for ILIKE matching on title
    const keywordPatterns = keywords.map((k) => `%${k}%`)

    const { data: entriesData, error: entriesError } = await supabase
      .from('pdf_context_entries')
      .select('*')
      .in('pdf_hash', pdfHashArray)
      .gte('quality_score', RETRIEVAL_CONFIG.minQualityScore)
      .or(
        // Match on keywords array OR title contains keyword
        `keywords.ov.{${keywords.join(',')}},${keywordPatterns.map((p) => `title.ilike.${p}`).join(',')}`
      )
      .limit(100) // Get more than needed for ranking

    if (entriesError) {
      console.error('Context retrieval query error:', entriesError)
      return {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: Date.now() - startTime,
      }
    }

    if (!entriesData || entriesData.length === 0) {
      return {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: Date.now() - startTime,
      }
    }

    // Step 3: Calculate priority scores and sort
    const scoredEntries = entriesData
      .map((row) => ({
        row: row as ContextEntryRow,
        score: calculatePriorityScore(row as ContextEntryRow, fileId, fileIdToHashMap),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RETRIEVAL_CONFIG.maxEntries)
      .map(({ row }) => rowToContextEntry(row))

    // Step 4: Apply token budget
    const { entries, totalTokens } = applyTokenBudget(
      scoredEntries,
      RETRIEVAL_CONFIG.maxTokens
    )

    return {
      entries,
      totalTokens,
      retrievalTimeMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('Context retrieval failed:', error)
    return {
      entries: [],
      totalTokens: 0,
      retrievalTimeMs: Date.now() - startTime,
    }
  }
}

/**
 * Retrieve context with page text as additional context.
 * This is the primary function to use from AI endpoints.
 */
export async function retrieveContextForPage(params: {
  userId: string
  courseId: string
  fileId: string
  currentPage: number
  pageText: string
  question?: string
}): Promise<ContextRetrievalResult> {
  const startTime = Date.now()

  const { userId, courseId, fileId, currentPage, pageText, question } = params

  try {
    // Extract keywords from both page text and optional question
    const keywords = await extractKeywords(pageText, question)

    if (keywords.length === 0) {
      return {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: Date.now() - startTime,
      }
    }

    const supabase = createAdminClient()

    // Get all files in this course for the user (to build scope)
    const { data: scopeData, error: scopeError } = await supabase
      .from('user_context_scope')
      .select('file_id, pdf_hash')
      .eq('user_id', userId)
      .eq('course_id', courseId)

    if (scopeError || !scopeData || scopeData.length === 0) {
      return {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: Date.now() - startTime,
      }
    }

    // Build file ID to hash map
    const fileIdToHashMap = new Map<string, string>()
    const pdfHashes = new Set<string>()
    for (const scope of scopeData) {
      fileIdToHashMap.set(scope.file_id, scope.pdf_hash)
      pdfHashes.add(scope.pdf_hash)
    }

    const pdfHashArray = Array.from(pdfHashes)

    // Query using keyword overlap
    // Note: Supabase's .overlaps() doesn't work well with text arrays
    // So we use a raw filter approach with multiple OR conditions
    const { data: entriesData, error: entriesError } = await supabase
      .from('pdf_context_entries')
      .select('*')
      .in('pdf_hash', pdfHashArray)
      .gte('quality_score', RETRIEVAL_CONFIG.minQualityScore)
      .overlaps('keywords', keywords)
      .limit(100)

    if (entriesError) {
      console.error('Context retrieval query error:', entriesError)
      // Try fallback query without keyword overlap
      return await fallbackRetrievalByTitle(
        supabase,
        pdfHashArray,
        keywords,
        fileId,
        fileIdToHashMap,
        startTime
      )
    }

    if (!entriesData || entriesData.length === 0) {
      // Try fallback query on title
      return await fallbackRetrievalByTitle(
        supabase,
        pdfHashArray,
        keywords,
        fileId,
        fileIdToHashMap,
        startTime
      )
    }

    // Calculate priority scores and sort
    const scoredEntries = entriesData
      .map((row) => ({
        row: row as ContextEntryRow,
        score: calculatePriorityScore(row as ContextEntryRow, fileId, fileIdToHashMap),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RETRIEVAL_CONFIG.maxEntries)
      .map(({ row }) => rowToContextEntry(row))

    // Apply token budget
    const { entries, totalTokens } = applyTokenBudget(
      scoredEntries,
      RETRIEVAL_CONFIG.maxTokens
    )

    // Log cache stats periodically
    maybeLogCacheStats()

    const retrievalTimeMs = Date.now() - startTime

    // Record metrics (fire and forget)
    recordMetric('retrieval_calls').catch(() => {})
    recordRetrievalLatency(retrievalTimeMs).catch(() => {})

    return {
      entries,
      totalTokens,
      retrievalTimeMs,
    }
  } catch (error) {
    console.error('Context retrieval failed:', error)
    // Still log cache stats on error
    maybeLogCacheStats()

    const retrievalTimeMs = Date.now() - startTime

    // Record metrics even on error
    recordMetric('retrieval_calls').catch(() => {})
    recordRetrievalLatency(retrievalTimeMs).catch(() => {})

    return {
      entries: [],
      totalTokens: 0,
      retrievalTimeMs,
    }
  }
}

/**
 * Fallback retrieval using title matching when keyword overlap fails.
 */
async function fallbackRetrievalByTitle(
  supabase: ReturnType<typeof createAdminClient>,
  pdfHashes: string[],
  keywords: string[],
  fileId: string,
  fileIdToHashMap: Map<string, string>,
  startTime: number
): Promise<ContextRetrievalResult> {
  try {
    // Try to match keywords against title using text search
    const searchQuery = keywords.join(' | ')

    const { data: entriesData, error: entriesError } = await supabase
      .from('pdf_context_entries')
      .select('*')
      .in('pdf_hash', pdfHashes)
      .gte('quality_score', RETRIEVAL_CONFIG.minQualityScore)
      .textSearch('title', searchQuery, { type: 'websearch' })
      .limit(50)

    if (entriesError || !entriesData || entriesData.length === 0) {
      return {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: Date.now() - startTime,
      }
    }

    // Calculate priority scores and sort
    const scoredEntries = entriesData
      .map((row) => ({
        row: row as ContextEntryRow,
        score: calculatePriorityScore(row as ContextEntryRow, fileId, fileIdToHashMap),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RETRIEVAL_CONFIG.maxEntries)
      .map(({ row }) => rowToContextEntry(row))

    // Apply token budget
    const { entries, totalTokens } = applyTokenBudget(
      scoredEntries,
      RETRIEVAL_CONFIG.maxTokens
    )

    return {
      entries,
      totalTokens,
      retrievalTimeMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('Fallback retrieval failed:', error)
    return {
      entries: [],
      totalTokens: 0,
      retrievalTimeMs: Date.now() - startTime,
    }
  }
}
