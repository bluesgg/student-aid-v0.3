/**
 * Shared types and constants for sticker generation.
 * This file contains only types and constants, no server-side code.
 * Safe to import from both client and server components.
 */

/**
 * Current prompt version for cache invalidation.
 * Bump this when:
 * - Prompt template changes
 * - Output structure changes
 * - Key strategy changes (chunking, merging, image analysis)
 * 
 * History:
 * - 2026-01-12.2: Added with_selected_images mode for user-directed image region selection
 * - 2026-01-11.1: Initial cross-user deduplication with shared cache
 */
export const PROMPT_VERSION = '2026-01-12.2'

/**
 * Supported locales for sticker generation
 */
export type StickerLocale = 'en' | 'zh-Hans'

/**
 * Effective mode for sticker generation
 * - text_only: Page has no images or images are not relevant
 * - with_images: Page has images, AI analyzes all images on page
 * - with_selected_images: User-directed mode, AI analyzes user-selected image regions
 */
export type EffectiveMode = 'text_only' | 'with_images' | 'with_selected_images'

/**
 * Sticker generation status
 */
export type StickerStatus = 'generating' | 'ready' | 'failed'

/**
 * Selected image region stored in chunk_plan
 */
export interface SelectedImageRegion {
  page: number
  rect: { x: number; y: number; width: number; height: number }
}

/**
 * Cache lookup result
 */
export interface CacheLookupResult {
  status: 'ready' | 'generating' | 'not_found'
  stickers?: unknown[] // JSONB stickers array
  generationId?: string
  imageSummaries?: unknown // JSONB image summaries
  /** Selected image regions for with_selected_images mode (from chunk_plan) */
  selectedImageRegions?: SelectedImageRegion[]
}

/**
 * Generation start result
 */
export interface StartGenerationResult {
  started: boolean
  generationId: string
  alreadyExists?: boolean
}

/**
 * Generation status result
 */
export interface GenerationStatusResult {
  status: StickerStatus
  stickers?: unknown[]
  error?: string
  generationTimeMs?: number
  /** Selected image regions for with_selected_images mode (from chunk_plan) */
  selectedImageRegions?: SelectedImageRegion[]
}
