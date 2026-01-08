'use client'

import { memo, useState } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import type { QAInteraction } from '../api'

interface QACardProps {
  qa: QAInteraction
  onPageClick?: (page: number) => void
}

function QACardComponent({ qa, onPageClick }: QACardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Question header */}
      <div
        className="flex items-start gap-3 px-4 py-3 bg-gray-50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 line-clamp-2">
            {qa.question}
          </p>
          <p className="mt-1 text-xs text-gray-500">{formatTime(qa.createdAt)}</p>
        </div>
        <button className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600">
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Answer content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0 max-h-64 overflow-y-auto">
              <MarkdownRenderer content={qa.answerMarkdown} />
            </div>
          </div>

          {/* Page references */}
          {qa.references && qa.references.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Referenced pages:</p>
              <div className="flex flex-wrap gap-1">
                {qa.references.map((ref, index) => (
                  <button
                    key={index}
                    onClick={() => onPageClick?.(ref.page)}
                    className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                  >
                    Page {ref.page}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const QACard = memo(QACardComponent)
