import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import {
  estimateOperationCost,
  calculateMonthlyProjection,
  getCostWarningLevel,
  OPERATION_ESTIMATES,
  formatCost,
} from '@/lib/openai/cost-tracker'

// Default quota limits per bucket
const DEFAULT_LIMITS: Record<string, number> = {
  learningInteractions: 150,
  documentSummary: 10,
  sectionSummary: 30,
  courseSummary: 6,
  autoExplain: 100,
}

/**
 * GET /api/quotas/tokens - Get token usage statistics and cost estimates
 */
export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Get user's registration date for reset calculation
    const registrationDate = new Date(user.created_at)
    const now = new Date()

    // Calculate days elapsed since last reset (monthly anniversary)
    const currentDay = now.getDate()
    const registrationDay = registrationDate.getDate()
    let daysElapsed: number

    if (currentDay >= registrationDay) {
      daysElapsed = currentDay - registrationDay
    } else {
      // We're before the reset day this month
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, registrationDay)
      daysElapsed = Math.floor((now.getTime() - lastMonth.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Get existing quotas
    const { data: quotas, error } = await supabase
      .from('quotas')
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      console.error('Error fetching quotas:', error)
      return errors.internalError()
    }

    // Build quota usage map
    const quotaUsage: Record<string, { used: number; limit: number }> = {}
    for (const [bucket, limit] of Object.entries(DEFAULT_LIMITS)) {
      const existing = quotas?.find((q) => q.bucket === bucket)
      quotaUsage[bucket] = {
        used: existing?.used ?? 0,
        limit: existing?.limit ?? limit,
      }
    }

    // Calculate costs per operation type
    const operationCosts: Array<{
      bucket: string
      operationType: string
      description: string
      used: number
      costPerOperation: number
      totalCost: number
      avgInputTokens: number
      avgOutputTokens: number
    }> = []

    const bucketToOperation: Record<string, keyof typeof OPERATION_ESTIMATES> = {
      autoExplain: 'autoExplain',
      learningInteractions: 'selectionExplain',
      documentSummary: 'documentSummary',
      sectionSummary: 'sectionSummary',
      courseSummary: 'courseSummary',
    }

    for (const [bucket, usage] of Object.entries(quotaUsage)) {
      const operationType = bucketToOperation[bucket]
      if (!operationType) continue

      const estimate = OPERATION_ESTIMATES[operationType]
      const costPerOp = estimateOperationCost(operationType)

      operationCosts.push({
        bucket,
        operationType,
        description: estimate.description,
        used: usage.used,
        costPerOperation: costPerOp,
        totalCost: usage.used * costPerOp,
        avgInputTokens: estimate.avgInputTokens,
        avgOutputTokens: estimate.avgOutputTokens,
      })
    }

    // Calculate monthly projection
    const projection = calculateMonthlyProjection(quotaUsage, daysElapsed)
    const warningLevel = getCostWarningLevel(projection.projectedCost)

    // Calculate next reset date
    const nextResetDate = new Date(now.getFullYear(), now.getMonth(), registrationDay)
    if (nextResetDate <= now) {
      nextResetDate.setMonth(nextResetDate.getMonth() + 1)
    }

    // Calculate total tokens used (estimated)
    const totalInputTokens = operationCosts.reduce(
      (sum, op) => sum + op.used * op.avgInputTokens,
      0
    )
    const totalOutputTokens = operationCosts.reduce(
      (sum, op) => sum + op.used * op.avgOutputTokens,
      0
    )

    return successResponse({
      // Token summary
      tokens: {
        totalInput: totalInputTokens,
        totalOutput: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },

      // Cost summary
      costs: {
        currentPeriod: projection.totalCost,
        currentPeriodFormatted: formatCost(projection.totalCost),
        projectedMonthly: projection.projectedCost,
        projectedMonthlyFormatted: formatCost(projection.projectedCost),
        warningLevel,
        breakdown: projection.breakdown,
      },

      // Per-operation breakdown
      operations: operationCosts.sort((a, b) => b.totalCost - a.totalCost),

      // Period info
      period: {
        daysElapsed,
        daysRemaining: Math.max(0, 30 - daysElapsed),
        nextResetDate: nextResetDate.toISOString(),
        registrationDay,
      },
    })
  } catch (err) {
    console.error('Token stats error:', err)
    return errors.internalError()
  }
}
