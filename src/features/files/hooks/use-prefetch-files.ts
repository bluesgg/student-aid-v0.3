'use client'

import { useEffect, useRef } from 'react'
import { pdfCacheService } from '@/lib/pdf/cache-service'
import { signedUrlCache } from '@/lib/pdf/url-cache'
import { cacheSyncService } from '@/lib/pdf/cache-sync'
import { debugLog } from '@/lib/debug'
import * as filesApi from '../api'
import { isApiError } from '@/lib/api-client'

/** Maximum number of files to prefetch */
const MAX_PREFETCH_FILES = 3

/** Delay before starting prefetch (ms) - allow page to become interactive first */
const PREFETCH_DELAY_MS = 2000

/** Delay between individual file prefetches (ms) - avoid overloading network */
const PREFETCH_INTERVAL_MS = 500

interface FileToPrefetch {
  id: string
  courseId: string
}

/**
 * Hook to prefetch PDF files in the background.
 *
 * Prefetches the first 3 files from the list after the page is interactive.
 * - Low priority (starts after delay)
 * - Respects cache limits (uses existing eviction)
 * - Skips already cached files
 *
 * @param courseId - Course ID
 * @param fileIds - List of file IDs to potentially prefetch
 *
 * @example
 * ```tsx
 * function FileList({ courseId }) {
 *   const { data } = useFiles(courseId)
 *   const fileIds = data?.items.map(f => f.id) || []
 *
 *   // Prefetch first 3 files in background
 *   usePrefetchFiles(courseId, fileIds)
 *
 *   return <div>...</div>
 * }
 * ```
 */
export function usePrefetchFiles(courseId: string, fileIds: string[]): void {
  // Track if prefetch has been initiated for this set of files
  const hasStartedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const prevFileIdsKeyRef = useRef<string | null>(null)

  useEffect(() => {
    // Skip if no files or cache not available
    if (!fileIds.length || !pdfCacheService.available) {
      return
    }

    // Create a key to detect file list changes
    const fileIdsKey = fileIds.slice(0, MAX_PREFETCH_FILES).join(',')

    // Skip if already started for this set of files
    if (fileIdsKey === prevFileIdsKeyRef.current && hasStartedRef.current) {
      return
    }

    // Abort any in-progress prefetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Reset tracking
    prevFileIdsKeyRef.current = fileIdsKey
    hasStartedRef.current = false

    // Create new abort controller
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // Build list of files to prefetch
    const filesToPrefetch: FileToPrefetch[] = fileIds
      .slice(0, MAX_PREFETCH_FILES)
      .map((id) => ({ id, courseId }))

    // Start prefetch after delay
    const timeoutId = setTimeout(async () => {
      if (abortController.signal.aborted) return

      hasStartedRef.current = true
      debugLog('[Prefetch] Starting prefetch for', filesToPrefetch.length, 'files')

      for (let i = 0; i < filesToPrefetch.length; i++) {
        if (abortController.signal.aborted) break

        const file = filesToPrefetch[i]

        try {
          await prefetchFile(file.courseId, file.id, abortController.signal)
        } catch (err) {
          // Ignore errors - prefetch is best-effort
          if (err instanceof Error && err.name !== 'AbortError') {
            debugLog('[Prefetch] Error prefetching file:', file.id, err)
          }
        }

        // Wait before next file (unless aborted)
        if (i < filesToPrefetch.length - 1 && !abortController.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, PREFETCH_INTERVAL_MS))
        }
      }

      debugLog('[Prefetch] Prefetch complete')
    }, PREFETCH_DELAY_MS)

    // Cleanup
    return () => {
      clearTimeout(timeoutId)
      abortController.abort()
    }
  }, [courseId, fileIds])
}

/**
 * Prefetch a single file
 */
async function prefetchFile(
  courseId: string,
  fileId: string,
  signal: AbortSignal
): Promise<void> {
  // Check if already cached
  const cachedData = await pdfCacheService.get(fileId)
  if (cachedData) {
    debugLog('[Prefetch] File already cached:', fileId)
    return
  }

  // Fetch file metadata to get signed URL
  const fileResult = await filesApi.getFile(courseId, fileId)
  if (isApiError(fileResult)) {
    debugLog('[Prefetch] Failed to get file metadata:', fileId)
    return
  }

  const file = fileResult.data
  if (!file.downloadUrl) {
    debugLog('[Prefetch] No download URL for file:', fileId)
    return
  }

  // Check abort before download
  if (signal.aborted) return

  // Cache the signed URL
  signedUrlCache.set(fileId, file.downloadUrl, file.contentHash || undefined)

  // Download the PDF
  debugLog('[Prefetch] Downloading file:', fileId)
  const response = await fetch(file.downloadUrl, { signal })

  if (!response.ok) {
    debugLog('[Prefetch] Download failed:', fileId, response.status)
    return
  }

  const data = await response.arrayBuffer()

  // Check abort before caching
  if (signal.aborted) return

  // Cache the PDF
  if (file.contentHash) {
    try {
      await pdfCacheService.set(fileId, data, file.contentHash)
      cacheSyncService.notifyCacheUpdated(fileId)
      debugLog('[Prefetch] Cached file:', fileId, 'size:', data.byteLength)
    } catch (cacheError) {
      debugLog('[Prefetch] Failed to cache file:', fileId, cacheError)
    }
  }
}
