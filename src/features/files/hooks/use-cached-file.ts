'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useFile } from './use-files'
import { pdfCacheService } from '@/lib/pdf/cache-service'
import { signedUrlCache } from '@/lib/pdf/url-cache'
import { cacheSyncService, type CacheEvent } from '@/lib/pdf/cache-sync'
import { debugLog } from '@/lib/debug'

/**
 * Cache status for the PDF file
 */
export type CacheStatus = 'loading' | 'hit' | 'miss' | 'stale' | 'downloading'

/**
 * Download progress for the PDF file
 */
export interface DownloadProgress {
  /** Bytes loaded so far */
  loaded: number
  /** Total bytes (0 if unknown) */
  total: number
  /** Percentage complete (0-100), or -1 if total unknown */
  percent: number
}

/**
 * Return type for useCachedFile hook
 */
export interface UseCachedFileReturn {
  /** File metadata (from useFile) */
  file: ReturnType<typeof useFile>['data']
  /** Whether file metadata is loading */
  isLoading: boolean
  /** Error from loading */
  error: Error | null
  /** PDF binary data (ArrayBuffer) or URL string */
  pdfSource: ArrayBuffer | string | null
  /** Whether loading from cache */
  isCached: boolean
  /** Cache status */
  cacheStatus: CacheStatus
  /** Download progress (when downloading) */
  downloadProgress: DownloadProgress | null
  /** Manually refetch the file */
  refetch: () => void
}

/**
 * Hook for fetching PDF files with IndexedDB caching.
 *
 * Provides:
 * - Automatic caching of PDF binary data in IndexedDB
 * - Cache validation via content hash
 * - Multi-tab synchronization via BroadcastChannel
 * - Stale cache revalidation on tab focus
 * - Fallback to URL when cache is unavailable
 *
 * @param courseId - Course ID
 * @param fileId - File ID
 * @param options - Optional configuration
 * @returns Cached file data and status
 *
 * @example
 * ```tsx
 * const { file, pdfSource, isCached, cacheStatus } = useCachedFile(courseId, fileId)
 *
 * // pdfSource can be passed to react-pdf Document component
 * <Document file={pdfSource} />
 * ```
 */
export function useCachedFile(
  courseId: string,
  fileId: string,
  options: {
    /** Enable caching (default: true) */
    enableCache?: boolean
  } = {}
): UseCachedFileReturn {
  const { enableCache = true } = options

  // Use existing file hook for metadata
  const fileQuery = useFile(courseId, fileId)

  // Cache state
  const [pdfSource, setPdfSource] = useState<ArrayBuffer | string | null>(null)
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>('loading')
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Refs for cleanup and stale tracking
  const isStaleRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Get file data
  const file = fileQuery.data
  const downloadUrl = file?.downloadUrl
  const contentHash = file?.contentHash

  /**
   * Download PDF from URL and optionally cache it
   */
  const downloadPdf = useCallback(async (
    url: string,
    hash: string | null | undefined,
    signal?: AbortSignal
  ): Promise<ArrayBuffer | null> => {
    setCacheStatus('downloading')
    setDownloadProgress({ loaded: 0, total: 0, percent: -1 })

    try {
      const response = await fetch(url, { signal })

      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.status}`)
      }

      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      // If no streaming, just get the blob
      if (!response.body) {
        const blob = await response.blob()
        const buffer = await blob.arrayBuffer()
        setDownloadProgress({ loaded: buffer.byteLength, total: buffer.byteLength, percent: 100 })
        return buffer
      }

      // Stream download with progress
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        loaded += value.length

        const percent = total > 0 ? Math.round((loaded / total) * 100) : -1
        setDownloadProgress({ loaded, total, percent })
      }

      // Combine chunks into ArrayBuffer
      const buffer = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) {
        buffer.set(chunk, offset)
        offset += chunk.length
      }

      return buffer.buffer
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        debugLog('[useCachedFile] Download aborted')
        return null
      }
      throw err
    } finally {
      setDownloadProgress(null)
    }
  }, [])

  /**
   * Load PDF from cache or download
   */
  const loadPdf = useCallback(async () => {
    if (!downloadUrl || !fileId) return

    // Cancel any pending download
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    try {
      // Try cache first (if enabled)
      if (enableCache && pdfCacheService.available) {
        setCacheStatus('loading')
        const cachedData = await pdfCacheService.get(fileId, contentHash || undefined)

        if (cachedData) {
          debugLog('[useCachedFile] Cache hit for:', fileId)
          setPdfSource(cachedData)
          setCacheStatus('hit')
          return
        }

        debugLog('[useCachedFile] Cache miss for:', fileId)
        setCacheStatus('miss')
      }

      // Check signed URL cache
      const cachedUrl = signedUrlCache.get(fileId)
      const urlToUse = cachedUrl?.url || downloadUrl

      // Cache the signed URL for future use
      if (!cachedUrl && downloadUrl) {
        signedUrlCache.set(fileId, downloadUrl, contentHash || undefined)
      }

      // Download the PDF
      const data = await downloadPdf(urlToUse, contentHash, abortControllerRef.current?.signal)

      if (!data) return // Aborted

      // Cache the downloaded PDF
      if (enableCache && pdfCacheService.available && contentHash) {
        try {
          await pdfCacheService.set(fileId, data, contentHash)
          cacheSyncService.notifyCacheUpdated(fileId)
          debugLog('[useCachedFile] Cached PDF:', fileId)
        } catch (cacheError) {
          console.warn('[useCachedFile] Failed to cache PDF:', cacheError)
        }
      }

      setPdfSource(data)
      setCacheStatus(enableCache ? 'miss' : 'downloading')
    } catch (err) {
      console.error('[useCachedFile] Error loading PDF:', err)
      setError(err instanceof Error ? err : new Error('Failed to load PDF'))

      // Fallback to URL
      setPdfSource(downloadUrl)
      setCacheStatus('miss')
    }
  }, [downloadUrl, fileId, contentHash, enableCache, downloadPdf])

  // Load PDF when file data is available
  useEffect(() => {
    if (fileQuery.data?.downloadUrl) {
      loadPdf()
    }

    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fileQuery.data?.downloadUrl, loadPdf])

  // Subscribe to cache events from other tabs
  useEffect(() => {
    if (!enableCache) return

    const unsubscribe = cacheSyncService.subscribe((event: CacheEvent) => {
      if (event.type === 'pdf_cache_invalidated' && event.fileId === fileId) {
        debugLog('[useCachedFile] Cache invalidated for:', fileId)
        isStaleRef.current = true
        setCacheStatus('stale')
      }

      if (event.type === 'pdf_cache_cleared') {
        debugLog('[useCachedFile] Cache cleared')
        isStaleRef.current = true
        setCacheStatus('stale')
      }
    })

    return unsubscribe
  }, [fileId, enableCache])

  // Revalidate on tab focus if cache is stale
  useEffect(() => {
    if (!enableCache) return

    const handleFocus = () => {
      if (isStaleRef.current && downloadUrl) {
        debugLog('[useCachedFile] Revalidating stale cache on focus')
        isStaleRef.current = false
        loadPdf()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enableCache, downloadUrl, loadPdf])

  // Refetch function
  const refetch = useCallback(() => {
    fileQuery.refetch()
    loadPdf()
  }, [fileQuery, loadPdf])

  return {
    file: fileQuery.data,
    isLoading: fileQuery.isLoading || cacheStatus === 'loading' || cacheStatus === 'downloading',
    error: fileQuery.error || error,
    pdfSource,
    isCached: cacheStatus === 'hit',
    cacheStatus,
    downloadProgress,
    refetch,
  }
}
