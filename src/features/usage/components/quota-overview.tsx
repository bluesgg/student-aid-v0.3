'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { QuotaProgressBar } from './quota-progress-bar'

interface QuotaData {
  bucket: string
  used: number
  limit: number
}

interface QuotaOverviewProps {
  quotas: QuotaData[]
}

function getUsagePercent(quota: QuotaData): number {
  return quota.limit > 0 ? quota.used / quota.limit : 0
}

function QuotaOverviewComponent({ quotas }: QuotaOverviewProps) {
  const t = useTranslations('usage')

  const sortedQuotas = [...quotas].sort((a, b) => getUsagePercent(b) - getUsagePercent(a))
  const totalUsed = quotas.reduce((sum, q) => sum + q.used, 0)
  const totalLimit = quotas.reduce((sum, q) => sum + q.limit, 0)

  const getTranslation = (prefix: string, bucket: string): string | undefined => {
    try {
      return t(`${prefix}.${bucket}`)
    } catch {
      return prefix === 'buckets' ? bucket : undefined
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t('quotaUsage')}</h3>
          <span className="text-xs text-gray-500">
            {totalUsed} / {totalLimit} {t('totalOperations')}
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {sortedQuotas.map((quota) => {
          const label = getTranslation('buckets', quota.bucket) || quota.bucket
          const description = getTranslation('bucketDescriptions', quota.bucket)

          return (
            <div key={quota.bucket} className="p-4">
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{label}</span>
                </div>
                {description && (
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                )}
              </div>
              <QuotaProgressBar
                label=""
                used={quota.used}
                limit={quota.limit}
                showPercentage={true}
                variant="default"
              />
            </div>
          )
        })}
      </div>

      {quotas.length === 0 && (
        <div className="p-8 text-center">
          <svg
            className="mx-auto w-12 h-12 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500">{t('noQuotaData')}</p>
        </div>
      )}
    </div>
  )
}

export const QuotaOverview = memo(QuotaOverviewComponent)
