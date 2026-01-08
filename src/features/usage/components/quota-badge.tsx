'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getQuotas } from '../api'
import { isApiError } from '@/lib/api-client'

export function QuotaBadge() {
  const { data } = useQuery({
    queryKey: ['quotas'],
    queryFn: async () => {
      const result = await getQuotas()
      if (isApiError(result)) return null
      return result.data
    },
    staleTime: 60 * 1000, // 1 minute
  })

  if (!data) return null

  const { summary } = data
  const isWarning = summary.percentUsed > 90

  return (
    <Link
      href="/account/usage"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        isWarning
          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          : 'bg-secondary-50 text-secondary-600 hover:bg-secondary-100'
      }`}
    >
      <span>AI quota:</span>
      <span className="font-medium">
        {summary.remaining}/{summary.limit}
      </span>
      <span className="text-secondary-400">remaining</span>
    </Link>
  )
}
