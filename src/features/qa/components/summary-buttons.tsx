'use client'

import { memo, useState } from 'react'

interface SummaryButtonsProps {
  onDocumentSummary: () => void
  onSectionSummary: (startPage: number, endPage: number) => void
  isLoading: boolean
  disabled?: boolean
  totalPages: number
  currentPage?: number
}

function SummaryButtonsComponent({
  onDocumentSummary,
  onSectionSummary,
  isLoading,
  disabled = false,
  totalPages,
  currentPage = 1,
}: SummaryButtonsProps) {
  const [showSectionInput, setShowSectionInput] = useState(false)
  const [startPage, setStartPage] = useState(currentPage)
  const [endPage, setEndPage] = useState(Math.min(currentPage + 4, totalPages))

  const handleSectionSummary = () => {
    if (startPage >= 1 && endPage <= totalPages && startPage <= endPage) {
      onSectionSummary(startPage, endPage)
      setShowSectionInput(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={onDocumentSummary}
          disabled={disabled || isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          <span>Full Summary</span>
        </button>

        <button
          onClick={() => setShowSectionInput(!showSectionInput)}
          disabled={disabled || isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16m-7 6h7"
            />
          </svg>
          <span>Section</span>
        </button>
      </div>

      {/* Section page range input */}
      {showSectionInput && (
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 animate-in slide-in-from-top-2">
          <p className="text-xs text-gray-600 mb-2">Select page range to summarize:</p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="sr-only">Start page</label>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={startPage}
                onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="From"
              />
            </div>
            <span className="text-gray-400">to</span>
            <div className="flex-1">
              <label className="sr-only">End page</label>
              <input
                type="number"
                min={startPage}
                max={totalPages}
                value={endPage}
                onChange={(e) =>
                  setEndPage(Math.min(totalPages, parseInt(e.target.value) || totalPages))
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="To"
              />
            </div>
            <button
              onClick={handleSectionSummary}
              disabled={
                isLoading ||
                startPage < 1 ||
                endPage > totalPages ||
                startPage > endPage
              }
              className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Go
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {totalPages} pages total
          </p>
        </div>
      )}
    </div>
  )
}

export const SummaryButtons = memo(SummaryButtonsComponent)
