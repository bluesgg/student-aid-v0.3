import { useQuery } from '@tanstack/react-query'

interface ActiveUsersByDay {
  date: string
  active_users: number
}

interface OperationDistribution {
  operation_type: string
  count: number
  unique_users: number
}

interface NewUsersByDay {
  date: string
  new_users: number
}

interface ErrorDistribution {
  error_code: string
  count: number
}

interface PdfStats {
  totalPages: number
  avgPagesPerFile: number
  scannedFiles: number
  filesInPeriod: number
}

interface QaStats {
  total: number
  inPeriod: number
}

interface CostTrendItem {
  date: string
  cost: number
}

interface AdminAnalyticsResponse {
  overview: {
    totalUsers: number
    totalCourses: number
    totalFiles: number
    totalStickers: number
    totalQAInteractions: number
    totalSummaries: number
    totalContextEntries: number
    totalCost: number
    totalInputTokens: number
    totalOutputTokens: number
    period: {
      days: number
      startDate: string
      endDate: string
    }
  }
  activeUsers: {
    byDay: ActiveUsersByDay[]
  }
  operations: {
    distribution: OperationDistribution[]
  }
  newUsers: {
    byDay: NewUsersByDay[]
  }
  errors: {
    distribution: ErrorDistribution[]
    total: number
  }
  pdfStats: PdfStats
  qaStats: QaStats
  costTrend: CostTrendItem[]
}

async function fetchAdminAnalytics(
  days: number,
  adminSecret: string
): Promise<AdminAnalyticsResponse> {
  const response = await fetch(`/api/admin/analytics?days=${days}`, {
    headers: {
      'x-admin-secret': adminSecret,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch admin analytics')
  }

  const result = await response.json()
  return result.data
}

export function useAdminAnalytics(days: number, adminSecret: string) {
  return useQuery({
    queryKey: ['admin-analytics', days],
    queryFn: () => fetchAdminAnalytics(days, adminSecret),
    enabled: !!adminSecret,
    staleTime: 60 * 1000, // 1 minute
    retry: false,
  })
}

export type {
  AdminAnalyticsResponse,
  ActiveUsersByDay,
  OperationDistribution,
  NewUsersByDay,
  ErrorDistribution,
}
