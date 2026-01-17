'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { type AutoExplainSession } from '../hooks/use-auto-explain-session'

interface SessionProgressToastProps {
  session: AutoExplainSession | null
  onCancel: () => void
  isActive: boolean
}

/**
 * Toast notification showing auto-explain session progress
 * Displays generation progress and provides cancel button
 */
export function SessionProgressToast({
  session,
  onCancel,
  isActive,
}: SessionProgressToastProps) {
  const t = useTranslations('reader.session')
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)

  // Show toast when session becomes active
  useEffect(() => {
    if (isActive && session) {
      setIsVisible(true)
      setIsDismissing(false)
    } else if (!isActive && session?.state === 'completed') {
      // Auto-dismiss after completion with delay
      setIsDismissing(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, 2000)
      return () => clearTimeout(timer)
    } else if (!isActive) {
      setIsVisible(false)
    }
  }, [isActive, session])

  if (!isVisible || !session) {
    return null
  }

  const { progress, windowRange, state } = session
  const isCompleted = state === 'completed'
  const isCanceled = state === 'canceled'

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
        isDismissing ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[280px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {!isCompleted && !isCanceled && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            {isCompleted && (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {isCanceled && (
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="text-sm font-medium text-gray-900">
              {isCompleted
                ? t('complete')
                : isCanceled
                ? t('canceled')
                : t('generating')}
            </span>
          </div>
          {!isCompleted && !isCanceled && (
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title={t('stop')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress info */}
        <div className="space-y-2">
          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted
                  ? 'bg-green-500'
                  : isCanceled
                  ? 'bg-gray-400'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {t('pageRange', { start: windowRange.start, end: windowRange.end })}
            </span>
            <span>
              {t('progress', { completed: progress.completed, total: progress.total })}
            </span>
          </div>

          {/* Details */}
          {(progress.inProgress > 0 || progress.failed > 0) && (
            <div className="flex items-center gap-3 text-xs">
              {progress.inProgress > 0 && (
                <span className="text-blue-600">
                  {t('inProgress', { count: progress.inProgress })}
                </span>
              )}
              {progress.failed > 0 && (
                <span className="text-red-500">
                  {t('failed', { count: progress.failed })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
