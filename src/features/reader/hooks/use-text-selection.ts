'use client'

import { useState, useCallback, useEffect } from 'react'

interface TextSelection {
  text: string
  rect: DOMRect | null
  page: number
}

interface UseTextSelectionProps {
  containerRef: React.RefObject<HTMLElement>
  currentPage: number
  enabled?: boolean
}

interface UseTextSelectionReturn {
  selection: TextSelection | null
  clearSelection: () => void
  hasSelection: boolean
}

export function useTextSelection({
  containerRef,
  currentPage,
  enabled = true,
}: UseTextSelectionProps): UseTextSelectionReturn {
  const [selection, setSelection] = useState<TextSelection | null>(null)

  // Handle text selection
  const handleSelectionChange = useCallback(() => {
    if (!enabled) return

    const windowSelection = window.getSelection()
    if (!windowSelection || windowSelection.isCollapsed) {
      setSelection(null)
      return
    }

    const selectedText = windowSelection.toString().trim()
    if (!selectedText) {
      setSelection(null)
      return
    }

    // Check if selection is within our container
    const range = windowSelection.getRangeAt(0)
    const container = containerRef.current
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }

    // Get the bounding rect of the selection
    const rect = range.getBoundingClientRect()

    setSelection({
      text: selectedText,
      rect,
      page: currentPage,
    })
  }, [containerRef, currentPage, enabled])

  // Clear selection
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  // Listen for selection changes
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [handleSelectionChange])

  // Clear selection when page changes
  useEffect(() => {
    setSelection(null)
  }, [currentPage])

  return {
    selection,
    clearSelection,
    hasSelection: selection !== null && selection.text.length > 0,
  }
}
