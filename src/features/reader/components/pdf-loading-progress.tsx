'use client'

import { useTranslations } from 'next-intl'
import type { LoadingProgress } from '../hooks/use-pdf-document'

interface PdfLoadingProgressProps {
  /** Loading progress data */
  progress: LoadingProgress | null
  /** Whether loading from cache */
  isCached?: boolean
  /** Whether first page is ready (show different message) */
  firstPageReady?: boolean
}

/**
 * Loading progress indicator for PDF documents.
 * Shows percentage when total size is known, otherwise shows bytes loaded.
 * Uses i18n for all user-facing text.
 */
export function PdfLoadingProgress({ progress, isCached = false, firstPageReady = false }: PdfLoadingProgressProps) {
  const t = useTranslations('pdf.loading')

  // Loading from cache
  if (isCached) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <span className="text-gray-500">{t('loadingFromCache')}</span>
      </div>
    )
  }

  // No progress data yet
  if (!progress) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <span className="text-gray-500">{t('preparingDocument')}</span>
      </div>
    )
  }

  const { loaded, total, percent, totalPages } = progress

  // Calculate size in MB for display
  const loadedMB = (loaded / 1024 / 1024).toFixed(1)
  const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : null

  // First page ready - show page info if available
  if (firstPageReady && totalPages && totalPages > 0) {
    return (
      <div className="flex flex-col items-center gap-4 w-64">
        {/* Progress bar - higher saturation for "almost done" state */}
        <div className="w-full">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300 ease-out"
              style={{ width: percent >= 0 ? `${percent}%` : '80%' }}
            />
          </div>
        </div>

        {/* Page loading text */}
        <span className="text-sm text-gray-500">
          {t('loadingPage', { current: 1, total: totalPages })}
        </span>

        {/* Size details */}
        {totalMB && (
          <span className="text-xs text-gray-400">
            {loadedMB} / {totalMB} MB
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 w-64">
      {/* Progress bar */}
      <div className="w-full">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: percent >= 0 ? `${percent}%` : '50%' }}
          />
        </div>
      </div>

      {/* Progress text */}
      <span className="text-sm text-gray-500">
        {percent >= 0 ? (
          // Known total - show percentage
          t('downloadingPercent', { percent })
        ) : (
          // Unknown total - show MB loaded
          t('downloadingSize', { size: loadedMB })
        )}
      </span>

      {/* Size details (optional) */}
      {totalMB && (
        <span className="text-xs text-gray-400">
          {loadedMB} / {totalMB} MB
        </span>
      )}
    </div>
  )
}
