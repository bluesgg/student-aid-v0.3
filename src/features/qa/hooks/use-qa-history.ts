'use client'

import { useQuery } from '@tanstack/react-query'
import * as qaApi from '../api'

/**
 * Hook for fetching Q&A history for a file
 */
export function useQAHistory(fileId: string) {
  return useQuery({
    queryKey: ['qa-history', fileId],
    queryFn: () => qaApi.getQAHistory(fileId),
    enabled: !!fileId,
    staleTime: 30 * 1000, // 30 seconds
  })
}
