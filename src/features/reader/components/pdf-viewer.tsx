'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Document } from 'react-pdf'
import { useQueryClient } from '@tanstack/react-query'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

// Import worker configuration
import '@/lib/pdf/worker'
import { debugLog } from '@/lib/debug'

import { usePdfDocument } from '../hooks/use-pdf-document'
import { usePageNavigation } from '../hooks/use-page-navigation'
import { useLastReadPage } from '../hooks/use-last-read-page'
import { useTextSelection } from '../hooks/use-text-selection'
import { useRectangleDrawing } from '../hooks/use-rectangle-drawing'
import { useImageDetection } from '../hooks/use-image-detection'
import { usePdfStickerHitTest } from '../hooks/use-pdf-sticker-hit-test'
import { PdfToolbar, ZoomMode } from './pdf-toolbar'
import { PdfPage } from './pdf-page'
import { TextSelectionPopup } from './text-selection-popup'
import { VirtualPdfList, type VirtualPdfListHandle } from './virtual-pdf-list'
import { PdfRegionOverlay, type Region } from './pdf-region-overlay'
import { ImageDetectionOverlay, ExtractionStatusIndicator, LazyExtractionLoading, NoImageDetectedPopup } from './image-detection-overlay'
import { StickerAnchorHighlight } from './sticker-anchor-highlight'
import { PdfLoadingProgress } from './pdf-loading-progress'
import { useHoverHighlight } from '@/features/stickers/context'
import { useStickers } from '@/features/stickers/hooks/use-stickers'
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
import type { AutoExplainSession } from '../hooks/use-auto-explain-session'

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
  /** Auto-explain session state (from parent) */
  autoExplainSession?: AutoExplainSession | null
  /** Whether auto-explain session is active */
  isAutoExplainActive?: boolean
  /** Callback to update the auto-explain window position */
  updateAutoExplainWindow?: (page: number) => void
  /** Callback to cancel the auto-explain session */
  cancelAutoExplainSession?: () => void
  /** Callback when selected regions change */
  onSelectedRegionsChange?: (hasRegions: boolean, count: number) => void
  /** Trigger to start image explanation */
  triggerImageExplanation?: boolean
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
  autoExplainSession: _autoExplainSession,
  isAutoExplainActive: _isAutoExplainActive,
  updateAutoExplainWindow: _updateAutoExplainWindow,
  cancelAutoExplainSession: _cancelAutoExplainSession,
  onSelectedRegionsChange,
  triggerImageExplanation,
}: PdfViewerProps) {
  const queryClient = useQueryClient()
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

  // ==================== Auto Image Detection State ====================
  const [showHighlightFeedback, setShowHighlightFeedback] = useState(false)
  const highlightFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ==================== First Page Render State ====================
  // Defer image detection API call until first page is rendered
  const [isFirstPageRendered, setIsFirstPageRendered] = useState(false)

  // ==================== No Image Detected Popup State ====================
  const [noImagePopupOpen, setNoImagePopupOpen] = useState(false)
  const [noImagePopupPosition, setNoImagePopupPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isInMarkMode, setIsInMarkMode] = useState(false) // Click-to-mark mode (distinct from rectangle drawing)

  // Canvas and crop storage (refs to persist across renders)
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const regionCropsRef = useRef<Map<string, Blob>>(new Map())
  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const latestRequestVersionRef = useRef(0)

  // ==================== DEBUG: Component Lifecycle ====================
  useEffect(() => {
    debugLog('[PdfViewer DEBUG] Component MOUNTED', {
      fileId,
      courseId,
      initialPage,
    })
    return () => {
      debugLog('[PdfViewer DEBUG] Component UNMOUNTING', {
        fileId,
        draftRegionsCount: draftRegions.length,
        draftRegions: draftRegions.map(r => ({ id: r.id, page: r.page, status: r.status })),
        regionCropsCount: regionCropsRef.current.size,
        regionCropIds: Array.from(regionCropsRef.current.keys()),
        selectionMode,
        sessionRootPage,
      })
    }
  }, []) // Empty deps = mount/unmount only

  // DEBUG: Track draftRegions changes
  useEffect(() => {
    debugLog('[PdfViewer DEBUG] draftRegions changed', {
      count: draftRegions.length,
      regions: draftRegions.map(r => ({ id: r.id, page: r.page, status: r.status })),
    })
  }, [draftRegions])

  // DEBUG: Track selectionMode changes
  useEffect(() => {
    debugLog('[PdfViewer DEBUG] selectionMode changed', {
      selectionMode,
      sessionRootPage,
    })
  }, [selectionMode, sessionRootPage])

  // PDF document state
  const { numPages, isLoading, isFirstPageReady, error, loadingProgress, onDocumentLoadSuccess, onDocumentLoadError, onLoadProgress, markFirstPageReady } =
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

  // Auto image detection (click-to-explain)
  // Deferred until first page is rendered to avoid blocking PDF download
  const {
    images: detectedImages,
    extractionStatus,
    isLoading: isLoadingImages,
    isEnabled: isAutoImageDetectionEnabled,
    pageExtracted,
  } = useImageDetection({
    courseId,
    fileId,
    page: currentPage,
    enabled: !isScanned && isFirstPageRendered, // Defer until first page is rendered
  })

  // Bidirectional hover highlighting (sticker <-> PDF region)
  const {
    hoveredStickerRect,
    hoveredStickerPage,
  } = useHoverHighlight()

  // Fetch stickers for hit testing (PDF → Sticker direction)
  const { data: stickersData } = useStickers(fileId)
  const pageStickers = useMemo(() => {
    if (!stickersData?.items) return []
    return stickersData.items.filter((s) => s.page === currentPage)
  }, [stickersData, currentPage])

  // PDF sticker hit test for reverse highlighting (hover PDF region → highlight sticker)
  const {
    handleMouseMove: handleStickerHitTest,
    handleMouseLeave: handleStickerHitTestLeave,
  } = usePdfStickerHitTest({
    pageStickers,
    currentPage,
    enabled: !selectionMode && !isInMarkMode, // Disable during selection modes
  })

  // ==================== Canvas Registration ====================
  const handleCanvasReady = useCallback((page: number, canvas: HTMLCanvasElement) => {
    canvasMapRef.current.set(page, canvas)
    // Mark first page as rendered to enable deferred operations
    if (!isFirstPageRendered) {
      setIsFirstPageRendered(true)
      // Mark first page ready for progressive loading progress indicator
      markFirstPageReady()
      debugLog('[PdfViewer] First page rendered, enabling image detection')
    }
  }, [isFirstPageRendered, markFirstPageReady])

  const handleCanvasUnmount = useCallback((page: number) => {
    canvasMapRef.current.delete(page)
  }, [])

  // ==================== Selection Mode Handlers ====================
  const handleSelectionModeChange = useCallback((enabled: boolean) => {
    debugLog('[PdfViewer DEBUG] handleSelectionModeChange called', {
      enabled,
      currentPage,
      isAutoImageDetectionEnabled,
      currentDraftRegionsCount: draftRegions.length,
      currentRegionCropsCount: regionCropsRef.current.size,
    })
    if (enabled) {
      // When auto image detection is enabled, enter mark mode (click-to-mark)
      // Otherwise enter traditional rectangle drawing mode
      if (isAutoImageDetectionEnabled) {
        debugLog('[PdfViewer DEBUG] Entering mark mode (click-to-mark)')
        setIsInMarkMode(true)
        setSelectionMode(false) // Not rectangle drawing mode
      } else {
        // Enter selection mode - capture root page
        debugLog('[PdfViewer DEBUG] Entering rectangle selection mode')
        setSelectionMode(true)
        setIsInMarkMode(false)
        if (!sessionRootPage) {
          setSessionRootPage(currentPage)
        }
      }
      // Close any open popup
      setNoImagePopupOpen(false)
    } else {
      // Exit selection/mark mode - PRESERVE regions and crops
      debugLog('[PdfViewer DEBUG] Exiting mode - PRESERVING regions', {
        regionsPreserved: draftRegions.map(r => r.id),
        cropsPreserved: Array.from(regionCropsRef.current.keys()),
      })
      setSelectionMode(false)
      setIsInMarkMode(false)
      setNoImagePopupOpen(false)
      // Keep sessionRootPage and draftRegions intact
      // Clear pending generation timeout (user exited mode)
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current)
        generationTimeoutRef.current = null
      }
    }
  }, [currentPage, draftRegions, sessionRootPage, isAutoImageDetectionEnabled])

  // ==================== Save Manual Regions to Detection List ====================
  const saveManualRegionsToDetectionList = useCallback(async (regions: Region[]) => {
    // Save each manually drawn region as a "missed_image" feedback
    // This will add them to the detected_images table for future use
    for (const region of regions) {
      try {
        const response = await fetch(`/api/courses/${courseId}/files/${fileId}/images/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedbackType: 'missed_image',
            correctRect: region.rect,
            page: region.page,
          }),
        })

        if (!response.ok) {
          console.warn('[PdfViewer] Failed to save manual region:', region.id)
        } else {
          debugLog('[PdfViewer] Manual region saved to detection list:', region.id)
        }
      } catch (error) {
        console.error('[PdfViewer] Error saving manual region:', error)
      }
    }

    // Invalidate the detected images cache to refresh the list
    // This will make the newly saved regions appear in the ImageDetectionOverlay
    await queryClient.invalidateQueries({
      queryKey: ['detected-images', courseId, fileId],
    })
  }, [courseId, fileId, queryClient])

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
              // Save manually drawn regions to detection list for future use
              saveManualRegionsToDetectionList(draftRegions)
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
        // Save manually drawn regions to detection list for future use
        saveManualRegionsToDetectionList(draftRegions)
      }
    } catch (error) {
      if (error instanceof MissingCropError) {
        console.error('Missing crop:', error)
        // Show user feedback
      }
      setIsGenerating(false)
    }
  }, [sessionRootPage, draftRegions, courseId, fileId, pdfType, locale, onImageSelectionStickers, saveManualRegionsToDetectionList])

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
    debugLog('[PdfViewer DEBUG] handleRegionComplete called', {
      page,
      regionId: id,
      rect,
      currentDraftRegionsCount: draftRegions.length,
    })

    // Check region limit
    if (draftRegions.length >= MAX_REGIONS) {
      console.warn('[PdfViewer DEBUG] Maximum regions reached - rejecting')
      return
    }

    // Check for overlap with existing regions
    if (checkRegionOverlap(rect, page, draftRegions)) {
      console.warn('[PdfViewer DEBUG] Region overlaps with existing selection - rejecting')
      return
    }

    // Get canvas for this page
    const canvas = canvasMapRef.current.get(page)
    if (!canvas) {
      console.error('[PdfViewer DEBUG] Canvas not available for page', page, 'available pages:', Array.from(canvasMapRef.current.keys()))
      return
    }

    try {
      // Extract JPEG crop immediately
      const cropBlob = await cropPageRegion(canvas, rect)
      regionCropsRef.current.set(id, cropBlob)
      debugLog('[PdfViewer DEBUG] Crop extracted and stored', {
        regionId: id,
        blobSize: cropBlob.size,
        totalCropsStored: regionCropsRef.current.size,
      })

      // Add region to state
      setDraftRegions(prev => {
        const newRegions = [...prev, { id, page, rect, status: 'draft' as const }]
        debugLog('[PdfViewer DEBUG] Adding region to state', {
          newRegionId: id,
          newTotalCount: newRegions.length,
        })
        return newRegions
      })

      // Trigger generation
      debouncedTriggerGeneration()
    } catch (error) {
      console.error('[PdfViewer DEBUG] Failed to crop region:', error)
    }
  }, [draftRegions, debouncedTriggerGeneration])

  const handleDeleteRegion = useCallback((id: string) => {
    debugLog('[PdfViewer DEBUG] handleDeleteRegion called', {
      deletingId: id,
      currentCount: draftRegions.length,
      currentIds: draftRegions.map(r => r.id),
    })

    // Remove from state
    setDraftRegions(prev => prev.filter(r => r.id !== id))

    // Remove cached crop
    regionCropsRef.current.delete(id)

    // Trigger generation with remaining regions (if any)
    if (draftRegions.length > 1) {
      debouncedTriggerGeneration()
    }
  }, [draftRegions.length, debouncedTriggerGeneration])

  // ==================== Auto Image Detection Handlers ====================

  // Handle click on page area (for highlight feedback and mark mode)
  const handlePageAreaClick = useCallback((e: React.MouseEvent) => {
    // Skip if in rectangle drawing mode
    if (selectionMode) {
      return
    }

    // Skip if auto image detection is not enabled
    if (!isAutoImageDetectionEnabled) {
      return
    }

    // Skip if images are still loading (lazy extraction in progress)
    if (isLoadingImages) {
      debugLog('[PdfViewer] Click ignored - images still loading')
      return
    }

    // Get click position relative to container (for popup positioning)
    const containerRect = containerRef.current?.getBoundingClientRect()
    const containerX = containerRect ? e.clientX - containerRect.left : 0
    const containerY = containerRect ? e.clientY - containerRect.top : 0

    // In mark mode: show the popup with "Draw manually" option
    if (isInMarkMode) {
      debugLog('[PdfViewer] Mark mode click - showing popup', { containerX, containerY })
      setNoImagePopupPosition({ x: containerX, y: containerY })
      setNoImagePopupOpen(true)
      setShowHighlightFeedback(false)
      if (highlightFeedbackTimeoutRef.current) {
        clearTimeout(highlightFeedbackTimeoutRef.current)
        highlightFeedbackTimeoutRef.current = null
      }
    } else if (detectedImages.length > 0) {
      // Not in mark mode but we have detected images: show brief highlight feedback
      debugLog('[PdfViewer] Click - showing highlight feedback')
      setShowHighlightFeedback(true)

      // Clear after 2 seconds
      if (highlightFeedbackTimeoutRef.current) {
        clearTimeout(highlightFeedbackTimeoutRef.current)
      }
      highlightFeedbackTimeoutRef.current = setTimeout(() => {
        setShowHighlightFeedback(false)
        highlightFeedbackTimeoutRef.current = null
      }, 2000)
    }
  }, [isAutoImageDetectionEnabled, detectedImages, selectionMode, isInMarkMode, isLoadingImages])

  // Handle "Draw manually" button from the no-image-detected popup
  const handleDrawManually = useCallback(() => {
    debugLog('[PdfViewer] Draw manually clicked - entering rectangle selection mode')
    setNoImagePopupOpen(false)
    setIsInMarkMode(false)
    setSelectionMode(true)
    if (!sessionRootPage) {
      setSessionRootPage(currentPage)
    }
  }, [currentPage, sessionRootPage])

  // Handle dismiss of no-image-detected popup
  const handleNoImagePopupDismiss = useCallback(() => {
    setNoImagePopupOpen(false)
  }, [])

  // Notify parent when draft regions change
  useEffect(() => {
    onSelectedRegionsChange?.(draftRegions.length > 0, draftRegions.length)
  }, [draftRegions.length, onSelectedRegionsChange])

  // Handle trigger from parent to explain selected images
  useEffect(() => {
    if (triggerImageExplanation && draftRegions.length > 0 && !isGenerating) {
      triggerGeneration()
    }
  }, [triggerImageExplanation, draftRegions.length, isGenerating, triggerGeneration])

  // Cleanup highlight feedback timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightFeedbackTimeoutRef.current) {
        clearTimeout(highlightFeedbackTimeoutRef.current)
      }
    }
  }, [])

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
        selectionMode={selectionMode || isInMarkMode}
        onSelectionModeChange={handleSelectionModeChange}
        selectionModeAvailable={!isScanned}
        isGenerating={isGenerating}
        readerMode={readerMode}
        onReaderModeChange={handleReaderModeChange}
        isAutoImageDetectionEnabled={isAutoImageDetectionEnabled}
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
            <PdfLoadingProgress
              progress={loadingProgress}
              firstPageReady={isFirstPageReady}
            />
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
            onLoadProgress={onLoadProgress}
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
                  onClick={handlePageAreaClick}
                  onMouseMove={(e) => {
                    // Hit test for sticker anchor regions (PDF → Sticker highlighting)
                    const pageElement = e.currentTarget
                    handleStickerHitTest(e, pageElement)
                  }}
                  onMouseLeave={handleStickerHitTestLeave}
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
                  {/* Region Overlay (manual selection mode) */}
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
                  {/* Auto Image Detection Overlay (hover highlight) */}
                  {isAutoImageDetectionEnabled && !selectionMode && actualPageDimensions && detectedImages.length > 0 && (
                    <ImageDetectionOverlay
                      images={detectedImages}
                      pageWidth={actualPageDimensions.width}
                      pageHeight={actualPageDimensions.height}
                      showHighlightFeedback={showHighlightFeedback}
                    />
                  )}
                  {/* Lazy Extraction Loading Indicator - show when images are being loaded/extracted */}
                  {isAutoImageDetectionEnabled && !selectionMode && actualPageDimensions && isLoadingImages && (
                    <LazyExtractionLoading
                      pageWidth={actualPageDimensions.width}
                      pageHeight={actualPageDimensions.height}
                    />
                  )}
                  {/* Sticker Anchor Highlight - show when a sticker is hovered */}
                  {hoveredStickerRect && hoveredStickerPage === currentPage && actualPageDimensions && (
                    <StickerAnchorHighlight
                      rect={hoveredStickerRect}
                      pageWidth={actualPageDimensions.width}
                      pageHeight={actualPageDimensions.height}
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

        {/* No Image Detected Popup (for mark mode) */}
        <NoImageDetectedPopup
          isOpen={noImagePopupOpen}
          position={noImagePopupPosition}
          containerBounds={{
            width: containerWidth + 48, // Add padding back
            height: containerHeight,
          }}
          onDrawManually={handleDrawManually}
          onDismiss={handleNoImagePopupDismiss}
          message={locale === 'zh-Hans' ? '此位置未检测到图片' : 'No image detected at this position'}
          buttonText={locale === 'zh-Hans' ? '手动框选' : 'Draw manually'}
        />
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
