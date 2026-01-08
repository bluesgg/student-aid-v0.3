'use client'

import { useMemo, useCallback, useState } from 'react'
import { useStickers, useToggleSticker, useDeleteSticker } from '../hooks/use-stickers'
import { useExplainPage } from '../hooks/use-explain-page'
import { useExplainSelection } from '../hooks/use-explain-selection'
import { StickerCard } from './sticker-card'
import { ExplainPageButton } from './explain-page-button'
import { StreamingSticker } from './streaming-sticker'
import type { Sticker, PdfType } from '../api'

interface StickerPanelProps {
  courseId: string
  fileId: string
  currentPage: number
  pdfType: PdfType
  isScanned: boolean
  totalPages: number
}

export function StickerPanel({
  courseId,
  fileId,
  currentPage,
  pdfType,
  isScanned,
  totalPages,
}: StickerPanelProps) {
  const [streamingSelection, setStreamingSelection] = useState<string | null>(null)

  // Fetch all stickers for the file
  const { data: stickersData, isLoading: isLoadingStickers } = useStickers(fileId)

  // Mutations
  const toggleSticker = useToggleSticker()
  const deleteSticker = useDeleteSticker()
  const explainPage = useExplainPage()
  const {
    explain: explainSelection,
    isLoading: isExplainingSelection,
    streamingContent,
    reset: resetSelection,
  } = useExplainSelection()

  // Filter stickers for current page
  const pageStickers = useMemo(() => {
    if (!stickersData?.items) return []
    return stickersData.items.filter((s) => s.page === currentPage)
  }, [stickersData, currentPage])

  // Check if current page has auto stickers
  const hasAutoStickers = useMemo(() => {
    return pageStickers.some((s) => s.type === 'auto')
  }, [pageStickers])

  // Group stickers by type
  const { autoStickers, manualStickers } = useMemo(() => {
    const auto: Sticker[] = []
    const manual: Sticker[] = []

    pageStickers.forEach((s) => {
      if (s.type === 'auto') {
        auto.push(s)
      } else {
        manual.push(s)
      }
    })

    return { autoStickers: auto, manualStickers: manual }
  }, [pageStickers])

  // Handle explain page
  const handleExplainPage = useCallback(() => {
    explainPage.mutate({
      courseId,
      fileId,
      page: currentPage,
      pdfType,
    })
  }, [explainPage, courseId, fileId, currentPage, pdfType])

  // Handle toggle
  const handleToggle = useCallback(
    (stickerId: string, folded: boolean) => {
      toggleSticker.mutate({ stickerId, folded, fileId })
    },
    [toggleSticker, fileId]
  )

  // Handle delete
  const handleDelete = useCallback(
    (stickerId: string) => {
      if (confirm('Delete this sticker?')) {
        deleteSticker.mutate({ stickerId, fileId })
      }
    },
    [deleteSticker, fileId]
  )

  // Handle follow-up question
  const handleFollowUp = useCallback(
    (parentId: string, selectedText: string) => {
      setStreamingSelection(selectedText)
      explainSelection({
        courseId,
        fileId,
        page: currentPage,
        selectedText,
        parentId,
        pdfType,
      }).finally(() => {
        setStreamingSelection(null)
        resetSelection()
      })
    },
    [explainSelection, courseId, fileId, currentPage, pdfType, resetSelection]
  )

  // Handle selection explain from PDF (called from parent)
  const handleSelectionExplain = useCallback(
    (selectedText: string) => {
      setStreamingSelection(selectedText)
      explainSelection({
        courseId,
        fileId,
        page: currentPage,
        selectedText,
        parentId: null,
        pdfType,
      }).finally(() => {
        setStreamingSelection(null)
        resetSelection()
      })
    },
    [explainSelection, courseId, fileId, currentPage, pdfType, resetSelection]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">AI Explanations</h2>
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalPages}
            </p>
          </div>
          <div className="text-xs text-gray-400">
            {pageStickers.length} sticker{pageStickers.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Explain Page Button */}
      {!isScanned && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <ExplainPageButton
            onClick={handleExplainPage}
            isLoading={explainPage.isPending}
            disabled={isScanned}
            hasExistingStickers={hasAutoStickers}
          />
          {explainPage.isError && (
            <p className="mt-2 text-xs text-red-500">
              {explainPage.error instanceof Error
                ? explainPage.error.message
                : 'Failed to explain page'}
            </p>
          )}
        </div>
      )}

      {/* Scanned PDF Warning */}
      {isScanned && (
        <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-yellow-800">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>This PDF is scanned. AI features are limited.</span>
          </div>
        </div>
      )}

      {/* Stickers List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Loading State */}
        {isLoadingStickers && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Streaming Sticker */}
        {streamingSelection && (
          <StreamingSticker
            selectedText={streamingSelection}
            content={streamingContent}
            isLoading={isExplainingSelection}
          />
        )}

        {/* Auto Stickers */}
        {autoStickers.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Page Explanations
            </h3>
            {autoStickers.map((sticker) => (
              <StickerCard
                key={sticker.id}
                sticker={sticker}
                onToggle={(folded) => handleToggle(sticker.id, folded)}
                onDelete={() => handleDelete(sticker.id)}
                onFollowUp={(text) => handleFollowUp(sticker.id, text)}
                isDeleting={deleteSticker.isPending}
              />
            ))}
          </div>
        )}

        {/* Manual Stickers */}
        {manualStickers.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Your Questions
            </h3>
            {manualStickers.map((sticker) => (
              <StickerCard
                key={sticker.id}
                sticker={sticker}
                onToggle={(folded) => handleToggle(sticker.id, folded)}
                onDelete={() => handleDelete(sticker.id)}
                onFollowUp={(text) => handleFollowUp(sticker.id, text)}
                isDeleting={deleteSticker.isPending}
                depth={sticker.depth}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoadingStickers && pageStickers.length === 0 && !streamingSelection && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-gray-100 p-4 mb-3">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">No explanations yet</p>
            <p className="mt-1 text-xs text-gray-500">
              {isScanned
                ? 'AI features are limited for scanned PDFs'
                : 'Click "Explain This Page" or select text in the PDF'}
            </p>
          </div>
        )}
      </div>

      {/* Export handleSelectionExplain for parent component */}
      {/* This is handled via the exposed callback pattern */}
    </div>
  )
}

// Export a version that exposes the selection handler
export type StickerPanelHandle = {
  explainSelection: (selectedText: string) => void
}
