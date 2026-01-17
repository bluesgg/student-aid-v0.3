'use client'

import { useState, memo, useRef, useCallback, useEffect } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import type { Sticker } from '../api'

interface SelectionState {
  text: string
  rect: DOMRect
}

interface StickerCardProps {
  sticker: Sticker
  onToggle: (folded: boolean) => void
  onDelete?: () => void
  onFollowUp?: (selectedText: string) => void
  isDeleting?: boolean
  depth?: number
  /** Callback when mouse enters the card (for region highlighting) */
  onMouseEnter?: () => void
  /** Callback when mouse leaves the card */
  onMouseLeave?: () => void
  /** Whether this card should be highlighted (from PDF region hover) */
  highlighted?: boolean
}

function StickerCardComponent({
  sticker,
  onToggle,
  onDelete,
  onFollowUp,
  isDeleting = false,
  depth = 0,
  onMouseEnter,
  onMouseLeave,
  highlighted = false,
}: StickerCardProps) {
  const [isExpanded, setIsExpanded] = useState(!sticker.folded)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleToggle = () => {
    const newFolded = !sticker.folded
    setIsExpanded(!newFolded)
    onToggle(newFolded)
  }

  // Handle text selection - show popup instead of immediately triggering
  const handleTextSelection = useCallback(() => {
    const windowSelection = window.getSelection()
    if (windowSelection && !windowSelection.isCollapsed && onFollowUp) {
      const selectedText = windowSelection.toString().trim()
      if (selectedText.length > 0) {
        const range = windowSelection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        setSelection({ text: selectedText, rect })
        return
      }
    }
    setSelection(null)
  }, [onFollowUp])

  // Handle explain button click
  const handleExplainClick = useCallback(() => {
    if (selection && onFollowUp) {
      onFollowUp(selection.text)
      setSelection(null)
      window.getSelection()?.removeAllRanges()
    }
  }, [selection, onFollowUp])

  // Dismiss selection popup
  const handleDismiss = useCallback(() => {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  // Handle click outside to dismiss
  useEffect(() => {
    if (!selection) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-sticker-selection-popup]')) {
        setTimeout(() => {
          const currentSelection = window.getSelection()
          if (!currentSelection || currentSelection.isCollapsed) {
            setSelection(null)
          }
        }, 100)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selection])

  // Calculate popup position relative to content container
  const getPopupPosition = useCallback(() => {
    if (!selection || !contentRef.current) return null
    const containerRect = contentRef.current.getBoundingClientRect()
    const top = selection.rect.top - containerRect.top - 45
    const left = selection.rect.left - containerRect.left + selection.rect.width / 2
    const clampedLeft = Math.max(60, Math.min(left, containerRect.width - 60))
    const clampedTop = Math.max(10, top)
    return { top: clampedTop, left: clampedLeft }
  }, [selection])

  const isAutoSticker = sticker.type === 'auto'
  const isFullPageSticker = sticker.anchor.isFullPage === true

  // Build border and background classes based on highlight state
  const borderClass = highlighted
    ? 'border-2 border-blue-500'
    : isAutoSticker
      ? 'border border-blue-200'
      : 'border border-purple-200'

  const bgClass = highlighted
    ? 'bg-blue-50/50'
    : 'bg-white'

  // Animation class for auto stickers (same as StreamingSticker)
  const animationClass = isAutoSticker ? 'animate-in fade-in slide-in-from-top-2' : ''

  return (
    <div
      className={`rounded-lg transition-all duration-200 hover:shadow-md ${borderClass} ${bgClass} ${animationClass} ${
        depth > 0 ? 'ml-4 border-l-4' : ''
      }`}
      style={{
        borderLeftColor: depth > 0 ? (isAutoSticker ? '#93c5fd' : '#c4b5fd') : undefined,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
          isAutoSticker ? 'bg-blue-50' : 'bg-purple-50'
        }`}
        onClick={handleToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              isAutoSticker
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}
          >
            {isAutoSticker ? 'Auto' : 'Manual'}
          </span>
          {isFullPageSticker && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"
                />
              </svg>
              Full Page
            </span>
          )}
          <span className="text-xs text-gray-500 truncate">
            {sticker.anchor.textSnippet}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              disabled={isDeleting}
              className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
              title="Delete sticker"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
          <button
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
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
        <div
          ref={contentRef}
          className="relative px-3 py-2 max-h-80 overflow-y-auto"
          onMouseUp={handleTextSelection}
        >
          <MarkdownRenderer content={sticker.contentMarkdown} />

          {/* Follow-up hint */}
          {onFollowUp && (
            <p className="mt-2 text-xs text-gray-400 italic">
              Select text to ask a follow-up question
            </p>
          )}

          {/* Selection Popup */}
          {selection && onFollowUp && (() => {
            const position = getPopupPosition()
            if (!position) return null
            return (
              <div
                data-sticker-selection-popup
                className="absolute z-50 transform -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-150"
                style={{ top: position.top, left: position.left }}
              >
                <div className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 shadow-lg">
                  <button
                    onClick={handleExplainClick}
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-white transition-colors hover:bg-gray-700"
                  >
                    <svg
                      className="h-4 w-4"
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
                    AI Explain
                  </button>
                  <div className="h-4 w-px bg-gray-700" />
                  <button
                    onClick={handleDismiss}
                    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                    title="Dismiss"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                {/* Arrow pointing down */}
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

export const StickerCard = memo(StickerCardComponent)
