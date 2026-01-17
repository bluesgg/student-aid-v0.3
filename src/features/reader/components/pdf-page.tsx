'use client'

import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { Page } from 'react-pdf'

interface PdfPageProps {
  pageNumber: number
  scale: number
  width?: number
  onLoadSuccess?: () => void
  /** Callback when page renders with actual dimensions */
  onPageRender?: (pageNumber: number, height: number) => void
  /** Callback when canvas becomes available (for image region selection) */
  onCanvasReady?: (pageNumber: number, canvas: HTMLCanvasElement) => void
  /** Callback when canvas is unmounted */
  onCanvasUnmount?: (pageNumber: number) => void
  /** Whether to enable lazy layer rendering (default: true) */
  lazyLayers?: boolean
}

/** Timeout for canvas registration (5 seconds) */
const CANVAS_REGISTRATION_TIMEOUT = 5000

/** Delay before rendering text layer (ms) */
const TEXT_LAYER_DELAY_MS = 500

/** Delay before rendering annotation layer (ms) */
const ANNOTATION_LAYER_DELAY_MS = 800

function PdfPageComponent({
  pageNumber,
  scale,
  width,
  onLoadSuccess,
  onPageRender,
  onCanvasReady,
  onCanvasUnmount,
  lazyLayers = true,
}: PdfPageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [renderTextLayer, setRenderTextLayer] = useState(!lazyLayers)
  const [renderAnnotationLayer, setRenderAnnotationLayer] = useState(!lazyLayers)
  const containerRef = useRef<HTMLDivElement>(null)
  const registeredRef = useRef(false)

  const handleRenderSuccess = useCallback(() => {
    setIsLoading(false)
    onLoadSuccess?.()

    // Report actual rendered height
    if (onPageRender && containerRef.current) {
      const pageElement = containerRef.current.querySelector('.react-pdf__Page')
      if (pageElement) {
        const height = pageElement.getBoundingClientRect().height
        onPageRender(pageNumber, height)
      }
    }
  }, [onLoadSuccess, onPageRender, pageNumber])

  // Canvas registration with MutationObserver
  useEffect(() => {
    if (!onCanvasReady || !containerRef.current) return

    const el = containerRef.current
    registeredRef.current = false

    // Try to register canvas immediately
    const tryRegister = () => {
      const canvas = el.querySelector('canvas')
      if (canvas && !registeredRef.current) {
        registeredRef.current = true
        onCanvasReady(pageNumber, canvas as HTMLCanvasElement)
        return true
      }
      return false
    }

    // If canvas already exists, register immediately
    if (tryRegister()) return

    // Otherwise, use MutationObserver to watch for canvas appearance
    const observer = new MutationObserver(() => {
      if (tryRegister()) {
        observer.disconnect()
        clearTimeout(timeoutId)
      }
    })

    // Set up timeout protection
    const timeoutId = setTimeout(() => {
      observer.disconnect()
      if (!registeredRef.current) {
        console.warn(`Canvas registration timeout for page ${pageNumber}`)
      }
    }, CANVAS_REGISTRATION_TIMEOUT)

    // Start observing
    observer.observe(el, { childList: true, subtree: true })

    // Cleanup
    return () => {
      observer.disconnect()
      clearTimeout(timeoutId)
    }
  }, [pageNumber, onCanvasReady])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (onCanvasUnmount) {
        onCanvasUnmount(pageNumber)
      }
    }
  }, [pageNumber, onCanvasUnmount])

  // Lazy text layer rendering - enable after canvas is stable
  useEffect(() => {
    if (!lazyLayers || renderTextLayer) return

    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      const idleId = (window as Window & typeof globalThis & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(
        () => {
          setRenderTextLayer(true)
        },
        { timeout: TEXT_LAYER_DELAY_MS }
      )
      return () => {
        if ('cancelIdleCallback' in window) {
          (window as Window & typeof globalThis & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId)
        }
      }
    } else {
      const timeoutId = setTimeout(() => {
        setRenderTextLayer(true)
      }, TEXT_LAYER_DELAY_MS)
      return () => clearTimeout(timeoutId)
    }
  }, [lazyLayers, renderTextLayer])

  // Lazy annotation layer rendering - enable after text layer
  useEffect(() => {
    if (!lazyLayers || renderAnnotationLayer || !renderTextLayer) return

    const timeoutId = setTimeout(() => {
      setRenderAnnotationLayer(true)
    }, ANNOTATION_LAYER_DELAY_MS - TEXT_LAYER_DELAY_MS)

    return () => clearTimeout(timeoutId)
  }, [lazyLayers, renderAnnotationLayer, renderTextLayer])

  return (
    <div
      ref={containerRef}
      className="relative"
      data-page-number={pageNumber}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}
      <Page
        pageNumber={pageNumber}
        scale={scale}
        width={width}
        renderTextLayer={renderTextLayer}
        renderAnnotationLayer={renderAnnotationLayer}
        onRenderSuccess={handleRenderSuccess}
        loading={null}
        className="shadow-lg"
      />
    </div>
  )
}

// Memoize to prevent unnecessary re-renders
export const PdfPage = memo(PdfPageComponent)
