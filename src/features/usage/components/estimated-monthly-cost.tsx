'use client'

import { memo } from 'react'

interface EstimatedMonthlyCostProps {
  currentCost: number
  currentCostFormatted: string
  projectedCost: number
  projectedCostFormatted: string
  warningLevel: 'normal' | 'warning' | 'danger'
  daysElapsed: number
  daysRemaining: number
}

function EstimatedMonthlyCostComponent({
  currentCost,
  currentCostFormatted,
  projectedCost,
  projectedCostFormatted,
  warningLevel,
  daysElapsed,
  daysRemaining,
}: EstimatedMonthlyCostProps) {
  const getWarningStyles = () => {
    switch (warningLevel) {
      case 'danger':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: 'text-red-500',
          text: 'text-red-700',
          badge: 'bg-red-100 text-red-700',
        }
      case 'warning':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          icon: 'text-amber-500',
          text: 'text-amber-700',
          badge: 'bg-amber-100 text-amber-700',
        }
      default:
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: 'text-green-500',
          text: 'text-green-700',
          badge: 'bg-green-100 text-green-700',
        }
    }
  }

  const styles = getWarningStyles()

  const getStatusMessage = () => {
    switch (warningLevel) {
      case 'danger':
        return 'High usage - consider reducing AI operations'
      case 'warning':
        return 'Moderate usage - monitor your spending'
      default:
        return 'Usage on track'
    }
  }

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Estimated Monthly Cost</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Based on {daysElapsed} days of usage
            </p>
          </div>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${styles.badge}`}>
            {warningLevel === 'danger' && 'High'}
            {warningLevel === 'warning' && 'Moderate'}
            {warningLevel === 'normal' && 'Normal'}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Current Period</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{currentCostFormatted}</p>
            <p className="text-xs text-gray-500 mt-0.5">Actual spend</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Projected</p>
            <p className={`text-2xl font-bold ${styles.text} mt-1`}>{projectedCostFormatted}</p>
            <p className="text-xs text-gray-500 mt-0.5">If pace continues</p>
          </div>
        </div>
      </div>

      <div className={`px-4 py-3 border-t ${styles.border}`}>
        <div className="flex items-center gap-2">
          {warningLevel === 'danger' && (
            <svg className={`w-4 h-4 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          )}
          {warningLevel === 'warning' && (
            <svg className={`w-4 h-4 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {warningLevel === 'normal' && (
            <svg className={`w-4 h-4 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          <span className={`text-sm ${styles.text}`}>{getStatusMessage()}</span>
        </div>
      </div>
    </div>
  )
}

export const EstimatedMonthlyCost = memo(EstimatedMonthlyCostComponent)
