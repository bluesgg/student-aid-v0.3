'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

interface TokenUsageChartProps {
  totalInput: number
  totalOutput: number
  total: number
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

function TokenUsageChartComponent({ totalInput, totalOutput, total }: TokenUsageChartProps) {
  const t = useTranslations('usage')
  const inputPercentage = total > 0 ? (totalInput / total) * 100 : 50
  const outputPercentage = total > 0 ? (totalOutput / total) * 100 : 50

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('tokenUsage')}</h3>
        <span className="text-lg font-bold text-gray-900">{formatNumber(total)} {t('total')}</span>
      </div>

      {/* Bar chart */}
      <div className="h-8 flex rounded-lg overflow-hidden">
        <div
          className="bg-blue-500 transition-all duration-300 flex items-center justify-center"
          style={{ width: `${inputPercentage}%` }}
        >
          {inputPercentage > 15 && (
            <span className="text-xs font-medium text-white">{Math.round(inputPercentage)}%</span>
          )}
        </div>
        <div
          className="bg-indigo-500 transition-all duration-300 flex items-center justify-center"
          style={{ width: `${outputPercentage}%` }}
        >
          {outputPercentage > 15 && (
            <span className="text-xs font-medium text-white">{Math.round(outputPercentage)}%</span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-blue-500 rounded-full" />
          <div>
            <p className="text-sm font-medium text-gray-900">{formatNumber(totalInput)}</p>
            <p className="text-xs text-gray-500">{t('inputTokens')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-indigo-500 rounded-full" />
          <div>
            <p className="text-sm font-medium text-gray-900">{formatNumber(totalOutput)}</p>
            <p className="text-xs text-gray-500">{t('outputTokens')}</p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          {t('tokenInfo')}
        </p>
      </div>
    </div>
  )
}

export const TokenUsageChart = memo(TokenUsageChartComponent)
