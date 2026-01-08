/**
 * OpenAI token cost calculation utilities.
 * Pricing based on OpenAI API pricing as of 2024.
 */

// Token pricing per 1K tokens (in USD)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
}

// Default model for cost calculations
export const DEFAULT_PRICING_MODEL = 'gpt-4-turbo-preview'

/**
 * Calculate the cost of a single API call
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_PRICING_MODEL]
  const inputCost = (inputTokens / 1000) * pricing.input
  const outputCost = (outputTokens / 1000) * pricing.output
  return inputCost + outputCost
}

/**
 * Estimate tokens from text (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Operation type definitions with estimated token usage
 */
export const OPERATION_ESTIMATES: Record<
  string,
  { avgInputTokens: number; avgOutputTokens: number; description: string }
> = {
  autoExplain: {
    avgInputTokens: 2000,
    avgOutputTokens: 1500,
    description: 'Auto-explain page (generates 2-6 stickers)',
  },
  selectionExplain: {
    avgInputTokens: 1500,
    avgOutputTokens: 800,
    description: 'Explain selected text',
  },
  qa: {
    avgInputTokens: 3000,
    avgOutputTokens: 1000,
    description: 'Q&A about document',
  },
  documentSummary: {
    avgInputTokens: 5000,
    avgOutputTokens: 2000,
    description: 'Full document summary',
  },
  sectionSummary: {
    avgInputTokens: 2500,
    avgOutputTokens: 1000,
    description: 'Section summary',
  },
  courseSummary: {
    avgInputTokens: 15000,
    avgOutputTokens: 3000,
    description: 'Course outline generation',
  },
}

/**
 * Estimate cost for a single operation
 */
export function estimateOperationCost(
  operationType: keyof typeof OPERATION_ESTIMATES,
  model: string = DEFAULT_PRICING_MODEL
): number {
  const estimate = OPERATION_ESTIMATES[operationType]
  if (!estimate) return 0
  return calculateCost(model, estimate.avgInputTokens, estimate.avgOutputTokens)
}

/**
 * Quota bucket to operation type mapping
 */
export const QUOTA_TO_OPERATION: Record<string, string> = {
  autoExplain: 'autoExplain',
  learningInteractions: 'selectionExplain', // Includes Q&A and selection explain
  documentSummary: 'documentSummary',
  sectionSummary: 'sectionSummary',
  courseSummary: 'courseSummary',
}

/**
 * Format cost as USD string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

/**
 * Calculate estimated monthly cost based on quota usage
 */
export function calculateMonthlyProjection(
  quotaUsage: Record<string, { used: number; limit: number }>,
  daysElapsed: number,
  daysInMonth: number = 30
): { totalCost: number; projectedCost: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {}
  let totalCost = 0

  for (const [bucket, usage] of Object.entries(quotaUsage)) {
    const operationType = QUOTA_TO_OPERATION[bucket]
    if (!operationType) continue

    const costPerOp = estimateOperationCost(operationType as keyof typeof OPERATION_ESTIMATES)
    const bucketCost = usage.used * costPerOp
    breakdown[bucket] = bucketCost
    totalCost += bucketCost
  }

  // Project based on current usage rate
  const dailyRate = daysElapsed > 0 ? totalCost / daysElapsed : 0
  const projectedCost = dailyRate * daysInMonth

  return {
    totalCost,
    projectedCost,
    breakdown,
  }
}

/**
 * Get warning level based on cost
 */
export function getCostWarningLevel(
  projectedCost: number
): 'normal' | 'warning' | 'danger' {
  if (projectedCost > 10) return 'danger'
  if (projectedCost > 5) return 'warning'
  return 'normal'
}

/**
 * Get usage percentage warning level
 */
export function getUsageWarningLevel(
  used: number,
  limit: number
): 'normal' | 'warning' | 'danger' {
  const percentage = (used / limit) * 100
  if (percentage >= 90) return 'danger'
  if (percentage >= 70) return 'warning'
  return 'normal'
}
