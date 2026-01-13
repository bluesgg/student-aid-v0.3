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
import { useRectangleDrawing } from '../hooks/use-rectangle-drawing'
import { PdfToolbar, ZoomMode } from './pdf-toolbar'
import { PdfPage } from './pdf-page'
import { TextSelectionPopup } from './text-selection-popup'
import { VirtualPdfList, type VirtualPdfListHandle } from './virtual-pdf-list'
import { PdfRegionOverlay, type Region } from './pdf-region-overlay'
import { type NormalizedRect, checkRegionOverlap } from '@/lib/stickers/selection-hash'
import { cropPageRegion } from '@/lib/pdf/crop-image'
import {
  explainSelectedImages,
  pollExplainStatus,
  type ExplainSelectedImagesPayload,
  MissingCropError,
} from '@/features/stickers/api/explain-page-multipart'
import {
  type ReaderMode,
  getInitialReaderMode,
  setStoredReaderMode,
  syncModeToURL,
} from '@/lib/reader/types'

interface PdfViewerProps {
  fileUrl: string
  courseId: string
  fileId: string
  initialPage: number
  totalPages: number
  isScanned: boolean
  pdfType?: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  locale?: 'en' | 'zh-Hans'
  onSelectionExplain?: (text: string, page: number, rect: DOMRect | null) => void
  onPageChange?: (page: number) => void
  /** Callback when stickers are generated from image selection */
  onImageSelectionStickers?: (stickers: unknown[]) => void
  /** Region IDs to highlight (from sticker hover) */
  highlightedRegionIds?: string[]
}

/** Maximum regions per selection session */
const MAX_REGIONS = 8

/** Debounce time for generation trigger (ms) */
const GENERATION_DEBOUNCE_MS = 200

export function PdfViewer({
  fileUrl,
  courseId,
  fileId,
  initialPage,
  totalPages,
  isScanned,
  pdfType = 'Lecture',
  locale = 'en',
  onSelectionExplain,
  onPageChange,
  onImageSelectionStickers,
  highlightedRegionIds = [],
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const virtualListRef = useRef<VirtualPdfListHandle>(null)
  const [scale, setScale] = useState(1)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width')
  const [containerWidth, setContainerWidth] = useState(600)
  const [containerHeight, setContainerHeight] = useState(600)
  const [pageHeights, setPageHeights] = useState<number[]>([])
  // Actual rendered page dimensions (updates on scale change)
  const [actualPageDimensions, setActualPageDimensions] = useState<{ width: number; height: number } | null>(null)

  // ==================== Reader Mode State ====================
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => getInitialReaderMode())

  // ==================== Selection Mode State ====================
  const [selectionMode, setSelectionMode] = useState(false)
  const [sessionRootPage, setSessionRootPage] = useState<number | null>(null)
  const [draftRegions, setDraftRegions] = useState<Region[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)

  // Canvas and crop storage (refs to persist across renders)
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const regionCropsRef = useRef<Map<string, Blob>>(new Map())
  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const latestRequestVersionRef = useRef(0)

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
    enabled: !isScanned && !selectionMode, // Disable text selection in selection mode
  })

  // ==================== Canvas Registration ====================
  const handleCanvasReady = useCallback((page: number, canvas: HTMLCanvasElement) => {
    canvasMapRef.current.set(page, canvas)
  }, [])

  const handleCanvasUnmount = useCallback((page: number) => {
    canvasMapRef.current.delete(page)
  }, [])

  // ==================== Selection Mode Handlers ====================
  const handleSelectionModeChange = useCallback((enabled: boolean) => {
    if (enabled) {
      // Enter selection mode - capture root page
      setSelectionMode(true)
      setSessionRootPage(currentPage)
      setDraftRegions([])
      regionCropsRef.current.clear()
    } else {
      // Exit selection mode - clear state
      setSelectionMode(false)
      setSessionRootPage(null)
      setDraftRegions([])
      regionCropsRef.current.clear()
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current)
        generationTimeoutRef.current = null
      }
    }
  }, [currentPage])

  // ==================== Generation Trigger ====================
  const triggerGeneration = useCallback(async () => {
    if (!sessionRootPage || draftRegions.length === 0) return

    const currentVersion = latestRequestVersionRef.current + 1
    latestRequestVersionRef.current = currentVersion
    setRequestVersion(currentVersion)
    setIsGenerating(true)

    try {
      // Build payload
      const payload: ExplainSelectedImagesPayload = {
        courseId,
        fileId,
        page: sessionRootPage,
        pdfType,
        locale,
        effectiveMode: 'with_selected_images',
        selectedImageRegions: draftRegions.map(r => ({ page: r.page, rect: r.rect })),
      }

      // Send request
      const response = await explainSelectedImages(payload, regionCropsRef.current)

      // Check if this response is still relevant
      if (currentVersion !== latestRequestVersionRef.current) {
        // Stale response - ignore
        return
      }

      if (!response.ok) {
        console.error('Generation error:', response.error)
        return
      }

      if (response.status === 'generating' && response.generationId) {
        // Poll for completion
        const pollForCompletion = async (generationId: string) => {
          try {
            const status = await pollExplainStatus(generationId)

            if (currentVersion !== latestRequestVersionRef.current) return

            if (status.status === 'ready' && status.stickers) {
              // Update regions to persisted status
              setDraftRegions(prev => prev.map(r => ({ ...r, status: 'persisted' as const })))
              onImageSelectionStickers?.(status.stickers)
              setIsGenerating(false)
            } else if (status.status === 'generating') {
              // Continue polling
              setTimeout(() => pollForCompletion(generationId), 2000)
            } else {
              // Failed
              setIsGenerating(false)
            }
          } catch (error) {
            console.error('Poll error:', error)
            setIsGenerating(false)
          }
        }

        pollForCompletion(response.generationId)
      } else if (response.stickers) {
        // Immediate response
        setDraftRegions(prev => prev.map(r => ({ ...r, status: 'persisted' as const })))
        onImageSelectionStickers?.(response.stickers)
        setIsGenerating(false)
      }
    } catch (error) {
      if (error instanceof MissingCropError) {
        console.error('Missing crop:', error)
        // Show user feedback
      }
      setIsGenerating(false)
    }
  }, [sessionRootPage, draftRegions, courseId, fileId, pdfType, locale, onImageSelectionStickers])

  // Debounced generation trigger
  const debouncedTriggerGeneration = useCallback(() => {
    if (generationTimeoutRef.current) {
      clearTimeout(generationTimeoutRef.current)
    }
    generationTimeoutRef.current = setTimeout(() => {
      triggerGeneration()
    }, GENERATION_DEBOUNCE_MS)
  }, [triggerGeneration])

  // ==================== Region Handlers ====================
  const handleRegionComplete = useCallback(async (page: number, rect: NormalizedRect, id: string) => {
    // Check region limit
    if (draftRegions.length >= MAX_REGIONS) {
      console.warn('Maximum regions reached')
      return
    }

    // Check for overlap with existing regions
    if (checkRegionOverlap(rect, page, draftRegions)) {
      console.warn('Region overlaps with existing selection')
      return
    }

    // Get canvas for this page
    const canvas = canvasMapRef.current.get(page)
    if (!canvas) {
      console.error('Canvas not available for page', page)
      return
    }

    try {
      // Extract JPEG crop immediately
      const cropBlob = await cropPageRegion(canvas, rect)
      regionCropsRef.current.set(id, cropBlob)

      // Add region to state
      setDraftRegions(prev => [...prev, { id, page, rect, status: 'draft' }])

      // Trigger generation
      debouncedTriggerGeneration()
    } catch (error) {
      console.error('Failed to crop region:', error)
    }
  }, [draftRegions, debouncedTriggerGeneration])

  const handleDeleteRegion = useCallback((id: string) => {
    // Remove from state
    setDraftRegions(prev => prev.filter(r => r.id !== id))

    // Remove cached crop
    regionCropsRef.current.delete(id)

    // Trigger generation with remaining regions (if any)
    if (draftRegions.length > 1) {
      debouncedTriggerGeneration()
    }
  }, [draftRegions.length, debouncedTriggerGeneration])

  // Rectangle drawing hook
  const {
    drawing,
    currentRect,
    pageDimensionsRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useRectangleDrawing({
    enabled: selectionMode,
    onRectComplete: handleRegionComplete,
  })

  // ==================== Reader Mode Handler ====================
  const handleReaderModeChange = useCallback((mode: ReaderMode) => {
    setReaderMode(mode)
    setStoredReaderMode(mode)
    syncModeToURL(mode)
  }, [])

  // Calculate container dimensions for fit modes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 48) // Subtract padding
        setContainerHeight(containerRef.current.clientHeight)
      }
    }

    updateDimensions()

    // Use ResizeObserver to detect container size changes (e.g., when panels are resized)
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Fallback to window resize for browser zoom changes
    window.addEventListener('resize', updateDimensions)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
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

  // Update actual page dimensions when scale changes or page loads
  useEffect(() => {
    const updateDimensions = () => {
      const pageElement = containerRef.current?.querySelector(`[data-page-number="${currentPage}"]`)
      if (pageElement) {
        const rect = pageElement.getBoundingClientRect()
        setActualPageDimensions({ width: rect.width, height: rect.height })
        pageDimensionsRef.current.set(currentPage, { width: rect.width, height: rect.height })
      }
    }

    // Use requestAnimationFrame to ensure DOM has updated
    const frameId = requestAnimationFrame(updateDimensions)
    return () => cancelAnimationFrame(frameId)
  }, [scale, currentPage, pageDimensionsRef])

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

  // Store page heights for virtual scrolling (called when pages render)
  const handlePageRender = useCallback(
    (pageNumber: number, height: number) => {
      setPageHeights((prev) => {
        // Only update if height is different to avoid unnecessary re-renders
        if (prev[pageNumber - 1] === height) return prev
        const newHeights = [...prev]
        newHeights[pageNumber - 1] = height
        return newHeights
      })
    },
    []
  )

  // Wrap navigation functions for mode-aware behavior
  const handleGoToPage = useCallback((page: number) => {
    if (readerMode === 'scroll' && virtualListRef.current) {
      virtualListRef.current.scrollToPage(page, 'smooth')
    } else {
      goToPage(page)
    }
  }, [readerMode, goToPage])

  const handleNextPage = useCallback(() => {
    if (readerMode === 'scroll' && virtualListRef.current) {
      const nextPage = Math.min(currentPage + 1, numPages || totalPages)
      virtualListRef.current.scrollToPage(nextPage, 'smooth')
    } else {
      goToNextPage()
    }
  }, [readerMode, currentPage, numPages, totalPages, goToNextPage])

  const handlePreviousPage = useCallback(() => {
    if (readerMode === 'scroll' && virtualListRef.current) {
      const prevPage = Math.max(currentPage - 1, 1)
      virtualListRef.current.scrollToPage(prevPage, 'smooth')
    } else {
      goToPreviousPage()
    }
  }, [readerMode, currentPage, goToPreviousPage])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <PdfToolbar
        currentPage={currentPage}
        totalPages={numPages || totalPages}
        scale={scale}
        zoomMode={zoomMode}
        onPageChange={handleGoToPage}
        onScaleChange={setScale}
        onZoomModeChange={setZoomMode}
        onPreviousPage={handlePreviousPage}
        onNextPage={handleNextPage}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        isSaving={isSaving}
        selectionMode={selectionMode}
        onSelectionModeChange={handleSelectionModeChange}
        selectionModeAvailable={!isScanned}
        isGenerating={isGenerating}
        readerMode={readerMode}
        onReaderModeChange={handleReaderModeChange}
      />

      {/* ARIA Live Region for current page announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        Page {currentPage} of {numPages || totalPages}
      </div>

      {/* PDF Content */}
      <div
        ref={containerRef}
        className={`relative flex-1 bg-gray-100 p-6 ${readerMode === 'scroll' ? 'overflow-hidden' : 'overflow-auto'}`}
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
            className={readerMode === 'scroll' ? 'h-full w-full' : 'flex flex-col items-center'}
          >
            {/* Page Mode: Single page view */}
            {!isLoading && readerMode === 'page' && (
              <div
                className={`relative flex justify-center ${selectionMode ? 'cursor-crosshair' : ''}`}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div
                  className="relative"
                  onPointerDown={(e) => handlePointerDown(e, currentPage)}
                >
                  <PdfPage
                    pageNumber={currentPage}
                    scale={scale}
                    width={pageWidth}
                    onLoadSuccess={() => {
                      // Store page dimensions for rectangle drawing
                      const pageElement = containerRef.current?.querySelector(`[data-page-number="${currentPage}"]`)
                      if (pageElement) {
                        const rect = pageElement.getBoundingClientRect()
                        pageDimensionsRef.current.set(currentPage, { width: rect.width, height: rect.height })
                      }
                    }}
                    onCanvasReady={handleCanvasReady}
                    onCanvasUnmount={handleCanvasUnmount}
                  />
                  {/* Region Overlay */}
                  {(selectionMode || draftRegions.length > 0 || highlightedRegionIds.length > 0) && actualPageDimensions && (
                    <PdfRegionOverlay
                      regions={draftRegions}
                      currentPage={currentPage}
                      pageWidth={actualPageDimensions.width}
                      pageHeight={actualPageDimensions.height}
                      highlightedRegionIds={highlightedRegionIds}
                      onDeleteRegion={handleDeleteRegion}
                      isSelectionMode={selectionMode}
                      drawingRect={drawing.page === currentPage ? currentRect : null}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Scroll Mode: Continuous scroll with virtual list */}
            {!isLoading && readerMode === 'scroll' && (
              <div className="h-full w-full">
                <VirtualPdfList
                  ref={virtualListRef}
                  numPages={numPages || totalPages}
                  scale={scale}
                  pageWidth={pageWidth || containerWidth}
                  pageHeights={pageHeights}
                  currentPage={currentPage}
                  onPageInViewChange={setPage}
                  onPageRender={handlePageRender}
                  containerHeight={Math.max(400, containerHeight - 48)}
                  onCanvasReady={handleCanvasReady}
                  onCanvasUnmount={handleCanvasUnmount}
                  selectionMode={selectionMode}
                  regions={draftRegions}
                  highlightedRegionIds={highlightedRegionIds}
                  onDeleteRegion={handleDeleteRegion}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  drawingRect={currentRect}
                  drawingPage={drawing.page}
                  pageDimensionsRef={pageDimensionsRef}
                />
              </div>
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
