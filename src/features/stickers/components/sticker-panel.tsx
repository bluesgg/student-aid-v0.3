'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useStickers, useToggleSticker, useDeleteSticker } from '../hooks/use-stickers'
import { useExplainSelection } from '../hooks/use-explain-selection'
import { useHoverHighlight } from '../context'
import { StickerCard } from './sticker-card'
import { StreamingSticker } from './streaming-sticker'
import type { Sticker, PdfType } from '../api'

interface StickerPanelProps {
  courseId: string
  fileId: string
  currentPage: number
  pdfType: PdfType
  isScanned: boolean
  totalPages: number
  /** Callback when hovering a sticker (for highlighting regions in PDF) */
  onStickerHover?: (stickerId: string | null, regionIds: string[]) => void
  /** Callback to start auto-explain session from current page */
  onStartAutoExplain?: () => void
  /** Whether auto-explain session is active */
  isAutoExplainActive?: boolean
  /** Whether auto-explain is starting */
  isAutoExplainStarting?: boolean
  /** Progress of the auto-explain session */
  autoExplainProgress?: { completed: number; total: number }
  autoExplainWindowRange?: { start: number; end: number }
  autoExplainError?: string | null
  /** Whether the current page is being processed by auto-explain */
  isCurrentPageProcessing?: boolean
}

export function StickerPanel({
  courseId,
  fileId,
  currentPage,
  pdfType,
  isScanned,
  totalPages,
  onStickerHover,
  onStartAutoExplain,
  isAutoExplainActive = false,
  isAutoExplainStarting = false,
  autoExplainProgress,
  autoExplainWindowRange,
  autoExplainError,
  isCurrentPageProcessing = false,
}: StickerPanelProps) {
  const [streamingSelection, setStreamingSelection] = useState<string | null>(null)

  // Track new auto stickers for typewriter effect
  const [streamingAutoSticker, setStreamingAutoSticker] = useState<{
    sticker: Sticker
    displayedContent: string
    isComplete: boolean
  } | null>(null)
  const prevAutoStickerIdsRef = useRef<Set<string>>(new Set())

  // Fetch all stickers for the file
  const { data: stickersData, isLoading: isLoadingStickers } = useStickers(fileId)

  // Mutations
  const toggleSticker = useToggleSticker()
  const deleteSticker = useDeleteSticker()
  const {
    explain: explainSelection,
    isLoading: isExplainingSelection,
    streamingContent,
    reset: resetSelection,
  } = useExplainSelection()

  // Hover highlight context for bidirectional hover
  const {
    setHoveredStickerId,
    setHoveredStickerAnchor,
    matchingStickers,
  } = useHoverHighlight()

  // Filter stickers for current page
  const pageStickers = useMemo(() => {
    if (!stickersData?.items) return []
    return stickersData.items.filter((s) => s.page === currentPage)
  }, [stickersData, currentPage])

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

  // Detect new auto stickers and start typewriter effect
  useEffect(() => {
    const currentIds = new Set(autoStickers.map(s => s.id))
    const prevIds = prevAutoStickerIdsRef.current

    // Find new stickers (in current but not in previous)
    const newStickers = autoStickers.filter(s => !prevIds.has(s.id))

    // If there's a new sticker and we're not already streaming one
    if (newStickers.length > 0 && !streamingAutoSticker) {
      const newSticker = newStickers[0]
      setStreamingAutoSticker({
        sticker: newSticker,
        displayedContent: '',
        isComplete: false,
      })
    }

    // Update ref
    prevAutoStickerIdsRef.current = currentIds
  }, [autoStickers, streamingAutoSticker])

  // Typewriter effect for streaming auto sticker
  useEffect(() => {
    if (!streamingAutoSticker || streamingAutoSticker.isComplete) return

    const fullContent = streamingAutoSticker.sticker.contentMarkdown
    const currentLength = streamingAutoSticker.displayedContent.length

    if (currentLength >= fullContent.length) {
      // Complete the streaming
      setStreamingAutoSticker(prev => prev ? { ...prev, isComplete: true } : null)
      // Clear after a short delay
      setTimeout(() => {
        setStreamingAutoSticker(null)
      }, 100)
      return
    }

    // Add characters progressively
    const timeoutId = setTimeout(() => {
      const charsToAdd = Math.min(5, fullContent.length - currentLength)
      setStreamingAutoSticker(prev => prev ? {
        ...prev,
        displayedContent: fullContent.slice(0, currentLength + charsToAdd),
      } : null)
    }, 10)

    return () => clearTimeout(timeoutId)
  }, [streamingAutoSticker])

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

  // Handle sticker hover for region highlighting
  const handleStickerMouseEnter = useCallback(
    (sticker: Sticker) => {
      // Skip hover highlighting for full-page stickers (PPT type)
      if (sticker.anchor.isFullPage) {
        return
      }

      // Set hovered sticker ID in context
      setHoveredStickerId(sticker.id)

      // Set anchor rect for PDF highlighting
      const rect = sticker.anchor.rect
      if (rect) {
        setHoveredStickerAnchor(sticker.page, rect)
      }

      // Also call legacy callback for image region highlighting
      if (onStickerHover) {
        const anchor = sticker.anchor as { anchors?: Array<{ kind: string; id?: string }> }
        const regionIds = (anchor?.anchors || [])
          .filter(a => a.kind === 'image' && a.id)
          .map(a => a.id as string)

        onStickerHover(sticker.id, regionIds)
      }
    },
    [onStickerHover, setHoveredStickerId, setHoveredStickerAnchor]
  )

  const handleStickerMouseLeave = useCallback(() => {
    setHoveredStickerId(null)
    setHoveredStickerAnchor(null, null)
    onStickerHover?.(null, [])
  }, [onStickerHover, setHoveredStickerId, setHoveredStickerAnchor])

  // Calculate progress percentage
  const progressPercentage = autoExplainProgress
    ? (autoExplainProgress.completed / autoExplainProgress.total) * 100
    : 0

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

      {/* Auto-Explain Button with Progress Bar */}
      {!isScanned && onStartAutoExplain && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <button
            onClick={onStartAutoExplain}
            disabled={isAutoExplainActive || isAutoExplainStarting}
            className={`w-full overflow-hidden rounded-lg transition-all duration-200 ${
              isAutoExplainStarting || isAutoExplainActive ? 'animate-in fade-in slide-in-from-top-2' : ''
            }`}
          >
            {/* Button body */}
            <div
              className={`flex items-center justify-center gap-2 px-4 py-2.5 ${
                autoExplainError
                  ? 'bg-red-50 text-red-700'
                  : isAutoExplainActive
                    ? 'bg-green-50 text-green-700'
                    : isAutoExplainStarting
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {/* Icon / Loading Animation */}
              {isAutoExplainStarting ? (
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : autoExplainError ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : isAutoExplainActive ? (
                <div className="w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}

              {/* Text - shows page range when active */}
              <span className="text-sm font-medium">
                {isAutoExplainStarting
                  ? 'Starting...'
                  : autoExplainError
                    ? 'Error - Try Again'
                    : isAutoExplainActive && autoExplainProgress && autoExplainWindowRange
                      ? `Pages ${autoExplainWindowRange.start}-${autoExplainWindowRange.end} (${autoExplainProgress.completed}/${autoExplainProgress.total})`
                      : isAutoExplainActive
                        ? 'Explaining...'
                        : 'Explain From This Page'}
              </span>
            </div>

            {/* Progress bar (only shows when active) */}
            {isAutoExplainActive && autoExplainProgress && (
              <div className="h-1.5 bg-green-100">
                <div
                  className="h-full bg-green-500 transition-all duration-500 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            )}

            {/* Error progress bar */}
            {autoExplainError && <div className="h-1.5 bg-red-500" />}
          </button>
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
        {(autoStickers.length > 0 || isCurrentPageProcessing) && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Page Explanations
            </h3>
            {/* Auto-explain Processing Sticker */}
            {isCurrentPageProcessing && (
              <div className="rounded-lg border border-blue-300 bg-white animate-in fade-in slide-in-from-top-2">
                {/* Header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                    Auto
                  </span>
                  <span className="text-xs text-gray-500">Generating explanation...</span>
                  <div className="ml-auto w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                </div>
                {/* Content */}
                <div className="px-3 py-2 min-h-[60px]">
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm">Analyzing page content...</span>
                  </div>
                </div>
              </div>
            )}
            {autoStickers.map((sticker) => {
              // Check if this sticker is currently streaming
              const isStreaming = streamingAutoSticker?.sticker.id === sticker.id && !streamingAutoSticker.isComplete

              if (isStreaming) {
                return (
                  <StreamingSticker
                    key={sticker.id}
                    selectedText={sticker.anchor.textSnippet}
                    content={streamingAutoSticker.displayedContent}
                    isLoading={true}
                    variant="auto"
                  />
                )
              }

              return (
                <StickerCard
                  key={sticker.id}
                  sticker={sticker}
                  onToggle={(folded) => handleToggle(sticker.id, folded)}
                  onDelete={() => handleDelete(sticker.id)}
                  onFollowUp={(text) => handleFollowUp(sticker.id, text)}
                  isDeleting={deleteSticker.isPending}
                  onMouseEnter={() => handleStickerMouseEnter(sticker)}
                  onMouseLeave={handleStickerMouseLeave}
                  highlighted={matchingStickers.includes(sticker.id)}
                />
              )
            })}
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
                highlighted={matchingStickers.includes(sticker.id)}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoadingStickers && pageStickers.length === 0 && !streamingSelection && !isCurrentPageProcessing && (
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
                : 'Click "Explain From This Page" or select text in the PDF'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
