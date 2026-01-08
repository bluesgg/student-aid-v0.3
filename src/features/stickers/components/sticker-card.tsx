'use client'

import { useState, memo } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import type { Sticker } from '../api'

interface StickerCardProps {
  sticker: Sticker
  onToggle: (folded: boolean) => void
  onDelete?: () => void
  onFollowUp?: (selectedText: string) => void
  isDeleting?: boolean
  depth?: number
}

function StickerCardComponent({
  sticker,
  onToggle,
  onDelete,
  onFollowUp,
  isDeleting = false,
  depth = 0,
}: StickerCardProps) {
  const [isExpanded, setIsExpanded] = useState(!sticker.folded)

  const handleToggle = () => {
    const newFolded = !sticker.folded
    setIsExpanded(!newFolded)
    onToggle(newFolded)
  }

  const handleTextSelection = () => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && onFollowUp) {
      const selectedText = selection.toString().trim()
      if (selectedText.length > 0) {
        onFollowUp(selectedText)
      }
    }
  }

  const isAutoSticker = sticker.type === 'auto'

  return (
    <div
      className={`rounded-lg border bg-white transition-shadow hover:shadow-md ${
        isAutoSticker ? 'border-blue-200' : 'border-purple-200'
      } ${depth > 0 ? 'ml-4 border-l-4' : ''}`}
      style={{
        borderLeftColor: depth > 0 ? (isAutoSticker ? '#93c5fd' : '#c4b5fd') : undefined,
      }}
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
          className="px-3 py-2 max-h-80 overflow-y-auto"
          onMouseUp={handleTextSelection}
        >
          <MarkdownRenderer content={sticker.contentMarkdown} />

          {/* Follow-up hint */}
          {onFollowUp && (
            <p className="mt-2 text-xs text-gray-400 italic">
              Select text to ask a follow-up question
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export const StickerCard = memo(StickerCardComponent)
