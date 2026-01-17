/**
 * File API client functions.
 */

import { get, patch, del, type ApiResult } from '@/lib/api-client'

export type FileType = 'Lecture' | 'Homework' | 'Exam' | 'Other'

export type ImageExtractionStatus = 'pending' | 'partial' | 'complete' | 'failed'

export interface CourseFile {
  id: string
  name: string
  type: FileType
  pageCount: number
  isScanned: boolean
  lastReadPage: number
  uploadedAt: string
  imageExtractionStatus?: ImageExtractionStatus
  imageExtractionProgress?: number
}

export interface FileWithUrl extends CourseFile {
  courseId: string
  downloadUrl: string | null
  imageExtractionStatus: ImageExtractionStatus
  imageExtractionProgress: number
  /** Content hash for cache validation (computed during upload) */
  contentHash: string | null
}

export interface GroupedFiles {
  Lecture: CourseFile[]
  Homework: CourseFile[]
  Exam: CourseFile[]
  Other: CourseFile[]
}

/**
 * Get all files for a course
 */
export function getFiles(
  courseId: string
): Promise<ApiResult<{ items: CourseFile[]; grouped: GroupedFiles }>> {
  return get<{ items: CourseFile[]; grouped: GroupedFiles }>(
    `/api/courses/${courseId}/files`
  )
}

/**
 * Get a single file with download URL
 */
export function getFile(
  courseId: string,
  fileId: string
): Promise<ApiResult<FileWithUrl>> {
  return get<FileWithUrl>(`/api/courses/${courseId}/files/${fileId}`)
}

/**
 * Upload a file to a course
 */
export async function uploadFile(
  courseId: string,
  file: File,
  name: string,
  type: FileType
): Promise<ApiResult<CourseFile>> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', name)
  formData.append('type', type)

  const response = await fetch(`/api/courses/${courseId}/files`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  return response.json()
}

/**
 * Update file (e.g., last read page)
 */
export function updateFile(
  courseId: string,
  fileId: string,
  data: { lastReadPage?: number }
): Promise<ApiResult<CourseFile>> {
  return patch<CourseFile>(`/api/courses/${courseId}/files/${fileId}`, data)
}

/**
 * Delete a file
 */
export function deleteFile(
  courseId: string,
  fileId: string
): Promise<ApiResult<{ message: string }>> {
  return del<{ message: string }>(`/api/courses/${courseId}/files/${fileId}`)
}
