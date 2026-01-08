/**
 * Reader API client functions.
 */

import { patch, type ApiResult } from '@/lib/api-client'

interface FileUpdateResponse {
  id: string
  name: string
  type: string
  pageCount: number
  isScanned: boolean
  lastReadPage: number
  uploadedAt: string
}

/**
 * Update the last read page for a file
 */
export function updateLastReadPage(
  courseId: string,
  fileId: string,
  page: number
): Promise<ApiResult<FileUpdateResponse>> {
  return patch<FileUpdateResponse>(
    `/api/courses/${courseId}/files/${fileId}`,
    { lastReadPage: page }
  )
}
