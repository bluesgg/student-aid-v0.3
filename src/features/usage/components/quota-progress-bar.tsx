'use client'

import { memo } from 'react'

interface QuotaProgressBarProps {
  label: string
  used: number
  limit: number
  variant?: 'default' | 'compact'
  showPercentage?: boolean
}

function QuotaProgressBarComponent({
  label,
  used,
  limit,
  variant = 'default',
  showPercentage = true,
}: QuotaProgressBarProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const remaining = Math.max(limit - used, 0)

  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 75) return 'bg-amber-500'
    return 'bg-indigo-500'
  }

  const getTextColor = () => {
    if (percentage >= 90) return 'text-red-600'
    if (percentage >= 75) return 'text-amber-600'
    return 'text-gray-600'
  }

  if (variant === 'compact') {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">{label}</span>
          <span className={getTextColor()}>
            {used}/{limit}
          </span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getTextColor()}`}>
            {used} / {limit}
          </span>
          {showPercentage && (
            <span className="text-xs text-gray-400">({Math.round(percentage)}%)</span>
          )}
        </div>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getProgressColor()} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Used this period</span>
        <span>{remaining} remaining</span>
      </div>
    </div>
  )
}

export const QuotaProgressBar = memo(QuotaProgressBarComponent)
