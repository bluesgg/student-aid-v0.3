'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export type ImageExtractionStatus = 'pending' | 'partial' | 'complete' | 'failed'

export interface ImageExtractionProgress {
  status: ImageExtractionStatus
  progress: number
  totalPages: number
  percentage: number
}

interface UseImageExtractionProgressOptions {
  /** Course ID */
  courseId: string
  /** File ID to monitor */
  fileId: string
  /** Total pages in the file */
  totalPages: number
  /** Initial status (from file data) */
  initialStatus?: ImageExtractionStatus
  /** Initial progress (from file data) */
  initialProgress?: number
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number
  /** Callback when extraction completes */
  onComplete?: () => void
}

/**
 * Hook for monitoring image extraction progress.
 * Polls the file API to get the latest extraction status.
 */
export function useImageExtractionProgress({
  courseId,
  fileId,
  totalPages,
  initialStatus = 'pending',
  initialProgress = 0,
  pollInterval = 3000,
  onComplete,
}: UseImageExtractionProgressOptions): ImageExtractionProgress & {
  isExtracting: boolean
  refetch: () => Promise<void>
} {
  const [status, setStatus] = useState<ImageExtractionStatus>(initialStatus)
  const [progress, setProgress] = useState(initialProgress)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/courses/${courseId}/files/${fileId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) return

      const data = await response.json()
      const file = data.data

      if (file) {
        const newStatus = file.imageExtractionStatus || 'pending'
        const newProgress = file.imageExtractionProgress || 0

        setStatus(newStatus)
        setProgress(newProgress)

        // Trigger callback on completion
        if (newStatus === 'complete' && status !== 'complete') {
          onCompleteRef.current?.()
        }
      }
    } catch (error) {
      console.error('[ImageExtraction] Failed to fetch status:', error)
    }
  }, [courseId, fileId, status])

  // Poll for status updates when extraction is in progress
  useEffect(() => {
    // Only poll if extraction is in progress (partial status)
    if (status !== 'partial') return

    const timer = setInterval(fetchStatus, pollInterval)
    return () => clearInterval(timer)
  }, [status, pollInterval, fetchStatus])

  // Update from initial values
  useEffect(() => {
    setStatus(initialStatus)
    setProgress(initialProgress)
  }, [initialStatus, initialProgress])

  const isExtracting = status === 'partial'
  const percentage = totalPages > 0 ? Math.round((progress / totalPages) * 100) : 0

  return {
    status,
    progress,
    totalPages,
    percentage,
    isExtracting,
    refetch: fetchStatus,
  }
}
