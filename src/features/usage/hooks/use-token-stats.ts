import { useQuery } from '@tanstack/react-query'
import { get, isApiError } from '@/lib/api-client'

interface OperationCost {
  bucket: string
  operationType: string
  description: string
  used: number
  costPerOperation: number
  totalCost: number
  avgInputTokens: number
  avgOutputTokens: number
}

interface CostBreakdownItem {
  bucket: string
  used: number
  cost: number
}

interface TokenStatsResponse {
  tokens: {
    totalInput: number
    totalOutput: number
    total: number
  }
  costs: {
    currentPeriod: number
    currentPeriodFormatted: string
    projectedMonthly: number
    projectedMonthlyFormatted: string
    warningLevel: 'normal' | 'warning' | 'danger'
    breakdown: CostBreakdownItem[]
  }
  operations: OperationCost[]
  period: {
    daysElapsed: number
    daysRemaining: number
    nextResetDate: string
    registrationDay: number
  }
}

async function fetchTokenStats(): Promise<TokenStatsResponse> {
  const result = await get<TokenStatsResponse>('/api/quotas/tokens')

  if (isApiError(result)) {
    throw new Error(result.error.message)
  }

  return result.data
}

export function useTokenStats() {
  return useQuery({
    queryKey: ['token-stats'],
    queryFn: fetchTokenStats,
    staleTime: 30 * 1000, // 30 seconds
  })
}

export type { TokenStatsResponse, OperationCost, CostBreakdownItem }
