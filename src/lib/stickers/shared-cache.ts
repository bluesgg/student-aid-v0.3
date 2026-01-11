/**
 * Shared sticker cache with single-flight generation pattern.
 * Provides cross-user deduplication for AI-generated stickers.
 */

import { createClient } from '@/lib/supabase/server'
import { calculateExpirationSeconds } from '@/lib/pdf/page-metadata'

/**
 * Current prompt version for cache invalidation.
 * Bump this when:
 * - Prompt template changes
 * - Output structure changes
 * - Key strategy changes (chunking, merging, image analysis)
 */
export const PROMPT_VERSION = '2026-01-11.1'

/**
 * Supported locales for sticker generation
 */
export type StickerLocale = 'en' | 'zh-Hans'

/**
 * Effective mode for sticker generation
 */
export type EffectiveMode = 'text_only' | 'with_images'

/**
 * Sticker generation status
 */
export type StickerStatus = 'generating' | 'ready' | 'failed'

/**
 * Cache lookup result
 */
export interface CacheLookupResult {
  status: 'ready' | 'generating' | 'not_found'
  stickers?: unknown[] // JSONB stickers array
  generationId?: string
  imageSummaries?: unknown // JSONB image summaries
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
}

/**
 * Check if user has opted out of shared cache.
 * Users with share_to_cache=false skip shared cache entirely.
 * 
 * @param userId - User ID
 * @returns true if user shares to cache (default), false if opted out
 */
export async function checkUserSharePreference(userId: string): Promise<boolean> {
  const supabase = createClient()

  const { data } = await supabase
    .from('user_preferences')
    .select('share_to_cache')
    .eq('user_id', userId)
    .single()

  // Default to true (opt-in) if no preference set
  return data?.share_to_cache ?? true
}

/**
 * Check shared cache for existing stickers.
 * 
 * @param pdfHash - SHA-256 hash of PDF binary content
 * @param page - 1-indexed page number
 * @param locale - Locale for sticker generation
 * @param effectiveMode - 'text_only' | 'with_images'
 * @returns CacheLookupResult with status and data
 */
export async function checkSharedCache(
  pdfHash: string,
  page: number,
  locale: StickerLocale,
  effectiveMode: EffectiveMode
): Promise<CacheLookupResult> {
  const supabase = createClient()

  // Query for existing cache entry with current prompt version
  const { data } = await supabase
    .from('shared_auto_stickers')
    .select('id, status, stickers, image_summaries')
    .eq('pdf_hash', pdfHash)
    .eq('page', page)
    .eq('prompt_version', PROMPT_VERSION)
    .eq('locale', locale)
    .eq('effective_mode', effectiveMode)
    .in('status', ['generating', 'ready'])
    .single()

  if (!data) {
    return { status: 'not_found' }
  }

  if (data.status === 'ready') {
    // Update last_accessed_at for cache analytics
    await supabase
      .from('shared_auto_stickers')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', data.id)

    return {
      status: 'ready',
      stickers: data.stickers as unknown[],
      generationId: data.id,
      imageSummaries: data.image_summaries,
    }
  }

  // Status is 'generating'
  return {
    status: 'generating',
    generationId: data.id,
  }
}

/**
 * Try to start a new generation job.
 * Uses DB unique constraint for single-flight pattern.
 * 
 * @param params - Generation parameters
 * @returns StartGenerationResult with started flag and generationId
 */
export async function tryStartGeneration(params: {
  pdfHash: string
  page: number
  locale: StickerLocale
  effectiveMode: EffectiveMode
  userId: string
  quotaUnits: number
  imagesCount?: number
  estimatedChunks?: number
}): Promise<StartGenerationResult> {
  const {
    pdfHash,
    page,
    locale,
    effectiveMode,
    userId,
    quotaUnits,
    imagesCount = 0,
    estimatedChunks = 1,
  } = params

  const supabase = createClient()

  // Calculate dynamic expiration
  const expirationSeconds = calculateExpirationSeconds(imagesCount, estimatedChunks)
  const expiresAt = new Date(Date.now() + expirationSeconds * 1000).toISOString()

  // Generate new UUID for the job
  const generationId = crypto.randomUUID()

  try {
    // Attempt to insert new generation job
    // Unique constraint will reject if another job exists for same cache key
    const { error: insertError } = await supabase.from('shared_auto_stickers').insert({
      id: generationId,
      pdf_hash: pdfHash,
      page,
      prompt_version: PROMPT_VERSION,
      locale,
      effective_mode: effectiveMode,
      status: 'generating',
      expires_at: expiresAt,
      run_after: new Date().toISOString(),
      attempts: 0,
    })

    if (insertError) {
      // Check if it's a unique constraint violation
      if (insertError.code === '23505') {
        // Another request already started generation
        // Get the existing generation ID
        const existing = await checkSharedCache(pdfHash, page, locale, effectiveMode)
        return {
          started: false,
          generationId: existing.generationId || generationId,
          alreadyExists: true,
        }
      }
      throw insertError
    }

    // Successfully inserted - record quota charge
    await supabase.from('explain_requests').insert({
      request_id: generationId,
      user_id: userId,
      pdf_hash: pdfHash,
      page,
      prompt_version: PROMPT_VERSION,
      locale,
      effective_mode: effectiveMode,
      quota_units: quotaUnits,
      status: 'charged',
    })

    return {
      started: true,
      generationId,
    }
  } catch (error) {
    console.error('Error starting generation:', error)
    throw error
  }
}

/**
 * Get generation status by ID.
 * Used for client polling.
 * 
 * @param generationId - UUID of the generation job
 * @returns GenerationStatusResult
 */
export async function getGenerationStatus(generationId: string): Promise<GenerationStatusResult> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('shared_auto_stickers')
    .select('status, stickers, last_error, generation_time_ms')
    .eq('id', generationId)
    .single()

  if (error || !data) {
    return {
      status: 'failed',
      error: 'Generation not found',
    }
  }

  return {
    status: data.status as StickerStatus,
    stickers: data.status === 'ready' ? (data.stickers as unknown[]) : undefined,
    error: data.status === 'failed' ? data.last_error || 'Generation failed' : undefined,
    generationTimeMs: data.generation_time_ms || undefined,
  }
}

/**
 * Complete a generation job successfully.
 * Called by worker after generating stickers.
 * 
 * @param generationId - UUID of the generation job
 * @param stickers - Generated stickers array
 * @param imageSummaries - Optional image summaries
 * @param generationTimeMs - Time taken for generation
 */
export async function completeGeneration(
  generationId: string,
  stickers: unknown[],
  imageSummaries?: unknown,
  generationTimeMs?: number
): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('shared_auto_stickers')
    .update({
      status: 'ready',
      stickers,
      image_summaries: imageSummaries,
      completed_at: new Date().toISOString(),
      generation_time_ms: generationTimeMs,
      locked_at: null,
      lock_owner: null,
    })
    .eq('id', generationId)

  if (error) {
    console.error('Error completing generation:', error)
    throw error
  }
}

/**
 * Mark a generation job as failed.
 * Called by worker on generation error.
 * Also triggers quota refund.
 * 
 * @param generationId - UUID of the generation job
 * @param errorMessage - Error message
 * @param shouldRefund - Whether to refund quota (default: true)
 */
export async function failGeneration(
  generationId: string,
  errorMessage: string,
  shouldRefund: boolean = true
): Promise<void> {
  const supabase = createClient()

  // Update job status
  const { error: updateError } = await supabase
    .from('shared_auto_stickers')
    .update({
      status: 'failed',
      last_error: errorMessage,
      completed_at: new Date().toISOString(),
      locked_at: null,
      lock_owner: null,
    })
    .eq('id', generationId)

  if (updateError) {
    console.error('Error failing generation:', updateError)
  }

  // Refund quota if requested
  if (shouldRefund) {
    const { error: refundError } = await supabase
      .from('explain_requests')
      .update({
        status: 'refunded',
        refund_reason: errorMessage,
        refunded_at: new Date().toISOString(),
      })
      .eq('request_id', generationId)

    if (refundError) {
      console.error('Error refunding quota:', refundError)
    }
  }
}

/**
 * UPSERT canonical document record.
 * Creates or updates the global PDF registry entry.
 * 
 * @param pdfHash - SHA-256 hash of PDF binary content
 * @param totalPages - Total number of pages in PDF
 * @param metadata - Optional metadata object
 */
export async function upsertCanonicalDocument(
  pdfHash: string,
  totalPages?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.from('canonical_documents').upsert(
    {
      pdf_hash: pdfHash,
      total_pages: totalPages,
      metadata,
      last_accessed_at: new Date().toISOString(),
      last_reference_at: new Date().toISOString(),
    },
    {
      onConflict: 'pdf_hash',
    }
  )

  if (error) {
    console.error('Error upserting canonical document:', error)
    throw error
  }
}

/**
 * Add a reference edge from a file to a canonical document.
 * Uses UNIQUE constraint for idempotent operations.
 * Triggers automatic reference_count increment.
 * 
 * @param pdfHash - SHA-256 hash of PDF binary content
 * @param fileId - UUID of the file
 */
export async function addCanonicalRef(pdfHash: string, fileId: string): Promise<void> {
  const supabase = createClient()

  // INSERT with ON CONFLICT DO NOTHING for idempotency
  // The trigger will increment reference_count
  const { error } = await supabase.from('canonical_document_refs').upsert(
    {
      pdf_hash: pdfHash,
      ref_type: 'file',
      ref_id: fileId,
    },
    {
      onConflict: 'ref_type,ref_id',
      ignoreDuplicates: true,
    }
  )

  if (error && error.code !== '23505') {
    // Ignore unique constraint violations (expected for idempotency)
    console.error('Error adding canonical ref:', error)
    throw error
  }
}

/**
 * Remove a reference edge from a file to a canonical document.
 * Triggers automatic reference_count decrement.
 * 
 * @param fileId - UUID of the file
 */
export async function removeCanonicalRef(fileId: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('canonical_document_refs')
    .delete()
    .eq('ref_type', 'file')
    .eq('ref_id', fileId)

  if (error) {
    console.error('Error removing canonical ref:', error)
    throw error
  }
}

/**
 * Record a latency sample for monitoring.
 * 
 * @param params - Latency sample parameters
 */
export async function recordLatencySample(params: {
  pdfHash?: string
  page?: number
  locale?: StickerLocale
  effectiveMode?: EffectiveMode
  latencyMs: number
  imagesCount?: number
  chunks?: number
  cacheHit?: boolean
}): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.from('sticker_latency_samples').insert({
    pdf_hash: params.pdfHash,
    page: params.page,
    locale: params.locale,
    effective_mode: params.effectiveMode,
    latency_ms: params.latencyMs,
    images_count: params.imagesCount ?? 0,
    chunks: params.chunks ?? 0,
    cache_hit: params.cacheHit ?? false,
  })

  if (error) {
    // Don't throw - latency recording is non-critical
    console.error('Error recording latency sample:', error)
  }
}
