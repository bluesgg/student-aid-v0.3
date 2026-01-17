'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'

interface TextSelectionPopupProps {
  selection: {
    text: string
    rect: DOMRect | null
    page: number
  } | null
  containerRef: React.RefObject<HTMLElement>
  onExplain: (text: string, page: number, rect: DOMRect | null) => void
  onDismiss: () => void
  disabled?: boolean
}

export function TextSelectionPopup({
  selection,
  containerRef,
  onExplain,
  onDismiss,
  disabled = false,
}: TextSelectionPopupProps) {
  const t = useTranslations('reader.textSelection')
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  // Calculate popup position
  useEffect(() => {
    if (!selection?.rect || !containerRef.current) {
      setPosition(null)
      return
    }

    const containerRect = containerRef.current.getBoundingClientRect()

    // Position popup above the selection
    const top = selection.rect.top - containerRect.top - 45
    const left = selection.rect.left - containerRect.left + selection.rect.width / 2

    // Clamp position to stay within container
    const clampedLeft = Math.max(60, Math.min(left, containerRect.width - 60))
    const clampedTop = Math.max(10, top)

    setPosition({ top: clampedTop, left: clampedLeft })
  }, [selection, containerRef])

  // Handle explain click
  const handleExplain = useCallback(() => {
    if (selection && !disabled) {
      onExplain(selection.text, selection.page, selection.rect)
    }
  }, [selection, onExplain, disabled])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-selection-popup]')) {
        // Small delay to allow the selection to be processed first
        setTimeout(() => {
          const currentSelection = window.getSelection()
          if (!currentSelection || currentSelection.isCollapsed) {
            onDismiss()
          }
        }, 100)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onDismiss])

  if (!selection || !position) {
    return null
  }

  return (
    <div
      data-selection-popup
      className="absolute z-50 transform -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 shadow-lg">
        <button
          onClick={handleExplain}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
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
          {t('explain')}
        </button>
        <div className="h-4 w-px bg-gray-700" />
        <button
          onClick={onDismiss}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          title={t('dismiss')}
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
}
