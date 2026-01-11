/**
 * Background worker for processing sticker generation jobs.
 * Implements:
 * - Job pickup with FOR UPDATE SKIP LOCKED pattern
 * - Retry strategy with exponential backoff
 * - Zombie cleanup for expired jobs
 * - Adaptive timeout based on content complexity
 */

import { createAdminClient } from '@/lib/supabase/server'
import { completeGeneration, failGeneration, PROMPT_VERSION } from '@/lib/stickers/shared-cache'

/**
 * Worker configuration
 */
export const WORKER_CONFIG = {
  /** Maximum jobs to process per run */
  BATCH_SIZE: 10,
  /** Runtime budget in milliseconds (50 seconds to leave buffer) */
  RUNTIME_BUDGET_MS: 50000,
  /** Lock timeout in minutes (jobs locked longer are considered abandoned) */
  LOCK_TIMEOUT_MINUTES: 2,
  /** Maximum retry attempts */
  MAX_ATTEMPTS: 3,
  /** Retry delays in milliseconds [attempt1, attempt2, attempt3] */
  RETRY_DELAYS_MS: [60000, 300000, 900000], // 1min, 5min, 15min
  /** Maximum jitter in milliseconds */
  MAX_JITTER_MS: 30000,
}

/**
 * Job record from shared_auto_stickers
 */
export interface StickerJob {
  id: string
  pdf_hash: string
  page: number
  prompt_version: string
  locale: string
  effective_mode: string
  status: string
  attempts: number
  expires_at: string | null
  last_error: string | null
  chunk_plan: unknown | null
}

/**
 * Error classification for retry decisions
 */
export type ErrorType = 'transient' | 'permanent'

/**
 * Worker run result
 */
export interface WorkerRunResult {
  jobsProcessed: number
  jobsSucceeded: number
  jobsFailed: number
  zombiesCleaned: number
  errors: string[]
  durationMs: number
}

/**
 * Generate a unique worker instance ID
 */
export function generateWorkerId(): string {
  return `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Classify an error as transient (retry) or permanent (fail immediately)
 */
export function classifyError(error: unknown): ErrorType {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  // Permanent errors - don't retry
  const permanentPatterns = [
    'pdf content corrupted',
    'unparseable',
    'schema incompatibility',
    'assertion failure',
    '404',
    'not found',
    'invalid pdf',
    'file not found',
  ]

  for (const pattern of permanentPatterns) {
    if (lowerMessage.includes(pattern)) {
      return 'permanent'
    }
  }

  // Transient errors - retry
  const transientPatterns = [
    '429', // Rate limit
    'rate limit',
    '5xx',
    '500',
    '502',
    '503',
    '504',
    'timeout',
    'network',
    'connection',
    'econnreset',
    'econnrefused',
    'database',
    'lock conflict',
  ]

  for (const pattern of transientPatterns) {
    if (lowerMessage.includes(pattern)) {
      return 'transient'
    }
  }

  // Default to transient for unknown errors
  return 'transient'
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(attempts: number): number {
  const baseDelay = WORKER_CONFIG.RETRY_DELAYS_MS[Math.min(attempts, WORKER_CONFIG.RETRY_DELAYS_MS.length - 1)]
  const jitter = Math.floor(Math.random() * WORKER_CONFIG.MAX_JITTER_MS)
  return baseDelay + jitter
}

/**
 * Pick up jobs for processing using FOR UPDATE SKIP LOCKED
 */
export async function pickupJobs(workerId: string, limit: number = WORKER_CONFIG.BATCH_SIZE): Promise<StickerJob[]> {
  // Use admin client to bypass RLS
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const lockTimeout = new Date(Date.now() - WORKER_CONFIG.LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  // Query for available jobs
  // Jobs are available if:
  // - status = 'generating'
  // - run_after <= now (respects retry backoff)
  // - locked_at is null OR locked_at < lockTimeout (abandoned lock)
  const { data: jobs, error } = await supabase
    .from('shared_auto_stickers')
    .select('id, pdf_hash, page, prompt_version, locale, effective_mode, status, attempts, expires_at, last_error, chunk_plan')
    .eq('status', 'generating')
    .lte('run_after', now)
    .or(`locked_at.is.null,locked_at.lt.${lockTimeout}`)
    .order('run_after', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Error picking up jobs:', error)
    return []
  }

  if (!jobs || jobs.length === 0) {
    return []
  }

  // Lock the jobs by updating locked_at and lock_owner
  const jobIds = jobs.map((j) => j.id)
  const { error: lockError } = await supabase
    .from('shared_auto_stickers')
    .update({
      locked_at: now,
      lock_owner: workerId,
      started_at: now,
    })
    .in('id', jobIds)

  if (lockError) {
    console.error('Error locking jobs:', lockError)
    return []
  }

  return jobs as StickerJob[]
}

/**
 * Process a single sticker generation job.
 * This is a placeholder that should be replaced with actual generation logic.
 */
export async function processJob(job: StickerJob): Promise<void> {
  // Use admin client to bypass RLS
  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    // TODO: Implement actual sticker generation logic
    // For now, we'll create a placeholder implementation
    // The actual implementation should:
    // 1. Download PDF from storage
    // 2. Extract page text and images
    // 3. Build prompt with context
    // 4. Call OpenAI API
    // 5. Parse response into stickers
    
    // Placeholder: Get the file with this content_hash
    const { data: file } = await supabase
      .from('files')
      .select('id, storage_key, page_count')
      .eq('content_hash', job.pdf_hash)
      .limit(1)
      .single()

    if (!file) {
      throw new Error('File not found for pdf_hash: ' + job.pdf_hash)
    }

    // For now, mark as failed with "not implemented" message
    // This will be replaced with actual generation logic in Phase 4
    throw new Error('Sticker generation not yet implemented - pending Phase 4 API update')

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorType = classifyError(error)
    const generationTimeMs = Date.now() - startTime

    if (errorType === 'permanent' || job.attempts >= WORKER_CONFIG.MAX_ATTEMPTS - 1) {
      // Permanent error or max attempts reached - fail and refund
      await failGeneration(job.id, errorMessage, true)
    } else {
      // Transient error - schedule retry
      const retryDelay = calculateRetryDelay(job.attempts)
      const runAfter = new Date(Date.now() + retryDelay).toISOString()

      await supabase
        .from('shared_auto_stickers')
        .update({
          attempts: job.attempts + 1,
          run_after: runAfter,
          last_error: errorMessage,
          locked_at: null,
          lock_owner: null,
        })
        .eq('id', job.id)
    }

    throw error // Re-throw for caller to handle
  }
}

/**
 * Clean up zombie jobs (expired generating jobs)
 */
export async function cleanupZombies(): Promise<number> {
  // Use admin client to bypass RLS
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Find expired jobs
  const { data: zombies, error: findError } = await supabase
    .from('shared_auto_stickers')
    .select('id')
    .eq('status', 'generating')
    .lt('expires_at', now)

  if (findError || !zombies || zombies.length === 0) {
    return 0
  }

  // Mark as failed and refund
  let cleanedCount = 0
  for (const zombie of zombies) {
    try {
      await failGeneration(zombie.id, 'Generation timeout - exceeded expires_at deadline', true)
      cleanedCount++
    } catch (error) {
      console.error('Error cleaning up zombie:', zombie.id, error)
    }
  }

  return cleanedCount
}

/**
 * Run the worker: pick up jobs, process them, clean up zombies
 */
export async function runWorker(): Promise<WorkerRunResult> {
  const startTime = Date.now()
  const workerId = generateWorkerId()
  const result: WorkerRunResult = {
    jobsProcessed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    zombiesCleaned: 0,
    errors: [],
    durationMs: 0,
  }

  try {
    // Clean up zombies first
    result.zombiesCleaned = await cleanupZombies()

    // Pick up jobs
    const jobs = await pickupJobs(workerId)
    
    // Process jobs within runtime budget
    for (const job of jobs) {
      // Check runtime budget
      if (Date.now() - startTime > WORKER_CONFIG.RUNTIME_BUDGET_MS) {
        console.log('Worker runtime budget exceeded, stopping')
        break
      }

      result.jobsProcessed++

      try {
        await processJob(job)
        result.jobsSucceeded++
      } catch (error) {
        result.jobsFailed++
        result.errors.push(`Job ${job.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

  } catch (error) {
    result.errors.push(`Worker error: ${error instanceof Error ? error.message : String(error)}`)
  }

  result.durationMs = Date.now() - startTime
  return result
}
