'use client'

import { useEffect, useState } from 'react'
import { useImageExtractionProgress, type ImageExtractionStatus } from '../hooks/use-image-extraction-progress'

interface ImageExtractionToastProps {
  courseId: string
  fileId: string
  totalPages: number
  initialStatus?: ImageExtractionStatus
  initialProgress?: number
}

/**
 * Toast notification showing image extraction progress.
 * Displays in bottom-right corner when extraction is in progress.
 * Auto-dismisses when extraction completes.
 */
export function ImageExtractionToast({
  courseId,
  fileId,
  totalPages,
  initialStatus = 'pending',
  initialProgress = 0,
}: ImageExtractionToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)

  const { status, progress, percentage, isExtracting } = useImageExtractionProgress({
    courseId,
    fileId,
    totalPages,
    initialStatus,
    initialProgress,
    onComplete: () => {
      // Start dismiss animation
      setIsDismissing(true)
      setTimeout(() => {
        setIsVisible(false)
      }, 2000)
    },
  })

  // Show toast when extraction starts
  useEffect(() => {
    if (isExtracting) {
      setIsVisible(true)
      setIsDismissing(false)
    }
  }, [isExtracting])

  // Don't render if not visible
  if (!isVisible) {
    return null
  }

  const isCompleted = status === 'complete'
  const isFailed = status === 'failed'

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
        isDismissing ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[260px]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          {!isCompleted && !isFailed && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          {isCompleted && (
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isFailed && (
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          <span className="text-sm font-medium text-gray-900">
            {isCompleted
              ? '图片检测完成'
              : isFailed
              ? '图片检测部分完成'
              : '正在检测图片...'}
          </span>
        </div>

        {/* Progress info */}
        <div className="space-y-2">
          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted
                  ? 'bg-green-500'
                  : isFailed
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{percentage}%</span>
            <span>
              {progress}/{totalPages} 页
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
