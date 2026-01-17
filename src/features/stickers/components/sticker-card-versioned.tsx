'use client'

import { useState, useCallback, memo } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import {
  refreshSticker,
  switchStickerVersion,
  type StickerWithVersions,
} from '../api-version-additions'

interface StickerCardVersionedProps {
  sticker: StickerWithVersions
  onToggle: (folded: boolean) => void
  onDelete?: () => void
  onFollowUp?: (selectedText: string) => void
  isDeleting?: boolean
  depth?: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onVersionChange?: (sticker: StickerWithVersions) => void
}

function StickerCardVersionedComponent({
  sticker,
  onToggle,
  onDelete,
  onFollowUp,
  isDeleting = false,
  depth = 0,
  onMouseEnter,
  onMouseLeave,
  onVersionChange,
}: StickerCardVersionedProps) {
  const [isExpanded, setIsExpanded] = useState(!sticker.folded)
  const [currentVersion, setCurrentVersion] = useState(sticker.currentVersion || 1)
  const [currentContent, setCurrentContent] = useState(sticker.contentMarkdown)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [totalVersions, setTotalVersions] = useState(sticker.totalVersions || 1)

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

  const handleRefresh = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isRefreshing) return

      setIsRefreshing(true)
      try {
        const result = await refreshSticker(sticker.id)
        if (result.ok && result.data) {
          const updated = result.data.sticker
          setCurrentVersion(updated.currentVersion)
          setCurrentContent(updated.contentMarkdown)
          setTotalVersions(updated.totalVersions)
          onVersionChange?.(updated)
        }
      } catch (error) {
        console.error('Error refreshing sticker:', error)
      } finally {
        setIsRefreshing(false)
      }
    },
    [sticker.id, isRefreshing, onVersionChange]
  )

  const handleVersionSwitch = useCallback(
    async (targetVersion: 1 | 2) => {
      if (isSwitching || currentVersion === targetVersion) return

      setIsSwitching(true)
      try {
        const result = await switchStickerVersion(sticker.id, targetVersion)
        if (result.ok && result.data) {
          setCurrentVersion(result.data.currentVersion)
          setCurrentContent(result.data.contentMarkdown)
        }
      } catch (error) {
        console.error('Error switching version:', error)
      } finally {
        setIsSwitching(false)
      }
    },
    [sticker.id, isSwitching, currentVersion]
  )

  const handlePrevVersion = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (currentVersion > 1) {
        handleVersionSwitch((currentVersion - 1) as 1 | 2)
      }
    },
    [currentVersion, handleVersionSwitch]
  )

  const handleNextVersion = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (currentVersion < totalVersions) {
        handleVersionSwitch((currentVersion + 1) as 1 | 2)
      }
    },
    [currentVersion, totalVersions, handleVersionSwitch]
  )

  const isAutoSticker = sticker.type === 'auto'
  const hasVersions = totalVersions > 1
  const canGoPrev = currentVersion > 1
  const canGoNext = currentVersion < totalVersions

  return (
    <div
      className={`rounded-lg border bg-white transition-shadow hover:shadow-md ${
        isAutoSticker ? 'border-blue-200' : 'border-purple-200'
      } ${depth > 0 ? 'ml-4 border-l-4' : ''}`}
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
          <span className="text-xs text-gray-500 truncate">
            {sticker.anchor.textSnippet}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Refresh button (auto stickers only) */}
          {isAutoSticker && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`p-1 rounded transition-colors ${
                isRefreshing
                  ? 'text-gray-300'
                  : 'text-gray-400 hover:text-blue-500'
              }`}
              title="Regenerate explanation"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}

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
        <div className="px-3 py-2">
          <div className="max-h-80 overflow-y-auto" onMouseUp={handleTextSelection}>
            <MarkdownRenderer content={currentContent} />
          </div>

          {/* Version Controls */}
          {isAutoSticker && (
            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {/* Previous version */}
                <button
                  onClick={handlePrevVersion}
                  disabled={!canGoPrev || isSwitching}
                  className={`p-1 rounded transition-colors ${
                    canGoPrev && !isSwitching
                      ? 'text-gray-500 hover:text-blue-500 hover:bg-blue-50'
                      : 'text-gray-300 cursor-not-allowed'
                  }`}
                  title="Previous version"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                {/* Version indicator */}
                <span className="text-xs text-gray-500 min-w-[40px] text-center">
                  {hasVersions ? `${currentVersion}/${totalVersions}` : '1/1'}
                </span>

                {/* Next version */}
                <button
                  onClick={handleNextVersion}
                  disabled={!canGoNext || isSwitching}
                  className={`p-1 rounded transition-colors ${
                    canGoNext && !isSwitching
                      ? 'text-gray-500 hover:text-blue-500 hover:bg-blue-50'
                      : 'text-gray-300 cursor-not-allowed'
                  }`}
                  title="Next version"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>

              {/* Follow-up hint */}
              {onFollowUp && (
                <p className="text-xs text-gray-400 italic">
                  Select text to ask a follow-up
                </p>
              )}
            </div>
          )}

          {/* Follow-up hint for manual stickers */}
          {!isAutoSticker && onFollowUp && (
            <p className="mt-2 text-xs text-gray-400 italic">
              Select text to ask a follow-up question
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export const StickerCardVersioned = memo(StickerCardVersionedComponent)
