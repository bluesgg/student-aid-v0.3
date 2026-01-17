'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

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

interface CostBreakdownProps {
  operations: OperationCost[]
  totalCost: number
}

type BucketKey = 'autoExplain' | 'learningInteractions' | 'documentSummary' | 'sectionSummary' | 'courseSummary'

const BUCKET_ICONS: Record<string, React.ReactNode> = {
  autoExplain: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  ),
  learningInteractions: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  ),
  documentSummary: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  sectionSummary: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h7"
      />
    </svg>
  ),
  courseSummary: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  ),
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

function CostBreakdownComponent({ operations, totalCost }: CostBreakdownProps) {
  const t = useTranslations('usage')

  const getBucketLabel = (bucket: string): string => {
    const key = bucket as BucketKey
    try {
      return t(`buckets.${key}`)
    } catch {
      return bucket
    }
  }

  if (operations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
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
        <p className="mt-2 text-sm text-gray-500">{t('noData')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">{t('costBreakdownByOp')}</h3>
      </div>

      <div className="divide-y divide-gray-100">
        {operations.map((op) => {
          const percentage = totalCost > 0 ? (op.totalCost / totalCost) * 100 : 0

          return (
            <div key={op.bucket} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                    {BUCKET_ICONS[op.bucket] || BUCKET_ICONS.learningInteractions}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {getBucketLabel(op.bucket)}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">{op.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>{op.used} {t('operations')}</span>
                      <span>·</span>
                      <span>{formatCost(op.costPerOperation)}/op</span>
                      <span>·</span>
                      <span>~{formatNumber(op.avgInputTokens + op.avgOutputTokens)} {t('tokensPerOp')}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{formatCost(op.totalCost)}</p>
                  <p className="text-xs text-gray-500">{percentage.toFixed(1)}% {t('ofTotal')}</p>
                </div>
              </div>

              {/* Mini progress bar showing percentage of total */}
              <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{t('totalCostPeriod')}</span>
          <span className="text-lg font-semibold text-gray-900">{formatCost(totalCost)}</span>
        </div>
      </div>
    </div>
  )
}

export const CostBreakdown = memo(CostBreakdownComponent)
