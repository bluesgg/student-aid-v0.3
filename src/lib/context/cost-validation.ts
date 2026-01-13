/**
 * Cost validation and monitoring utilities for context extraction.
 * Tracks API costs, validates budget compliance, and provides cost analytics.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { estimateTokenCount } from './utils'

/**
 * OpenAI pricing (as of 2024)
 * Using gpt-4o-mini for cost efficiency
 */
const PRICING = {
  'gpt-4o-mini': {
    input: 0.000150 / 1000, // $0.15 per 1M input tokens
    output: 0.000600 / 1000, // $0.60 per 1M output tokens
  },
}

/**
 * Cost targets from proposal
 */
export const COST_TARGETS = {
  /** Target cost per 100-page textbook extraction */
  extractionPer100Pages: 0.03,

  /** Target cost per keyword extraction call (with caching) */
  keywordExtractionPerCall: 0.0001,

  /** Target monthly cost for 1000 active users */
  monthlyPer1000Users: 100,

  /** Hard ceiling monthly cost for 1000 users */
  monthlyPer1000UsersMax: 150,

  /** Target cache hit rate for common PDFs */
  pdfCacheHitRate: 0.90, // 90%

  /** Target keyword cache hit rate */
  keywordCacheHitRate: 0.70, // 70%

  /** Translation cost penalty (acceptable) */
  translationPenalty: 0.05, // 5% increase
}

/**
 * Cost estimation for extraction
 */
export interface ExtractionCostEstimate {
  inputTokens: number
  outputTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  costPer100Pages: number
}

/**
 * Estimate cost for extracting a PDF
 */
export function estimateExtractionCost(params: {
  totalPages: number
  wordsPerPage: number
  outputEntriesPerBatch: number
  wordsPerEntry: number
}): ExtractionCostEstimate {
  const { totalPages, wordsPerPage, outputEntriesPerBatch, wordsPerEntry } = params

  const totalWords = totalPages * wordsPerPage
  const batchSize = 4000 // Target words per batch
  const batchCount = Math.ceil(totalWords / batchSize)

  // Input tokens: batch text + system prompt (~500 tokens)
  const inputTokensPerBatch = estimateTokenCount('x '.repeat(batchSize)) + 500
  const totalInputTokens = inputTokensPerBatch * batchCount

  // Output tokens: entries * words per entry
  const outputTokensPerBatch = outputEntriesPerBatch * estimateTokenCount('x '.repeat(wordsPerEntry))
  const totalOutputTokens = outputTokensPerBatch * batchCount

  // Calculate costs
  const inputCost = totalInputTokens * PRICING['gpt-4o-mini'].input
  const outputCost = totalOutputTokens * PRICING['gpt-4o-mini'].output
  const totalCost = inputCost + outputCost

  // Normalize to 100 pages
  const costPer100Pages = (totalCost / totalPages) * 100

  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    inputCost,
    outputCost,
    totalCost,
    costPer100Pages,
  }
}

/**
 * Estimate cost for keyword extraction
 */
export function estimateKeywordCost(params: {
  textLength: number
  cacheHitRate: number
}): { costPerCall: number; averageCostWithCache: number } {
  const { textLength, cacheHitRate } = params

  // Truncate to 4000 chars
  const truncatedLength = Math.min(textLength, 4000)

  // Input tokens: text + system prompt (~200 tokens)
  const inputTokens = estimateTokenCount('x '.repeat(truncatedLength / 5)) + 200

  // Output tokens: ~10 keywords * 10 tokens = 100 tokens
  const outputTokens = 100

  // Cost per call (cache miss)
  const costPerCall =
    inputTokens * PRICING['gpt-4o-mini'].input +
    outputTokens * PRICING['gpt-4o-mini'].output

  // Average cost with cache
  const averageCostWithCache = costPerCall * (1 - cacheHitRate)

  return { costPerCall, averageCostWithCache }
}

/**
 * Monthly cost projection
 */
export interface MonthlyCostProjection {
  extractionCosts: number
  keywordCosts: number
  totalCosts: number
  costPer1000Users: number
  withinBudget: boolean
  utilizationRate: number
}

/**
 * Project monthly costs based on usage patterns
 */
export function projectMonthlyCosts(params: {
  activeUsers: number
  avgPdfsPerUserPerMonth: number
  avgPagesPerPdf: number
  avgWordsPerPage: number
  avgAiQueriesPerUser: number
  pdfCacheHitRate: number
  keywordCacheHitRate: number
}): MonthlyCostProjection {
  const {
    activeUsers,
    avgPdfsPerUserPerMonth,
    avgPagesPerPdf,
    avgWordsPerPage,
    avgAiQueriesPerUser,
    pdfCacheHitRate,
    keywordCacheHitRate,
  } = params

  // Extraction costs
  const totalPdfUploads = activeUsers * avgPdfsPerUserPerMonth
  const cacheMisses = totalPdfUploads * (1 - pdfCacheHitRate)

  const extractionCostPerPdf = estimateExtractionCost({
    totalPages: avgPagesPerPdf,
    wordsPerPage: avgWordsPerPage,
    outputEntriesPerBatch: 10,
    wordsPerEntry: 100,
  })

  const extractionCosts = cacheMisses * extractionCostPerPdf.totalCost

  // Keyword costs
  const totalKeywordCalls = activeUsers * avgAiQueriesPerUser

  const keywordCost = estimateKeywordCost({
    textLength: 2000,
    cacheHitRate: keywordCacheHitRate,
  })

  const keywordCosts = totalKeywordCalls * keywordCost.averageCostWithCache

  // Total
  const totalCosts = extractionCosts + keywordCosts
  const costPer1000Users = (totalCosts / activeUsers) * 1000

  // Check if within budget
  const withinBudget = costPer1000Users <= COST_TARGETS.monthlyPer1000UsersMax

  // Utilization rate (how much of budget is being used)
  const utilizationRate = costPer1000Users / COST_TARGETS.monthlyPer1000Users

  return {
    extractionCosts,
    keywordCosts,
    totalCosts,
    costPer1000Users,
    withinBudget,
    utilizationRate,
  }
}

/**
 * Cost metrics result type
 */
export interface CostMetrics {
  period: string
  totalExtractions: number
  totalKeywordCalls: number
  estimatedExtractionCost: number
  estimatedKeywordCost: number
  totalEstimatedCost: number
  avgCostPerExtraction: number
  pdfCacheHitRate: number
  keywordCacheHitRate: number
}

/**
 * Get cost metrics for a time period
 */
export async function getCostMetrics(params: {
  startDate: Date
  endDate: Date
}): Promise<CostMetrics> {
  const { startDate, endDate } = params
  const supabase = createAdminClient()

  // Query extraction jobs
  const { data: jobs, error: jobsError } = await supabase
    .from('context_extraction_jobs')
    .select('id, total_words, total_pages, status, created_at')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  if (jobsError || !jobs) {
    throw new Error(`Failed to fetch extraction jobs: ${jobsError?.message}`)
  }

  const completedJobs = jobs.filter(j => j.status === 'completed')

  // Estimate extraction costs
  let totalExtractionCost = 0
  for (const job of completedJobs) {
    const estimate = estimateExtractionCost({
      totalPages: job.total_pages,
      wordsPerPage: job.total_words / job.total_pages,
      outputEntriesPerBatch: 10,
      wordsPerEntry: 100,
    })
    totalExtractionCost += estimate.totalCost
  }

  // Query context entries to estimate cache hit rate
  const { count: totalEntries } = await supabase
    .from('pdf_context_entries')
    .select('id', { count: 'exact', head: true })

  const { count: uniquePdfHashes } = await supabase
    .from('pdf_context_entries')
    .select('pdf_hash', { count: 'exact', head: true })

  // Rough cache hit rate estimate: (total jobs - unique hashes) / total jobs
  const pdfCacheHitRate = completedJobs.length > 0
    ? Math.max(0, (completedJobs.length - (uniquePdfHashes || 0)) / completedJobs.length)
    : 0

  // Keyword costs (estimated based on typical usage)
  const estimatedKeywordCalls = completedJobs.length * 50 // Assume 50 queries per PDF
  const keywordCost = estimateKeywordCost({
    textLength: 2000,
    cacheHitRate: 0.7, // Use target cache hit rate
  })
  const totalKeywordCost = estimatedKeywordCalls * keywordCost.averageCostWithCache

  const totalCost = totalExtractionCost + totalKeywordCost

  return {
    period: `${startDate.toISOString()} to ${endDate.toISOString()}`,
    totalExtractions: completedJobs.length,
    totalKeywordCalls: estimatedKeywordCalls,
    estimatedExtractionCost: totalExtractionCost,
    estimatedKeywordCost: totalKeywordCost,
    totalEstimatedCost: totalCost,
    avgCostPerExtraction: completedJobs.length > 0 ? totalExtractionCost / completedJobs.length : 0,
    pdfCacheHitRate,
    keywordCacheHitRate: 0.7, // Target rate (actual tracking would need additional instrumentation)
  }
}

/**
 * Validate if current costs are within budget
 */
export async function validateCostCompliance(): Promise<{
  compliant: boolean
  issues: string[]
  recommendations: string[]
}> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const metrics = await getCostMetrics({
    startDate: startOfMonth,
    endDate: now,
  })

  const issues: string[] = []
  const recommendations: string[] = []

  // Check extraction cost target
  if (metrics.avgCostPerExtraction > COST_TARGETS.extractionPer100Pages * 2) {
    issues.push(
      `Avg extraction cost ($${metrics.avgCostPerExtraction.toFixed(4)}) exceeds target by >2x`
    )
    recommendations.push('Review batch size and quality filtering thresholds')
  }

  // Check cache hit rates
  if (metrics.pdfCacheHitRate < COST_TARGETS.pdfCacheHitRate) {
    issues.push(
      `PDF cache hit rate (${(metrics.pdfCacheHitRate * 100).toFixed(1)}%) below target (${(COST_TARGETS.pdfCacheHitRate * 100).toFixed(1)}%)`
    )
    recommendations.push('Investigate cache effectiveness and user upload patterns')
  }

  // Check total costs
  const projectedMonthlyCost = (metrics.totalEstimatedCost / now.getDate()) * 30
  if (projectedMonthlyCost > COST_TARGETS.monthlyPer1000UsersMax) {
    issues.push(
      `Projected monthly cost ($${projectedMonthlyCost.toFixed(2)}) exceeds hard ceiling ($${COST_TARGETS.monthlyPer1000UsersMax})`
    )
    recommendations.push('Consider rate limiting or adjusting extraction quotas')
  }

  return {
    compliant: issues.length === 0,
    issues,
    recommendations,
  }
}

/**
 * Log cost summary to console
 */
export function logCostSummary(metrics: CostMetrics): void {
  console.log('\n--- Cost Metrics Summary ---')
  console.log(`Period: ${metrics.period}`)
  console.log(`Total Extractions: ${metrics.totalExtractions}`)
  console.log(`Extraction Costs: $${metrics.estimatedExtractionCost.toFixed(2)}`)
  console.log(`Keyword Costs: $${metrics.estimatedKeywordCost.toFixed(2)}`)
  console.log(`Total Costs: $${metrics.totalEstimatedCost.toFixed(2)}`)
  console.log(`Avg Cost/Extraction: $${metrics.avgCostPerExtraction.toFixed(4)}`)
  console.log(`PDF Cache Hit Rate: ${(metrics.pdfCacheHitRate * 100).toFixed(1)}%`)
  console.log(`Target: <$${COST_TARGETS.extractionPer100Pages} per 100-page PDF`)
  console.log('---------------------------\n')
}
