/**
 * Context extraction trigger functions.
 * Handles triggering extraction when a PDF is first opened.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { extractPdfInfo, extractPageText } from '@/lib/pdf/extract'
import {
  EXTRACTION_VERSION,
  BATCH_CONFIG,
  type ExtractionTriggerResult,
  type QuotaCheckResult,
} from './types'
import { estimateWordCount, calculateBatchStrategy, getCurrentMonthYear } from './utils'
import { recordMetric } from './metrics'

/**
 * Check if context already exists for a PDF hash
 */
export async function checkContextExists(pdfHash: string): Promise<{
  exists: boolean
  entriesCount: number
}> {
  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('pdf_context_entries')
    .select('id', { count: 'exact', head: true })
    .eq('pdf_hash', pdfHash)

  if (error) {
    console.error('[Context] Error checking context existence:', error)
    return { exists: false, entriesCount: 0 }
  }

  return {
    exists: (count || 0) > 0,
    entriesCount: count || 0,
  }
}

/**
 * Check if an extraction job exists for a PDF hash
 */
export async function checkExtractionJobExists(pdfHash: string): Promise<{
  exists: boolean
  jobId?: string
  status?: string
}> {
  const supabase = createAdminClient()

  const { data: job, error } = await supabase
    .from('context_extraction_jobs')
    .select('id, status')
    .eq('pdf_hash', pdfHash)
    .in('status', ['pending', 'processing'])
    .single()

  if (error || !job) {
    return { exists: false }
  }

  return {
    exists: true,
    jobId: job.id,
    status: job.status,
  }
}

/**
 * Check user's monthly extraction quota
 */
export async function checkExtractionQuota(userId: string): Promise<QuotaCheckResult> {
  const supabase = createAdminClient()
  const currentMonth = getCurrentMonthYear()

  // Get or create quota record
  const { data: quota, error } = await supabase
    .from('user_extraction_quota')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !quota) {
    // No quota record - user has full quota
    return {
      allowed: true,
      remaining: 20,
      resetDate: getNextMonthFirstDay(),
    }
  }

  // Check if quota is for current month
  if (quota.month_year !== currentMonth) {
    // Quota is from previous month - reset
    return {
      allowed: true,
      remaining: quota.extractions_limit,
      resetDate: getNextMonthFirstDay(),
    }
  }

  const remaining = quota.extractions_limit - quota.extractions_used

  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    resetDate: getNextMonthFirstDay(),
  }
}

/**
 * Get first day of next month as ISO string
 */
function getNextMonthFirstDay(): string {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return nextMonth.toISOString().split('T')[0]
}

/**
 * Create user context scope association
 */
export async function createUserContextScope(
  userId: string,
  courseId: string,
  fileId: string,
  pdfHash: string
): Promise<void> {
  const supabase = createAdminClient()

  await supabase.from('user_context_scope').upsert(
    {
      user_id: userId,
      course_id: courseId,
      file_id: fileId,
      pdf_hash: pdfHash,
    },
    { onConflict: 'user_id,file_id' }
  )
}

/**
 * Increment user's extraction quota usage
 */
async function incrementExtractionQuota(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const currentMonth = getCurrentMonthYear()

  // Use upsert with conditional increment
  const { data, error } = await supabase.rpc('increment_extraction_quota', {
    p_user_id: userId,
  })

  if (error) {
    console.error('[Context] Error incrementing quota:', error)
    // Fall back to manual insert/update
    const { error: upsertError } = await supabase.from('user_extraction_quota').upsert(
      {
        user_id: userId,
        month_year: currentMonth,
        extractions_used: 1,
        extractions_limit: 20,
      },
      { onConflict: 'user_id' }
    )

    return !upsertError
  }

  return data === true
}

/**
 * Trigger context extraction for a PDF.
 * Called when a PDF is first opened in P5.
 */
export async function triggerContextExtraction(params: {
  fileId: string
  userId: string
  courseId: string
  pdfHash: string
  totalPages: number
  pdfBuffer?: Buffer
}): Promise<ExtractionTriggerResult> {
  const { fileId, userId, courseId, pdfHash, totalPages, pdfBuffer } = params
  const supabase = createAdminClient()

  // Step 1: Check if context already exists (cross-user cache hit)
  const { exists: contextExists, entriesCount } = await checkContextExists(pdfHash)

  if (contextExists) {
    // Context exists - just create user association (cache hit)
    await createUserContextScope(userId, courseId, fileId, pdfHash)

    // Record cache hit metric
    recordMetric('cache_hits').catch(() => {})

    return {
      cached: true,
      entriesCount,
    }
  }

  // Step 2: Check if extraction job already exists
  const { exists: jobExists, jobId } = await checkExtractionJobExists(pdfHash)

  if (jobExists) {
    // Job already running - create user association and return job ID
    await createUserContextScope(userId, courseId, fileId, pdfHash)

    return {
      cached: false,
      jobId,
    }
  }

  // Step 3: Check user quota
  const quotaCheck = await checkExtractionQuota(userId)

  if (!quotaCheck.allowed) {
    // Quota exceeded - still create association for existing context access
    await createUserContextScope(userId, courseId, fileId, pdfHash)

    return {
      cached: false,
      // No job created due to quota
    }
  }

  // Step 4: Estimate total words for batch planning
  let estimatedTotalWords = 0
  let totalBatches = 1

  if (pdfBuffer) {
    try {
      const samplePages = Math.min(BATCH_CONFIG.samplePages, totalPages)
      let sampleWordCount = 0

      for (let i = 0; i < samplePages; i++) {
        const { text } = await extractPageText(pdfBuffer, i + 1)
        sampleWordCount += estimateWordCount(text)
      }

      const strategy = calculateBatchStrategy(totalPages, sampleWordCount, samplePages)
      estimatedTotalWords = strategy.estimatedTotalWords
      totalBatches = strategy.totalBatches
    } catch (error) {
      console.error('[Context] Error estimating words:', error)
      // Fall back to page-based estimate
      estimatedTotalWords = totalPages * 500 // Assume 500 words per page
      totalBatches = Math.ceil(totalPages / 10)
    }
  } else {
    // No buffer - use rough estimate
    estimatedTotalWords = totalPages * 500
    totalBatches = Math.ceil(totalPages / 10)
  }

  // Step 5: Create extraction job
  const { data: job, error: jobError } = await supabase
    .from('context_extraction_jobs')
    .insert({
      pdf_hash: pdfHash,
      file_id: fileId,
      user_id: userId,
      status: 'pending',
      total_pages: totalPages,
      total_words: estimatedTotalWords,
      total_batches: totalBatches,
      extraction_version: EXTRACTION_VERSION,
    })
    .select('id')
    .single()

  if (jobError) {
    // Check if it's a duplicate key error (another job was created)
    if (jobError.code === '23505') {
      // Unique violation - job already exists
      const { jobId: existingJobId } = await checkExtractionJobExists(pdfHash)
      await createUserContextScope(userId, courseId, fileId, pdfHash)

      return {
        cached: false,
        jobId: existingJobId,
      }
    }

    console.error('[Context] Error creating extraction job:', jobError)
    throw new Error('Failed to create extraction job')
  }

  // Step 6: Increment quota
  await incrementExtractionQuota(userId)

  // Step 7: Create user context scope
  await createUserContextScope(userId, courseId, fileId, pdfHash)

  return {
    cached: false,
    jobId: job.id,
  }
}

/**
 * Get extraction job status for a file
 */
export async function getExtractionStatus(fileId: string): Promise<{
  status: 'ready' | 'processing' | 'pending' | 'failed' | 'not_found'
  progress?: {
    processedPages: number
    totalPages: number
    currentBatch: number
    totalBatches: number
  }
  entriesCount?: number
  error?: string
}> {
  const supabase = createAdminClient()

  // Get file to get pdf_hash
  const { data: file, error: fileError } = await supabase
    .from('files')
    .select('content_hash')
    .eq('id', fileId)
    .single()

  if (fileError || !file?.content_hash) {
    return { status: 'not_found' }
  }

  const pdfHash = file.content_hash

  // Check if context exists
  const { exists, entriesCount } = await checkContextExists(pdfHash)

  if (exists) {
    return {
      status: 'ready',
      entriesCount,
    }
  }

  // Check extraction job
  const { data: job, error: jobError } = await supabase
    .from('context_extraction_jobs')
    .select('*')
    .eq('pdf_hash', pdfHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (jobError || !job) {
    return { status: 'not_found' }
  }

  if (job.status === 'completed') {
    // Job completed but no entries found
    return {
      status: 'ready',
      entriesCount: 0,
    }
  }

  if (job.status === 'failed') {
    return {
      status: 'failed',
      error: job.error_message,
    }
  }

  return {
    status: job.status as 'processing' | 'pending',
    progress: {
      processedPages: job.processed_pages,
      totalPages: job.total_pages,
      currentBatch: job.current_batch,
      totalBatches: job.total_batches,
    },
  }
}
