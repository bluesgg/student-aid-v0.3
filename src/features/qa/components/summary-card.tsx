'use client'

import { memo, useState } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import type { Summary, SummaryResponse } from '../api'

interface SummaryCardProps {
  summary: Summary | SummaryResponse
  isStreaming?: boolean
  onClose?: () => void
}

function SummaryCardComponent({ summary, isStreaming = false, onClose }: SummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const content = 'content' in summary ? summary.content : summary.contentMarkdown
  const type = summary.type
  const pageRange =
    summary.pageRangeStart && summary.pageRangeEnd
      ? `Pages ${summary.pageRangeStart}-${summary.pageRangeEnd}`
      : null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div
      className={`rounded-lg border bg-white overflow-hidden ${
        type === 'document' ? 'border-indigo-200' : 'border-teal-200'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer ${
          type === 'document' ? 'bg-indigo-50' : 'bg-teal-50'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
              type === 'document' ? 'bg-indigo-100' : 'bg-teal-100'
            }`}
          >
            {type === 'document' ? (
              <svg
                className="w-4 h-4 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-teal-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                type === 'document'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-teal-100 text-teal-700'
              }`}
            >
              {type === 'document' ? 'Document Summary' : 'Section Summary'}
            </span>
            {pageRange && (
              <span className="ml-2 text-xs text-gray-500">{pageRange}</span>
            )}
          </div>
          {isStreaming && (
            <div className="ml-2 w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {'cached' in summary && summary.cached && (
            <span className="text-xs text-gray-400">Cached</span>
          )}
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
          <button className="p-1 text-gray-400 hover:text-gray-600 rounded">
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
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 max-h-96 overflow-y-auto">
          {content ? (
            <>
              <MarkdownRenderer content={content} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-0.5" />
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              <span className="text-sm">Generating summary...</span>
            </div>
          )}

          {/* Footer with date */}
          {!isStreaming && content && (
            <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
              Generated {formatDate(summary.createdAt)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const SummaryCard = memo(SummaryCardComponent)
