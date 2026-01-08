'use client'

import { memo } from 'react'
import { QACard } from './qa-card'
import type { QAInteraction } from '../api'

interface QAHistoryProps {
  history: QAInteraction[]
  isLoading?: boolean
  onPageClick?: (page: number) => void
}

function QAHistoryComponent({ history, isLoading = false, onPageClick }: QAHistoryProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading history...</span>
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-full bg-gray-100 p-3 mb-3">
          <svg
            className="w-6 h-6 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700">No questions yet</p>
        <p className="mt-1 text-xs text-gray-500">
          Ask a question about this document to get started
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {history.map((qa) => (
        <QACard key={qa.id} qa={qa} onPageClick={onPageClick} />
      ))}
    </div>
  )
}

export const QAHistory = memo(QAHistoryComponent)
