'use client'

import { memo } from 'react'

interface ResetDateDisplayProps {
  nextResetDate: string
  daysRemaining: number
  daysElapsed: number
  registrationDay: number
}

function ResetDateDisplayComponent({
  nextResetDate,
  daysRemaining,
  daysElapsed,
  registrationDay,
}: ResetDateDisplayProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const progressPercentage = Math.min((daysElapsed / 30) * 100, 100)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Billing Period</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Resets on the {registrationDay}
            {getOrdinalSuffix(registrationDay)} of each month
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 rounded-lg">
          <svg
            className="w-4 h-4 text-indigo-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-sm font-medium text-indigo-700">{daysRemaining} days left</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Period progress</span>
          <span>
            Day {daysElapsed} of 30
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Next reset: <strong className="text-gray-900">{formatDate(nextResetDate)}</strong>
          </span>
        </div>
      </div>
    </div>
  )
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

export const ResetDateDisplay = memo(ResetDateDisplayComponent)
