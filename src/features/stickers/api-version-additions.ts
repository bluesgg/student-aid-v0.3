/**
 * Sticker Version Management API additions
 * Add these exports to api.ts
 */

import { get, post, patch, type ApiResult } from '@/lib/api-client'
import type { Sticker } from './api'

// ==================== Sticker Version Management ====================

/**
 * Version info for a sticker
 */
export interface StickerVersion {
  version: number
  contentMarkdown: string
  createdAt: string
}

/**
 * Sticker with version info
 */
export interface StickerWithVersions extends Sticker {
  currentVersion: number
  totalVersions: number
  versions: StickerVersion[]
  pageRange?: {
    start: { page: number; yStart: number; yEnd: number }
    end: { page: number; yStart: number; yEnd: number }
  } | null
}

/**
 * Refresh sticker response
 */
export interface RefreshStickerResponse {
  sticker: StickerWithVersions
}

/**
 * Refresh a sticker (regenerate explanation)
 */
export function refreshSticker(
  stickerId: string
): Promise<ApiResult<RefreshStickerResponse>> {
  return post<RefreshStickerResponse>(
    `/api/ai/explain-page/sticker/${stickerId}/refresh`,
    {}
  )
}

/**
 * Get sticker with version info
 */
export function getStickerVersions(
  stickerId: string
): Promise<ApiResult<{ sticker: StickerWithVersions }>> {
  return get<{ sticker: StickerWithVersions }>(
    `/api/ai/explain-page/sticker/${stickerId}/version`
  )
}

/**
 * Switch sticker version
 */
export function switchStickerVersion(
  stickerId: string,
  version: 1 | 2
): Promise<ApiResult<{ currentVersion: number; contentMarkdown: string }>> {
  return patch<{ currentVersion: number; contentMarkdown: string }>(
    `/api/ai/explain-page/sticker/${stickerId}/version`,
    { version }
  )
}

// ==================== Window Mode Auto-Explain ====================

/**
 * Auto-explain session response
 */
export interface AutoExplainSessionResponse {
  ok: boolean
  sessionId: string
  windowRange: { start: number; end: number }
  pdfType: 'ppt' | 'text'
  message: string
}

/**
 * Start window mode auto-explain
 */
export function startWindowExplain(params: {
  courseId: string
  fileId: string
  page: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  locale?: 'en' | 'zh-Hans'
}): Promise<ApiResult<AutoExplainSessionResponse>> {
  return post<AutoExplainSessionResponse>('/api/ai/explain-page', {
    ...params,
    mode: 'window',
  })
}
