'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/toast'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type ExtractionStatus = 'ready' | 'processing' | 'pending' | 'failed' | 'not_found'

export interface ExtractionStatusData {
  status: ExtractionStatus
  progress?: {
    processedPages: number
    totalPages: number
    currentBatch: number
    totalBatches: number
  }
  entriesCount?: number
  error?: string
}

/**
 * Fetch extraction status for a single file
 */
async function fetchExtractionStatus(fileId: string): Promise<ExtractionStatusData> {
  const response = await fetch(`/api/context/extraction-status/${fileId}`)

  if (!response.ok) {
    if (response.status === 404) {
      return { status: 'not_found' }
    }
    throw new Error('Failed to fetch extraction status')
  }

  const data = await response.json()
  return data.data
}

/**
 * Hook for fetching extraction status of a single file
 */
export function useExtractionStatus(fileId: string | null) {
  return useQuery({
    queryKey: ['extraction-status', fileId],
    queryFn: () => fetchExtractionStatus(fileId!),
    enabled: !!fileId,
    refetchInterval: (query) => {
      // Stop polling when ready, failed, or not_found
      const status = query.state.data?.status
      if (status === 'ready' || status === 'failed' || status === 'not_found') {
        return false
      }
      // Poll every 5 seconds while processing/pending
      return 5000
    },
  })
}

/**
 * Options for the useExtractionStatuses hook
 */
export interface UseExtractionStatusesOptions {
  /** Map of file IDs to file names (for toast notifications) */
  fileNames?: Record<string, string>
}

/**
 * Hook for batch fetching extraction statuses for multiple files
 * with Realtime subscription for live updates
 */
export function useExtractionStatuses(
  fileIds: string[],
  options: UseExtractionStatusesOptions = {}
) {
  const { fileNames = {} } = options
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [statuses, setStatuses] = useState<Record<string, ExtractionStatusData>>({})
  const [loading, setLoading] = useState(true)

  // Memoize the file IDs key to avoid complex dependency array
  const fileIdsKey = useMemo(() => fileIds.join(','), [fileIds])

  // Keep refs for use in callbacks
  const fileIdsRef = useRef(fileIds)
  fileIdsRef.current = fileIds

  const fileNamesRef = useRef(fileNames)
  fileNamesRef.current = fileNames

  // Fetch all statuses on mount
  useEffect(() => {
    const currentFileIds = fileIdsRef.current
    if (currentFileIds.length === 0) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchAllStatuses() {
      setLoading(true)
      const newStatuses: Record<string, ExtractionStatusData> = {}

      // Fetch in parallel with concurrency limit
      const batchSize = 5
      for (let i = 0; i < currentFileIds.length; i += batchSize) {
        const batch = currentFileIds.slice(i, i + batchSize)
        const results = await Promise.allSettled(
          batch.map((id) => fetchExtractionStatus(id))
        )

        if (cancelled) return

        results.forEach((result, index) => {
          const fileId = batch[index]
          if (result.status === 'fulfilled') {
            newStatuses[fileId] = result.value
          } else {
            newStatuses[fileId] = { status: 'not_found' }
          }
        })
      }

      if (!cancelled) {
        setStatuses(newStatuses)
        setLoading(false)
      }
    }

    fetchAllStatuses()

    return () => {
      cancelled = true
    }
  }, [fileIdsKey])

  // Subscribe to Realtime updates for extraction jobs
  useEffect(() => {
    const currentFileIds = fileIdsRef.current
    if (currentFileIds.length === 0) return

    const supabase = createClient()
    let channel: RealtimeChannel | null = null

    async function setupSubscription() {
      // Subscribe to job status changes
      channel = supabase
        .channel('extraction-jobs')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'context_extraction_jobs',
          },
          async (payload) => {
            const job = payload.new as {
              id: string
              file_id: string
              status: string
              processed_pages: number
              total_pages: number
              current_batch: number
              total_batches: number
              error_message?: string
            }

            // Only process if this job is for one of our files
            if (!fileIdsRef.current.includes(job.file_id)) return

            // Update the status in our state
            const newStatus: ExtractionStatusData = {
              status: job.status as ExtractionStatus,
              progress:
                job.status === 'processing' || job.status === 'pending'
                  ? {
                      processedPages: job.processed_pages,
                      totalPages: job.total_pages,
                      currentBatch: job.current_batch,
                      totalBatches: job.total_batches,
                    }
                  : undefined,
              error: job.error_message,
            }

            // If completed, fetch the actual entry count
            if (job.status === 'completed') {
              const freshStatus = await fetchExtractionStatus(job.file_id)
              setStatuses((prev) => ({
                ...prev,
                [job.file_id]: freshStatus,
              }))

              // Show toast notification with file name
              const fileName = fileNamesRef.current[job.file_id]
              addToast({
                type: 'success',
                title: 'Document analysis complete',
                message: fileName
                  ? `"${fileName}" is ready for enhanced AI features`
                  : 'AI features are now enhanced for this document',
                duration: 5000,
              })
            } else if (job.status === 'failed') {
              setStatuses((prev) => ({
                ...prev,
                [job.file_id]: newStatus,
              }))

              const fileName = fileNamesRef.current[job.file_id]
              addToast({
                type: 'warning',
                title: 'Document analysis partially complete',
                message: fileName
                  ? `"${fileName}" - AI features will work with available context`
                  : 'AI features will work with available context',
                duration: 5000,
              })
            } else {
              setStatuses((prev) => ({
                ...prev,
                [job.file_id]: newStatus,
              }))
            }

            // Invalidate query cache
            queryClient.invalidateQueries({
              queryKey: ['extraction-status', job.file_id],
            })
          }
        )
        .subscribe()
    }

    setupSubscription()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [fileIdsKey, queryClient, addToast])

  const getStatus = useCallback(
    (fileId: string): ExtractionStatusData | undefined => {
      return statuses[fileId]
    },
    [statuses]
  )

  return {
    statuses,
    loading,
    getStatus,
  }
}
