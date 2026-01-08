'use client'

import { useState, useCallback } from 'react'

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

interface PdfToolbarProps {
  currentPage: number
  totalPages: number
  scale: number
  zoomMode: ZoomMode
  onPageChange: (page: number) => void
  onScaleChange: (scale: number) => void
  onZoomModeChange: (mode: ZoomMode) => void
  onPreviousPage: () => void
  onNextPage: () => void
  canGoPrevious: boolean
  canGoNext: boolean
  isSaving?: boolean
}

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function PdfToolbar({
  currentPage,
  totalPages,
  scale,
  zoomMode,
  onPageChange,
  onScaleChange,
  onZoomModeChange,
  onPreviousPage,
  onNextPage,
  canGoPrevious,
  canGoNext,
  isSaving,
}: PdfToolbarProps) {
  const [pageInput, setPageInput] = useState(currentPage.toString())

  // Handle page input change
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value)
  }

  // Handle page input submit
  const handlePageInputSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const page = parseInt(pageInput, 10)
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        onPageChange(page)
      } else {
        setPageInput(currentPage.toString())
      }
    },
    [pageInput, totalPages, currentPage, onPageChange]
  )

  // Handle zoom change
  const handleZoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value === 'fit-width' || value === 'fit-page') {
      onZoomModeChange(value)
    } else {
      onZoomModeChange('custom')
      onScaleChange(parseFloat(value))
    }
  }

  // Zoom in/out by 25%
  const zoomIn = () => {
    onZoomModeChange('custom')
    onScaleChange(Math.min(scale + 0.25, 3))
  }

  const zoomOut = () => {
    onZoomModeChange('custom')
    onScaleChange(Math.max(scale - 0.25, 0.25))
  }

  // Update page input when currentPage changes externally
  if (pageInput !== currentPage.toString() && document.activeElement?.id !== 'page-input') {
    setPageInput(currentPage.toString())
  }

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
      {/* Navigation Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPreviousPage}
          disabled={!canGoPrevious}
          className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Previous page"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
          <input
            id="page-input"
            type="text"
            value={pageInput}
            onChange={handlePageInputChange}
            className="w-12 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">/ {totalPages}</span>
        </form>

        <button
          onClick={onNextPage}
          disabled={!canGoNext}
          className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Next page"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={zoomOut}
          disabled={scale <= 0.25}
          className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom out"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 12H4"
            />
          </svg>
        </button>

        <select
          value={zoomMode === 'custom' ? scale.toString() : zoomMode}
          onChange={handleZoomChange}
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="fit-width">Fit Width</option>
          <option value="fit-page">Fit Page</option>
          <optgroup label="Zoom">
            {ZOOM_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {Math.round(preset * 100)}%
              </option>
            ))}
          </optgroup>
        </select>

        <button
          onClick={zoomIn}
          disabled={scale >= 3}
          className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom in"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* Save Status */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {isSaving && (
          <span className="flex items-center gap-1">
            <div className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
            Saving...
          </span>
        )}
      </div>
    </div>
  )
}
