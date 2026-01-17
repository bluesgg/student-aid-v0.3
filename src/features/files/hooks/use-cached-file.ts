'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useFile } from './use-files'
import { pdfCacheService } from '@/lib/pdf/cache-service'
import { signedUrlCache } from '@/lib/pdf/url-cache'
import { cacheSyncService, type CacheEvent } from '@/lib/pdf/cache-sync'
import { debugLog } from '@/lib/debug'

export type CacheStatus = 'loading' | 'hit' | 'miss' | 'stale' | 'downloading'

export interface DownloadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UseCachedFileReturn {
  file: ReturnType<typeof useFile>['data']
  isLoading: boolean
  error: Error | null
  pdfSource: ArrayBuffer | string | null
  isCached: boolean
  cacheStatus: CacheStatus
  downloadProgress: DownloadProgress | null
  refetch: () => void
}

/**
 * Hook for fetching PDF files with IndexedDB caching.
 * Provides automatic caching, cache validation via content hash,
 * multi-tab synchronization, and fallback to URL when cache is unavailable.
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

  useEffect(() => {
    if (fileQuery.data?.downloadUrl) {
      loadPdf()
    }
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [fileQuery.data?.downloadUrl, loadPdf])

  useEffect(() => {
    if (!enableCache) return

    return cacheSyncService.subscribe((event: CacheEvent) => {
      const shouldInvalidate =
        (event.type === 'pdf_cache_invalidated' && event.fileId === fileId) ||
        event.type === 'pdf_cache_cleared'

      if (shouldInvalidate) {
        debugLog('[useCachedFile] Cache invalidated/cleared for:', fileId)
        isStaleRef.current = true
        setCacheStatus('stale')
      }
    })
  }, [fileId, enableCache])

  useEffect(() => {
    if (!enableCache) return

    function handleFocus(): void {
      if (isStaleRef.current && downloadUrl) {
        debugLog('[useCachedFile] Revalidating stale cache on focus')
        isStaleRef.current = false
        loadPdf()
      }
    }

    function handleVisibilityChange(): void {
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
