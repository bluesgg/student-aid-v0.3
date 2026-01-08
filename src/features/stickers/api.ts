/**
 * Sticker API client functions.
 */

import { get, post, patch, del, type ApiResult } from '@/lib/api-client'
import { parseSSEStream } from '@/lib/openai/streaming'

export type StickerType = 'auto' | 'manual'
export type PdfType = 'Lecture' | 'Homework' | 'Exam' | 'Other'

export interface Sticker {
  id: string
  type: StickerType
  page: number
  anchor: {
    textSnippet: string
    rect?: {
      x: number
      y: number
      width: number
      height: number
    } | null
  }
  parentId: string | null
  contentMarkdown: string
  folded: boolean
  depth: number
  createdAt: string
}

export interface QuotaInfo {
  used: number
  limit: number
  resetAt: string
}

export interface ExplainPageResponse {
  stickers: Sticker[]
  quota: {
    autoExplain: QuotaInfo
  }
  cached: boolean
}

export interface ExplainSelectionResponse {
  sticker: Sticker
  quota: {
    learningInteractions: QuotaInfo
  }
}

/**
 * Get all stickers for a file
 */
export function getStickers(
  fileId: string,
  page?: number
): Promise<ApiResult<{ items: Sticker[] }>> {
  const params = new URLSearchParams({ fileId })
  if (page !== undefined) {
    params.set('page', page.toString())
  }
  return get<{ items: Sticker[] }>(`/api/ai/stickers?${params.toString()}`)
}

/**
 * Toggle sticker folded state
 */
export function toggleSticker(
  stickerId: string,
  folded: boolean
): Promise<ApiResult<{ id: string; folded: boolean }>> {
  return patch<{ id: string; folded: boolean }>(`/api/ai/stickers/${stickerId}`, {
    folded,
  })
}

/**
 * Delete a sticker
 */
export function deleteSticker(
  stickerId: string
): Promise<ApiResult<{ message: string }>> {
  return del<{ message: string }>(`/api/ai/stickers/${stickerId}`)
}

/**
 * Explain a page (auto-stickers)
 */
export function explainPage(params: {
  courseId: string
  fileId: string
  page: number
  pdfType: PdfType
}): Promise<ApiResult<ExplainPageResponse>> {
  return post<ExplainPageResponse>('/api/ai/explain-page', params)
}

/**
 * Explain selected text (streaming)
 */
export async function explainSelection(
  params: {
    courseId: string
    fileId: string
    page: number
    selectedText: string
    parentId?: string | null
    pdfType: PdfType
  },
  onChunk: (chunk: string) => void,
  onComplete: (stickerId: string) => void
): Promise<void> {
  const response = await fetch('/api/ai/explain-selection', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error?.message || 'Failed to explain selection')
  }

  // Get sticker ID from headers
  const stickerId = response.headers.get('X-Sticker-Id')

  // Parse SSE stream
  for await (const chunk of parseSSEStream(response)) {
    if (chunk.error) {
      throw new Error(chunk.error)
    }
    if (chunk.content) {
      onChunk(chunk.content)
    }
    if (chunk.done && stickerId) {
      onComplete(stickerId)
    }
  }
}

/**
 * Explain selected text (non-streaming)
 */
export function explainSelectionSync(params: {
  courseId: string
  fileId: string
  page: number
  selectedText: string
  parentId?: string | null
  pdfType: PdfType
}): Promise<ApiResult<ExplainSelectionResponse>> {
  return post<ExplainSelectionResponse>('/api/ai/explain-selection', params)
}
