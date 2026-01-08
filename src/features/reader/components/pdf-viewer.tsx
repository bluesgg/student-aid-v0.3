'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Document } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

// Import worker configuration
import '@/lib/pdf/worker'

import { usePdfDocument } from '../hooks/use-pdf-document'
import { usePageNavigation } from '../hooks/use-page-navigation'
import { useLastReadPage } from '../hooks/use-last-read-page'
import { useTextSelection } from '../hooks/use-text-selection'
import { PdfToolbar, ZoomMode } from './pdf-toolbar'
import { PdfPage } from './pdf-page'
import { TextSelectionPopup } from './text-selection-popup'
import { VirtualPdfList, VIRTUAL_SCROLL_THRESHOLD } from './virtual-pdf-list'

interface PdfViewerProps {
  fileUrl: string
  courseId: string
  fileId: string
  initialPage: number
  totalPages: number
  isScanned: boolean
  onSelectionExplain?: (text: string, page: number, rect: DOMRect | null) => void
  onPageChange?: (page: number) => void
}

export function PdfViewer({
  fileUrl,
  courseId,
  fileId,
  initialPage,
  totalPages,
  isScanned,
  onSelectionExplain,
  onPageChange,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width')
  const [containerWidth, setContainerWidth] = useState(600)
  const [pageHeights, setPageHeights] = useState<number[]>([])

  // PDF document state
  const { numPages, isLoading, error, onDocumentLoadSuccess, onDocumentLoadError } =
    usePdfDocument()

  // Last read page persistence
  const { currentPage, setPage: setPageInternal, isSaving } = useLastReadPage({
    courseId,
    fileId,
    initialPage,
    totalPages: numPages || totalPages,
  })

  // Wrap setPage to notify parent of page changes
  const setPage = useCallback(
    (page: number) => {
      setPageInternal(page)
      onPageChange?.(page)
    },
    [setPageInternal, onPageChange]
  )

  // Page navigation
  const {
    goToPage,
    goToNextPage,
    goToPreviousPage,
    canGoNext,
    canGoPrevious,
  } = usePageNavigation({
    totalPages: numPages || totalPages,
    initialPage: currentPage,
    onPageChange: setPage,
  })

  // Text selection
  const { selection, clearSelection, hasSelection } = useTextSelection({
    containerRef: containerRef as React.RefObject<HTMLElement>,
    currentPage,
    enabled: !isScanned,
  })

  // Calculate container width for fit modes
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 48) // Subtract padding
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Calculate scale based on zoom mode
  useEffect(() => {
    if (zoomMode === 'fit-width') {
      // Assuming standard PDF page width is about 612 points (8.5 inches at 72 DPI)
      const fitScale = containerWidth / 612
      setScale(Math.max(0.5, Math.min(2, fitScale)))
    } else if (zoomMode === 'fit-page') {
      // Fit page considers both width and height
      // Assuming standard page aspect ratio of ~1.4 (letter size)
      const containerHeight = containerRef.current?.clientHeight || 800
      const fitWidthScale = containerWidth / 612
      const fitHeightScale = (containerHeight - 100) / 792 // Standard page height minus toolbar
      setScale(Math.max(0.5, Math.min(2, Math.min(fitWidthScale, fitHeightScale))))
    }
  }, [zoomMode, containerWidth])

  // Handle page width for react-pdf
  const pageWidth = zoomMode === 'custom' ? undefined : containerWidth / scale

  // Handle explain selection
  const handleExplain = useCallback(
    (text: string, page: number, rect: DOMRect | null) => {
      onSelectionExplain?.(text, page, rect)
      clearSelection()
    },
    [onSelectionExplain, clearSelection]
  )

  // Store page heights for virtual scrolling
  const handlePageLoadSuccess = useCallback(
    (page: { pageNumber: number; height: number; width: number }) => {
      setPageHeights((prev) => {
        const newHeights = [...prev]
        newHeights[page.pageNumber - 1] = page.height
        return newHeights
      })
    },
    []
  )

  // Use virtual scrolling for large documents
  const useVirtualScrolling = (numPages || totalPages) > VIRTUAL_SCROLL_THRESHOLD

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <PdfToolbar
        currentPage={currentPage}
        totalPages={numPages || totalPages}
        scale={scale}
        zoomMode={zoomMode}
        onPageChange={goToPage}
        onScaleChange={setScale}
        onZoomModeChange={setZoomMode}
        onPreviousPage={goToPreviousPage}
        onNextPage={goToNextPage}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        isSaving={isSaving}
      />

      {/* PDF Content */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto bg-gray-100 p-6"
      >
        {/* Loading State */}
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              <span className="text-gray-500">Loading PDF...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-2 text-red-500">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="text-gray-700">{error}</p>
            </div>
          </div>
        )}

        {/* PDF Document */}
        {!error && (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            className="flex flex-col items-center"
          >
            {!isLoading && !useVirtualScrolling && (
              <div className="flex justify-center">
                <PdfPage
                  pageNumber={currentPage}
                  scale={scale}
                  width={pageWidth}
                  onLoadSuccess={() => {}}
                />
              </div>
            )}

            {!isLoading && useVirtualScrolling && containerRef.current && (
              <VirtualPdfList
                numPages={numPages || totalPages}
                scale={scale}
                pageWidth={pageWidth || containerWidth}
                pageHeights={pageHeights}
                currentPage={currentPage}
                onPageInViewChange={setPage}
              />
            )}
          </Document>
        )}

        {/* Text Selection Popup */}
        {hasSelection && (
          <TextSelectionPopup
            selection={selection}
            containerRef={containerRef as React.RefObject<HTMLElement>}
            onExplain={handleExplain}
            onDismiss={clearSelection}
            disabled={isScanned}
          />
        )}
      </div>

      {/* Scanned PDF Warning */}
      {isScanned && (
        <div className="border-t border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>
              This PDF appears to be scanned. Text selection and AI features may be
              limited.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
