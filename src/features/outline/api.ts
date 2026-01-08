'use client'

import { get, post, isApiError } from '@/lib/api-client'

// Types
export interface OutlineReference {
  fileId: string
  fileName: string
  page: number
}

export interface OutlineNode {
  id: string
  title: string
  description?: string
  type: 'chapter' | 'section' | 'concept'
  children?: OutlineNode[]
  references?: OutlineReference[]
}

export interface OutlineResponse {
  id: string
  outline: OutlineNode[]
  cached: boolean
  createdAt: string
}

export interface OutlineExistsResponse {
  id?: string
  outline: OutlineNode[] | null
  exists: boolean
  createdAt?: string
}

/**
 * Generate a course outline from all course materials
 */
export async function generateOutline(
  courseId: string,
  regenerate: boolean = false
): Promise<OutlineResponse> {
  const result = await post<OutlineResponse>('/api/ai/outline', {
    courseId,
    regenerate,
  })

  if (isApiError(result)) {
    throw new Error(result.error.message)
  }

  return result.data
}

/**
 * Get existing outline for a course
 */
export async function getOutline(courseId: string): Promise<OutlineExistsResponse> {
  const result = await get<OutlineExistsResponse>(`/api/ai/outline?courseId=${courseId}`)

  if (isApiError(result)) {
    throw new Error(result.error.message)
  }

  return result.data
}
