'use client'

import { useCallback, useRef, useEffect, memo, CSSProperties } from 'react'
import { VariableSizeList } from 'react-window'
import { Page } from 'react-pdf'

interface VirtualPdfListProps {
  numPages: number
  scale: number
  pageWidth: number
  pageHeights: number[]
  currentPage: number
  onPageInViewChange: (page: number) => void
}

// Threshold for using virtual scrolling
export const VIRTUAL_SCROLL_THRESHOLD = 50

interface PageRowData {
  scale: number
  pageWidth: number
  onPageInViewChange: (page: number) => void
}

interface PageRowProps {
  index: number
  style: CSSProperties
  data: PageRowData
}

// Memoized page row component
const PageRow = memo(function PageRow({ index, style, data }: PageRowProps) {
  const pageNumber = index + 1
  const { scale, pageWidth } = data

  return (
    <div style={style} className="flex justify-center py-2">
      <div className="shadow-lg">
        <Page
          pageNumber={pageNumber}
          scale={scale}
          width={pageWidth}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          loading={
            <div
              className="flex items-center justify-center bg-gray-100"
              style={{ width: pageWidth * scale, height: pageWidth * 1.4 * scale }}
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          }
        />
      </div>
    </div>
  )
})

export function VirtualPdfList({
  numPages,
  scale,
  pageWidth,
  pageHeights,
  currentPage,
  onPageInViewChange,
}: VirtualPdfListProps) {
  const listRef = useRef<VariableSizeList<PageRowData>>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const lastScrolledPageRef = useRef<number>(currentPage)

  // Get item size for a page
  const getItemSize = useCallback(
    (index: number) => {
      // Use estimated height if not measured yet
      const baseHeight = pageHeights[index] || pageWidth * 1.4
      return baseHeight * scale + 16 // Add padding
    },
    [pageHeights, pageWidth, scale]
  )

  // Scroll to current page when it changes externally
  useEffect(() => {
    if (listRef.current && currentPage !== lastScrolledPageRef.current) {
      listRef.current.scrollToItem(currentPage - 1, 'start')
      lastScrolledPageRef.current = currentPage
    }
  }, [currentPage])

  // Reset cache when scale changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0)
    }
  }, [scale, pageHeights])

  // Handle scroll to detect current page in view
  const handleScroll = useCallback(
    ({ scrollOffset }: { scrollOffset: number }) => {
      // Calculate which page is in view based on scroll position
      let cumulativeHeight = 0
      for (let i = 0; i < numPages; i++) {
        cumulativeHeight += getItemSize(i)
        if (cumulativeHeight > scrollOffset + 100) {
          // 100px offset for better detection
          const newPage = i + 1
          if (newPage !== lastScrolledPageRef.current) {
            lastScrolledPageRef.current = newPage
            onPageInViewChange(newPage)
          }
          break
        }
      }
    },
    [numPages, getItemSize, onPageInViewChange]
  )

  // Item data for the list
  const itemData = {
    scale,
    pageWidth,
    onPageInViewChange,
  }

  return (
    <VariableSizeList
      ref={listRef}
      outerRef={outerRef}
      height={window.innerHeight - 120} // Subtract toolbar and header height
      width="100%"
      itemCount={numPages}
      itemSize={getItemSize}
      itemData={itemData}
      onScroll={handleScroll}
      overscanCount={2}
      className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100"
    >
      {PageRow}
    </VariableSizeList>
  )
}
