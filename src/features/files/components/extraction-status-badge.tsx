'use client'

import type { ExtractionStatusData } from '../hooks/use-extraction-status'

interface ExtractionStatusBadgeProps {
  status: ExtractionStatusData | undefined
}

/**
 * Badge component showing extraction status for a file
 */
export function ExtractionStatusBadge({ status }: ExtractionStatusBadgeProps) {
  if (!status || status.status === 'not_found') {
    // No extraction yet - don't show anything
    return null
  }

  if (status.status === 'ready') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-green-600"
        title={`AI ready - ${status.entriesCount || 0} knowledge entries extracted`}
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
        <span>AI Ready</span>
      </span>
    )
  }

  if (status.status === 'processing' || status.status === 'pending') {
    const progress = status.progress
    const progressText = progress
      ? `${progress.processedPages}/${progress.totalPages} pages`
      : 'Starting...'

    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-amber-600"
        title={`Analyzing document - ${progressText}`}
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
        <span>Analyzing ({progressText})</span>
      </span>
    )
  }

  if (status.status === 'failed') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-red-600"
        title={`Analysis failed: ${status.error || 'Unknown error'}`}
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
        <span>Partial</span>
      </span>
    )
  }

  return null
}
