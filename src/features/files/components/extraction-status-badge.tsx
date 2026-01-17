'use client'

import { useTranslations } from 'next-intl'
import type { ExtractionStatusData } from '../hooks/use-extraction-status'

interface ExtractionStatusBadgeProps {
  status: ExtractionStatusData | undefined
}

/**
 * Badge component showing extraction status for a file
 */
export function ExtractionStatusBadge({ status }: ExtractionStatusBadgeProps) {
  const t = useTranslations('files.extraction')

  if (!status || status.status === 'not_found') {
    // No extraction yet - don't show anything
    return null
  }

  if (status.status === 'ready') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-green-600"
        title={t('aiReadyTooltip', { count: status.entriesCount || 0 })}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{t('aiReady')}</span>
      </span>
    )
  }

  if (status.status === 'processing' || status.status === 'pending') {
    const progress = status.progress
    const progressText = progress
      ? t('analyzingPages', { processed: progress.processedPages, total: progress.totalPages })
      : t('starting')

    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-amber-600"
        title={t('analyzingTooltip', { progress: progressText })}
      >
        <svg
          className="w-3.5 h-3.5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>{t('analyzing')} ({progressText})</span>
      </span>
    )
  }

  if (status.status === 'failed') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-red-600"
        title={t('failedTooltip', { error: status.error || 'Unknown error' })}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{t('partial')}</span>
      </span>
    )
  }

  return null
}

// ==================== Image Extraction Status Badge ====================

import type { ImageExtractionStatus } from '../api'

interface ImageExtractionStatusBadgeProps {
  status: ImageExtractionStatus | undefined
  progress: number
  totalPages: number
  isFeatureEnabled?: boolean
}

/**
 * Badge component showing image extraction status for a file.
 * Only displayed when auto image detection feature is enabled.
 */
export function ImageExtractionStatusBadge({
  status,
  progress,
  totalPages,
  isFeatureEnabled = true,
}: ImageExtractionStatusBadgeProps) {
  const t = useTranslations('files.imageExtraction')

  // Don't show if feature is disabled
  if (!isFeatureEnabled) {
    return null
  }

  // Don't show pending status until upload completes
  if (!status || status === 'pending') {
    return null
  }

  if (status === 'complete') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-blue-600"
        title={t('readyTooltip')}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span>{t('ready')}</span>
      </span>
    )
  }

  if (status === 'partial') {
    const progressText = t('progress', { processed: progress, total: totalPages })

    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-blue-500"
        title={t('detectingTooltip', { progress: progressText })}
      >
        <svg
          className="w-3.5 h-3.5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>{t('detecting')} ({progressText})</span>
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-orange-600"
        title={t('failedTooltip')}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span>{t('failed')}</span>
      </span>
    )
  }

  return null
}
