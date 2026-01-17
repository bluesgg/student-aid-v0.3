'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { type ReaderMode } from '@/lib/reader/types'

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
  /** Whether page position is being saved */
  isSaving?: boolean
  /** Whether image selection mode is active */
  selectionMode?: boolean
  /** Callback to toggle selection mode */
  onSelectionModeChange?: (enabled: boolean) => void
  /** Whether selection mode is available (e.g., disabled for scanned PDFs) */
  selectionModeAvailable?: boolean
  /** Whether generation is in progress */
  isGenerating?: boolean
  /** Current reader mode (page or scroll) */
  readerMode?: ReaderMode
  /** Callback to change reader mode */
  onReaderModeChange?: (mode: ReaderMode) => void
  /** Whether auto image detection is enabled (shows "Add Image" instead of "Select Images") */
  isAutoImageDetectionEnabled?: boolean
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
  isSaving: _isSaving,
  selectionMode = false,
  onSelectionModeChange,
  selectionModeAvailable = true,
  isGenerating = false,
  readerMode = 'page',
  onReaderModeChange,
  isAutoImageDetectionEnabled = false,
}: PdfToolbarProps) {
  const t = useTranslations('reader')
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
          title={t('toolbar.previousPage')}
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
          title={t('toolbar.nextPage')}
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
          title={t('toolbar.zoomOut')}
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
          <option value="fit-width">{t('zoom.fitWidth')}</option>
          <option value="fit-page">{t('zoom.fitPage')}</option>
          <optgroup label={t('zoom.label')}>
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
          title={t('toolbar.zoomIn')}
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

        {/* Reader Mode Toggle */}
        {onReaderModeChange && (
          <div className="ml-2 border-l border-gray-200 pl-2">
            <div
              role="radiogroup"
              aria-label={t('readerMode.pageLabel')}
              className="flex rounded-md border border-gray-300 bg-gray-50"
            >
              <button
                role="radio"
                aria-checked={readerMode === 'page'}
                tabIndex={readerMode === 'page' ? 0 : -1}
                onClick={() => onReaderModeChange('page')}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    onReaderModeChange('scroll')
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                  readerMode === 'page'
                    ? 'bg-white text-gray-900 shadow-sm rounded-l-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title={t('readerMode.pageTitle')}
              >
                {/* Page icon */}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="hidden sm:inline">{t('readerMode.pageLabel')}</span>
              </button>
              <button
                role="radio"
                aria-checked={readerMode === 'scroll'}
                tabIndex={readerMode === 'scroll' ? 0 : -1}
                onClick={() => onReaderModeChange('scroll')}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    onReaderModeChange('page')
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                  readerMode === 'scroll'
                    ? 'bg-white text-gray-900 shadow-sm rounded-r-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title={t('readerMode.scrollTitle')}
              >
                {/* Scroll icon */}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
                <span className="hidden sm:inline">{t('readerMode.scrollLabel')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selection Mode Toggle & Status */}
      <div className="flex items-center gap-3">
        {/* Image Selection Toggle / Mark Image Button */}
        {onSelectionModeChange && (
          <button
            onClick={() => onSelectionModeChange(!selectionMode)}
            disabled={!selectionModeAvailable || isGenerating}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${
              selectionMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            } disabled:cursor-not-allowed disabled:opacity-50`}
            title={
              !selectionModeAvailable
                ? t('scannedNotAvailable')
                : selectionMode
                ? t('exitMarkMode')
                : isAutoImageDetectionEnabled
                ? t('markImageTooltip')
                : t('selectImages')
            }
          >
            {/* Tag icon for "Mark Image", Bounding box for "Select Images" */}
            {isAutoImageDetectionEnabled && !selectionMode ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
            )}
            <span className="hidden sm:inline">
              {selectionMode
                ? isAutoImageDetectionEnabled ? t('exitMarkMode') : t('exitSelection')
                : isAutoImageDetectionEnabled
                ? t('markImage')
                : t('selectImages')}
            </span>
          </button>
        )}

        {/* Generation in progress indicator */}
        {isGenerating && (
          <span className="flex items-center gap-1.5 text-sm text-blue-600">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="hidden sm:inline">{t('toolbar.generating')}</span>
          </span>
        )}
      </div>
    </div>
  )
}
