'use client'

import {
  useCallback,
  useRef,
  useEffect,
  memo,
  forwardRef,
  useImperativeHandle,
  useState,
  CSSProperties,
} from 'react'
import { VariableSizeList } from 'react-window'
import {
  PAGE_GAP_PX,
  PAGE_PADDING_PX,
  CURRENT_PAGE_DEBOUNCE_MS,
  OVERSCAN_COUNT,
  DEFAULT_PAGE_ASPECT_RATIO,
  isIntersectionObserverSupported,
  calculateCurrentPageFromScroll,
} from '@/lib/reader/types'
import { PdfPage } from './pdf-page'
import { PdfRegionOverlay, type Region } from './pdf-region-overlay'
import { ImageDetectionOverlay, LazyExtractionLoading } from './image-detection-overlay'
import { StickerAnchorHighlight } from './sticker-anchor-highlight'
import type { NormalizedRect } from '@/lib/stickers/selection-hash'
import type { DetectedImageRect } from '../hooks/use-image-detection'

// Threshold for using virtual scrolling - kept for backward compatibility export
export const VIRTUAL_SCROLL_THRESHOLD = 50

export interface VirtualPdfListProps {
  numPages: number
  scale: number
  pageWidth: number
  pageHeights: number[]
  currentPage: number
  onPageInViewChange: (page: number) => void
  /** Callback when a page renders with its actual height */
  onPageRender?: (page: number, height: number) => void
  /** Container height (optional, will use window.innerHeight - offset if not provided) */
  containerHeight?: number
  /** Callback when canvas is ready for a page */
  onCanvasReady?: (page: number, canvas: HTMLCanvasElement) => void
  /** Callback when canvas unmounts for a page */
  onCanvasUnmount?: (page: number) => void
  /** Whether selection mode is active */
  selectionMode?: boolean
  /** Regions to display */
  regions?: Region[]
  /** Highlighted region IDs */
  highlightedRegionIds?: string[]
  /** Handler for deleting a region */
  onDeleteRegion?: (id: string) => void
  /** Handler for pointer down in selection mode */
  onPointerDown?: (e: React.PointerEvent, page: number) => void
  /** Handler for pointer move in selection mode */
  onPointerMove?: (e: React.PointerEvent) => void
  /** Handler for pointer up in selection mode */
  onPointerUp?: (e: React.PointerEvent) => void
  /** Current drawing rect (for selection mode preview) */
  drawingRect?: NormalizedRect | null
  /** Page being drawn on */
  drawingPage?: number | null
  /** Ref to store page dimensions */
  pageDimensionsRef?: React.MutableRefObject<Map<number, { width: number; height: number }>>
  // ==================== Auto Image Detection Props (Task 1.1) ====================
  /** Whether auto image detection is enabled */
  isAutoImageDetectionEnabled?: boolean
  /** Detected images by page number */
  detectedImagesByPage?: Map<number, DetectedImageRect[]>
  /** Show highlight feedback (flash all images) */
  showHighlightFeedback?: boolean
  /** Pages currently loading images */
  loadingPages?: Set<number>
  // ==================== Sticker Anchor Highlighting Props (Task 1.2) ====================
  /** Hovered sticker rect for anchor highlighting */
  hoveredStickerRect?: { x: number; y: number; width: number; height: number } | null
  /** Page number of the hovered sticker anchor */
  hoveredStickerPage?: number | null
  // ==================== Page Area Click Props (Task 1.3) ====================
  /** Handler for page area click (for mark mode and highlight feedback) */
  onPageAreaClick?: (page: number, e: React.MouseEvent) => void
  // ==================== Sticker Hit Test Props (Task 1.4) ====================
  /** Handler for mouse move to detect sticker anchor hover (PDF→Sticker direction) */
  onStickerHitTestMove?: (e: React.MouseEvent<HTMLElement>, pageElement: HTMLElement, page: number) => void
  /** Handler for mouse leave to clear sticker anchor hover */
  onStickerHitTestLeave?: () => void
}

/** Handle exposed via ref */
export interface VirtualPdfListHandle {
  scrollToPage: (pageNumber: number, behavior?: ScrollBehavior) => void
  getCurrentPage: () => number
}

interface PageRowData {
  scale: number
  pageWidth: number
  onCanvasReady?: (page: number, canvas: HTMLCanvasElement) => void
  onCanvasUnmount?: (page: number) => void
  onPageRender?: (page: number, height: number) => void
  selectionMode: boolean
  regions: Region[]
  highlightedRegionIds: string[]
  onDeleteRegion?: (id: string) => void
  onPointerDown?: (e: React.PointerEvent, page: number) => void
  drawingRect: NormalizedRect | null
  drawingPage: number | null
  visiblePages: Set<number>
  pageDimensionsRef?: React.MutableRefObject<Map<number, { width: number; height: number }>>
  pageObserverRef: React.MutableRefObject<IntersectionObserver | null>
  pageRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
  // Auto Image Detection
  isAutoImageDetectionEnabled: boolean
  detectedImagesByPage: Map<number, DetectedImageRect[]>
  showHighlightFeedback: boolean
  loadingPages: Set<number>
  // Sticker Anchor Highlighting
  hoveredStickerRect: { x: number; y: number; width: number; height: number } | null
  hoveredStickerPage: number | null
  // Page Area Click
  onPageAreaClick?: (page: number, e: React.MouseEvent) => void
  // Sticker Hit Test
  onStickerHitTestMove?: (e: React.MouseEvent<HTMLElement>, pageElement: HTMLElement, page: number) => void
  onStickerHitTestLeave?: () => void
}

interface PageRowProps {
  index: number
  style: CSSProperties
  data: PageRowData
}

// Memoized page row component with region overlay support
const PageRow = memo(function PageRow({ index, style, data }: PageRowProps) {
  const pageNumber = index + 1
  const {
    scale,
    pageWidth,
    onCanvasReady,
    onCanvasUnmount,
    onPageRender,
    selectionMode,
    regions,
    highlightedRegionIds,
    onDeleteRegion,
    onPointerDown,
    drawingRect,
    drawingPage,
    visiblePages,
    pageDimensionsRef,
    pageObserverRef,
    pageRefs,
    // New props for scroll mode feature parity
    isAutoImageDetectionEnabled,
    detectedImagesByPage,
    showHighlightFeedback,
    loadingPages,
    hoveredStickerRect,
    hoveredStickerPage,
    onPageAreaClick,
    onStickerHitTestMove,
    onStickerHitTestLeave,
  } = data

  const pageRef = useRef<HTMLDivElement>(null)
  const pageContentRef = useRef<HTMLDivElement>(null)
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null)

  // Register page element with IntersectionObserver
  useEffect(() => {
    const element = pageRef.current
    const observer = pageObserverRef.current
    const refs = pageRefs.current

    if (element) {
      refs.set(pageNumber, element)
      if (observer) {
        observer.observe(element)
      }
    }

    return () => {
      refs.delete(pageNumber)
      if (element && observer) {
        observer.unobserve(element)
      }
    }
  }, [pageNumber, pageObserverRef, pageRefs])

  // Update page dimensions after render
  useEffect(() => {
    const updateDimensions = () => {
      const element = pageRef.current?.querySelector(`[data-page-number="${pageNumber}"]`)
      if (element) {
        const rect = element.getBoundingClientRect()
        const dims = { width: rect.width, height: rect.height }
        setPageDimensions(dims)
        pageDimensionsRef?.current.set(pageNumber, dims)
      }
    }

    const frameId = requestAnimationFrame(updateDimensions)
    return () => cancelAnimationFrame(frameId)
  }, [pageNumber, scale, pageDimensionsRef])

  // Filter regions for this page
  const pageRegions = regions.filter(r => r.page === pageNumber)
  const showRegionOverlay = visiblePages.has(pageNumber) && (
    selectionMode ||
    pageRegions.length > 0 ||
    highlightedRegionIds.some(id => pageRegions.some(r => r.id === id))
  )

  // Get detected images for this page (Task 2.1)
  const pageDetectedImages = detectedImagesByPage.get(pageNumber) || []
  const isPageVisible = visiblePages.has(pageNumber)
  const showImageOverlay = isAutoImageDetectionEnabled && !selectionMode && isPageVisible && pageDetectedImages.length > 0

  // Check if this page is loading images (Task 2.2)
  const isLoadingImagesForPage = loadingPages.has(pageNumber)
  const showLoadingIndicator = isAutoImageDetectionEnabled && !selectionMode && isPageVisible && isLoadingImagesForPage

  // Check if sticker anchor should be highlighted on this page (Task 2.3)
  const showStickerAnchor = hoveredStickerRect && hoveredStickerPage === pageNumber && isPageVisible

  return (
    <div
      ref={pageRef}
      style={style}
      className={`flex justify-center ${selectionMode ? 'cursor-crosshair' : ''}`}
      data-page-container={pageNumber}
    >
      <div
        ref={pageContentRef}
        className="relative shadow-lg"
        onPointerDown={selectionMode && onPointerDown ? (e) => onPointerDown(e, pageNumber) : undefined}
        onClick={onPageAreaClick ? (e) => onPageAreaClick(pageNumber, e) : undefined}
        onMouseMove={onStickerHitTestMove && pageContentRef.current ? (e) => onStickerHitTestMove(e, pageContentRef.current!, pageNumber) : undefined}
        onMouseLeave={onStickerHitTestLeave}
      >
        <PdfPage
          pageNumber={pageNumber}
          scale={scale}
          width={pageWidth}
          onCanvasReady={onCanvasReady}
          onCanvasUnmount={onCanvasUnmount}
          onPageRender={onPageRender}
        />
        {/* Region Overlay - only render for visible pages with regions or in selection mode */}
        {showRegionOverlay && pageDimensions && onDeleteRegion && (
          <PdfRegionOverlay
            regions={pageRegions}
            currentPage={pageNumber}
            pageWidth={pageDimensions.width}
            pageHeight={pageDimensions.height}
            highlightedRegionIds={highlightedRegionIds}
            onDeleteRegion={onDeleteRegion}
            isSelectionMode={selectionMode}
            drawingRect={drawingPage === pageNumber ? drawingRect : null}
          />
        )}
        {/* Auto Image Detection Overlay - Task 2.1 */}
        {showImageOverlay && pageDimensions && (
          <ImageDetectionOverlay
            images={pageDetectedImages}
            pageWidth={pageDimensions.width}
            pageHeight={pageDimensions.height}
            showHighlightFeedback={showHighlightFeedback}
          />
        )}
        {/* Lazy Extraction Loading Indicator - Task 2.2 */}
        {showLoadingIndicator && pageDimensions && (
          <LazyExtractionLoading
            pageWidth={pageDimensions.width}
            pageHeight={pageDimensions.height}
          />
        )}
        {/* Sticker Anchor Highlight - Task 2.3 */}
        {showStickerAnchor && pageDimensions && hoveredStickerRect && (
          <StickerAnchorHighlight
            rect={hoveredStickerRect}
            pageWidth={pageDimensions.width}
            pageHeight={pageDimensions.height}
          />
        )}
      </div>
    </div>
  )
})

export const VirtualPdfList = forwardRef<VirtualPdfListHandle, VirtualPdfListProps>(
  function VirtualPdfList(
    {
      numPages,
      scale,
      pageWidth,
      pageHeights,
      currentPage,
      onPageInViewChange,
      onPageRender,
      containerHeight,
      onCanvasReady,
      onCanvasUnmount,
      selectionMode = false,
      regions = [],
      highlightedRegionIds = [],
      onDeleteRegion,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      drawingRect = null,
      drawingPage = null,
      pageDimensionsRef,
      // New props for scroll mode feature parity (Task 3)
      isAutoImageDetectionEnabled = false,
      detectedImagesByPage = new Map(),
      showHighlightFeedback = false,
      loadingPages = new Set(),
      hoveredStickerRect = null,
      hoveredStickerPage = null,
      onPageAreaClick,
      onStickerHitTestMove,
      onStickerHitTestLeave,
    },
    ref
  ) {
    const listRef = useRef<VariableSizeList<PageRowData>>(null)
    const outerRef = useRef<HTMLDivElement>(null)
    const lastScrolledPageRef = useRef<number>(currentPage)
    const currentPageRef = useRef<number>(currentPage)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Track visible pages for IntersectionObserver
    const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([currentPage]))
    const visibleAreasRef = useRef<Map<number, number>>(new Map())
    const pageObserverRef = useRef<IntersectionObserver | null>(null)
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

    // Zoom anchor state for preserving position during scale changes
    const zoomAnchorRef = useRef<{ page: number; offsetRatio: number } | null>(null)
    const prevScaleRef = useRef<number>(scale)

    // Get item size for a page
    const getItemSize = useCallback(
      (index: number) => {
        // pageWidth = containerWidth / scale (adjusted for zoom mode)
        // react-pdf Page ignores scale when width is provided
        // So actual rendered height = pageWidth * aspectRatio
        const estimatedHeight = pageWidth * DEFAULT_PAGE_ASPECT_RATIO
        const baseHeight = pageHeights[index] || estimatedHeight
        return baseHeight + PAGE_GAP_PX
      },
      [pageHeights, pageWidth]
    )

    // Calculate scroll offset for a page
    const getPageScrollOffset = useCallback(
      (pageNumber: number): number => {
        let offset = 0
        for (let i = 0; i < pageNumber - 1 && i < numPages; i++) {
          offset += getItemSize(i)
        }
        return offset
      },
      [numPages, getItemSize]
    )

    // Expose scrollToPage and getCurrentPage via ref
    useImperativeHandle(ref, () => ({
      scrollToPage: (pageNumber: number, behavior: ScrollBehavior = 'smooth') => {
        if (!outerRef.current) return

        const validPage = Math.min(Math.max(1, pageNumber), numPages)
        const scrollOffset = getPageScrollOffset(validPage) + PAGE_PADDING_PX

        outerRef.current.scrollTo({
          top: scrollOffset,
          behavior,
        })
        lastScrolledPageRef.current = validPage
      },
      getCurrentPage: () => currentPageRef.current,
    }))

    // Setup IntersectionObserver for current page tracking
    useEffect(() => {
      if (!isIntersectionObserverSupported()) return

      const handleIntersection = (entries: IntersectionObserverEntry[]) => {
        entries.forEach(entry => {
          const pageContainer = entry.target as HTMLElement
          const pageNum = parseInt(pageContainer.dataset.pageContainer || '0', 10)
          if (!pageNum) return

          if (entry.isIntersecting) {
            // Calculate visible area
            const visibleArea = entry.intersectionRatio * entry.boundingClientRect.height
            visibleAreasRef.current.set(pageNum, visibleArea)
          } else {
            visibleAreasRef.current.delete(pageNum)
          }
        })

        // Update visible pages set
        setVisiblePages(new Set(visibleAreasRef.current.keys()))

        // Determine current page (highest visible area)
        let maxArea = 0
        let newCurrentPage = currentPageRef.current

        visibleAreasRef.current.forEach((area, page) => {
          if (area > maxArea) {
            maxArea = area
            newCurrentPage = page
          }
        })

        // Debounced update
        if (newCurrentPage !== currentPageRef.current) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
          }
          debounceTimerRef.current = setTimeout(() => {
            currentPageRef.current = newCurrentPage
            if (newCurrentPage !== lastScrolledPageRef.current) {
              lastScrolledPageRef.current = newCurrentPage
              onPageInViewChange(newCurrentPage)
            }
          }, CURRENT_PAGE_DEBOUNCE_MS)
        }
      }

      pageObserverRef.current = new IntersectionObserver(handleIntersection, {
        root: outerRef.current,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      })

      // Observe existing page refs
      pageRefs.current.forEach((element) => {
        pageObserverRef.current?.observe(element)
      })

      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
        pageObserverRef.current?.disconnect()
        pageObserverRef.current = null
      }
    }, [onPageInViewChange])

    // Fallback: Handle scroll to detect current page when IntersectionObserver unavailable
    const handleScroll = useCallback(
      ({ scrollOffset }: { scrollOffset: number }) => {
        // Only use scrollTop fallback if IntersectionObserver not available
        if (isIntersectionObserverSupported()) return

        const viewportHeight = containerHeight || (window.innerHeight - 120)
        const pageHeightsArray = Array.from({ length: numPages }, (_, i) => getItemSize(i))
        const newPage = calculateCurrentPageFromScroll(
          scrollOffset,
          viewportHeight,
          pageHeightsArray,
          PAGE_GAP_PX
        )

        if (newPage !== lastScrolledPageRef.current) {
          lastScrolledPageRef.current = newPage
          currentPageRef.current = newPage
          onPageInViewChange(newPage)
        }
      },
      [numPages, getItemSize, onPageInViewChange, containerHeight]
    )

    // Scroll to current page when it changes externally
    useEffect(() => {
      if (listRef.current && currentPage !== lastScrolledPageRef.current) {
        listRef.current.scrollToItem(currentPage - 1, 'start')
        lastScrolledPageRef.current = currentPage
        currentPageRef.current = currentPage
      }
    }, [currentPage])

    // Handle scale changes with anchor preservation
    useEffect(() => {
      if (scale !== prevScaleRef.current) {
        // Store anchor before scale change
        if (outerRef.current && !zoomAnchorRef.current) {
          const scrollTop = outerRef.current.scrollTop
          const viewportHeight = outerRef.current.clientHeight

          // Find the anchor page and offset
          let cumulativeHeight = 0
          for (let i = 0; i < numPages; i++) {
            const itemHeight = getItemSize(i)
            const itemBottom = cumulativeHeight + itemHeight

            // If this page contains the viewport top
            if (itemBottom > scrollTop) {
              const pageTop = cumulativeHeight
              const offsetWithinPage = scrollTop - pageTop
              const offsetRatio = offsetWithinPage / itemHeight

              zoomAnchorRef.current = {
                page: i + 1,
                offsetRatio: Math.max(0, Math.min(1, offsetRatio)),
              }
              break
            }
            cumulativeHeight = itemBottom
          }
        }

        // Reset list cache
        if (listRef.current) {
          listRef.current.resetAfterIndex(0)
        }

        // Restore scroll position after heights recalculate
        requestAnimationFrame(() => {
          if (zoomAnchorRef.current && outerRef.current) {
            const { page, offsetRatio } = zoomAnchorRef.current
            const newPageOffset = getPageScrollOffset(page)
            const newPageHeight = getItemSize(page - 1)
            const newScrollTop = newPageOffset + newPageHeight * offsetRatio

            outerRef.current.scrollTo({ top: newScrollTop, behavior: 'instant' })
            zoomAnchorRef.current = null
          }
        })

        prevScaleRef.current = scale
      }
    }, [scale, numPages, getItemSize, getPageScrollOffset])

    // Reset cache when pageHeights change
    useEffect(() => {
      if (listRef.current) {
        listRef.current.resetAfterIndex(0)
      }
    }, [pageHeights])

    // Item data for the list
    const itemData: PageRowData = {
      scale,
      pageWidth,
      onCanvasReady,
      onCanvasUnmount,
      onPageRender,
      selectionMode,
      regions,
      highlightedRegionIds,
      onDeleteRegion,
      onPointerDown,
      drawingRect,
      drawingPage,
      visiblePages,
      pageDimensionsRef,
      pageObserverRef,
      pageRefs,
      // New props for scroll mode feature parity
      isAutoImageDetectionEnabled,
      detectedImagesByPage,
      showHighlightFeedback,
      loadingPages,
      hoveredStickerRect,
      hoveredStickerPage,
      onPageAreaClick,
      onStickerHitTestMove,
      onStickerHitTestLeave,
    }

    const listHeight = containerHeight || (typeof window !== 'undefined' ? window.innerHeight - 120 : 800)

    return (
      <div
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        onPointerMove={selectionMode ? onPointerMove : undefined}
        onPointerUp={selectionMode ? onPointerUp : undefined}
        role="region"
        aria-label="PDF pages, use arrow keys to scroll"
      >
        <VariableSizeList
          ref={listRef}
          outerRef={outerRef}
          height={listHeight}
          width="100%"
          itemCount={numPages}
          itemSize={getItemSize}
          itemData={itemData}
          onScroll={handleScroll}
          overscanCount={OVERSCAN_COUNT}
          className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 focus:outline-none"
          style={{ outline: 'none' }}
        >
          {PageRow}
        </VariableSizeList>
      </div>
    )
  }
)

// For backward compatibility, also export as default
export default VirtualPdfList
