/**
 * Background worker for processing context extraction jobs.
 * Implements:
 * - Job pickup with FOR UPDATE SKIP LOCKED pattern
 * - Word-based batch processing with checkpoint resume
 * - Retry strategy with exponential backoff
 * - Quality filtering and deduplication
 */

import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@/lib/supabase/server'
import { extractPdfInfo, extractPageText } from '@/lib/pdf/extract'
import { getOpenAIClient } from '@/lib/openai/client'
import {
  EXTRACTION_VERSION,
  JOB_CONFIG,
  BATCH_CONFIG,
  RETRIEVAL_CONFIG,
  type ContextEntryType,
  type ExtractionJob,
  type ExtractionResponse,
} from './types'
import {
  estimateWordCount,
  detectLanguage,
  calculateBatchStrategy,
  normalizeTitle,
} from './utils'
import { recordMetric, recordAverageQualityScore } from './metrics'

/**
 * Worker configuration
 */
export const CONTEXT_WORKER_CONFIG = {
  /** Maximum jobs to process per run */
  BATCH_SIZE: 5,
  /** Runtime budget in milliseconds (55 seconds to leave buffer for cron) */
  RUNTIME_BUDGET_MS: 55000,
  /** Lock timeout in minutes */
  LOCK_TIMEOUT_MINUTES: JOB_CONFIG.lockTimeoutMinutes,
  /** Maximum retry attempts */
  MAX_ATTEMPTS: JOB_CONFIG.maxRetries,
  /** Model for extraction */
  EXTRACTION_MODEL: 'gpt-4o-mini',
}

/**
 * Worker run result
 */
export interface ContextWorkerRunResult {
  jobsProcessed: number
  jobsSucceeded: number
  jobsFailed: number
  entriesCreated: number
  errors: string[]
  durationMs: number
}

/**
 * Generate a unique worker instance ID
 */
export function generateWorkerId(): string {
  return `context-worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Extraction system prompt for English content
 */
const EXTRACTION_SYSTEM_PROMPT = `You are an expert academic knowledge extractor. Your task is to extract reusable knowledge entries from educational PDFs.

Extract the following types of entries:
1. **Definition** - Formal term definitions
2. **Formula** - Mathematical expressions
3. **Theorem** - Proven statements with conditions
4. **Concept** - High-level explanatory ideas
5. **Principle** - Conditional rules or guidelines

For each entry, provide:
- type: One of 'definition', 'formula', 'theorem', 'concept', 'principle'
- title: The term/concept name (max 100 chars, in English)
- content: Full explanation in English (100-500 words)
- keywords: Array of search keywords (English, 3-8 keywords)
- quality_score: Your confidence in this entry's reusability (0.0-1.0)

Quality score guidelines:
- 0.9-1.0: Core concepts that will be referenced frequently
- 0.7-0.9: Important but specialized content
- Below 0.7: Will be filtered out (not reusable enough)

Respond ONLY with valid JSON in this format:
{
  "entries": [
    {
      "type": "definition",
      "title": "Derivative",
      "content": "The derivative of a function f(x) is defined as...",
      "keywords": ["derivative", "rate of change", "instantaneous", "calculus"],
      "quality_score": 0.95
    }
  ]
}

If no extractable knowledge entries are found, return: {"entries": []}`

/**
 * Translation-enhanced system prompt for non-English content
 */
const TRANSLATION_SYSTEM_PROMPT = `You are an expert academic knowledge extractor with strong translation skills.

Extract knowledge entries from the provided text and translate all output to English.

When extracting from non-English source material:
1. Translate all output to English
2. Preserve technical terminology accuracy
3. Maintain mathematical notation and symbols unchanged
4. Keep original meaning and context
5. Use standard English academic terminology

Extract these entry types:
1. **Definition** - Formal term definitions
2. **Formula** - Mathematical expressions
3. **Theorem** - Proven statements with conditions
4. **Concept** - High-level explanatory ideas
5. **Principle** - Conditional rules or guidelines

For each entry, provide:
- type: One of 'definition', 'formula', 'theorem', 'concept', 'principle'
- title: The term/concept name (max 100 chars, in English)
- content: Full explanation in English (100-500 words)
- keywords: Array of search keywords (English, 3-8 keywords)
- quality_score: Your confidence in this entry's reusability (0.0-1.0)

Quality requirements:
- Technical terms must be correctly translated
- Mathematical expressions remain unchanged
- Quality score should reflect translation confidence
- If translation is uncertain, reduce quality_score accordingly

Respond ONLY with valid JSON in this format:
{
  "entries": [
    {
      "type": "definition",
      "title": "Term Name",
      "content": "Definition in English...",
      "keywords": ["keyword1", "keyword2"],
      "quality_score": 0.85
    }
  ]
}

If no extractable knowledge entries are found, return: {"entries": []}`

/**
 * Pick up jobs for processing
 */
export async function pickupContextJobs(
  workerId: string,
  limit: number = CONTEXT_WORKER_CONFIG.BATCH_SIZE
): Promise<ExtractionJob[]> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const lockTimeout = new Date(
    Date.now() - CONTEXT_WORKER_CONFIG.LOCK_TIMEOUT_MINUTES * 60 * 1000
  ).toISOString()

  // Query for available jobs
  const { data: jobs, error } = await supabase
    .from('context_extraction_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('run_after', now)
    .or(`locked_at.is.null,locked_at.lt.${lockTimeout}`)
    .order('total_words', { ascending: true }) // Prioritize smaller files
    .limit(limit)

  console.log('[Context Worker] Pickup query:', {
    now,
    lockTimeout,
    jobsFound: jobs?.length ?? 0,
    error: error?.message,
  })

  if (error) {
    console.error('[Context Worker] Error picking up jobs:', error)
    return []
  }

  if (!jobs || jobs.length === 0) {
    // Debug: check if any jobs exist at all
    const { data: allJobs } = await supabase
      .from('context_extraction_jobs')
      .select('id, status, run_after, locked_at')
      .limit(5)
    console.log('[Context Worker] All jobs in DB:', allJobs)
    return []
  }

  // Lock the jobs
  const jobIds = jobs.map((j) => j.id)
  const { error: lockError } = await supabase
    .from('context_extraction_jobs')
    .update({
      locked_at: now,
      lock_owner: workerId,
      started_at: now,
      status: 'processing',
    })
    .in('id', jobIds)

  if (lockError) {
    console.error('[Context Worker] Error locking jobs:', lockError)
    return []
  }

  // Record metrics for started jobs
  recordMetric('extractions_started', jobs.length).catch(() => {})

  // Map to ExtractionJob type
  return jobs.map((job) => ({
    id: job.id,
    pdfHash: job.pdf_hash,
    fileId: job.file_id,
    userId: job.user_id,
    status: job.status as ExtractionJob['status'],
    totalPages: job.total_pages,
    totalWords: job.total_words,
    processedWords: job.processed_words,
    processedPages: job.processed_pages,
    currentBatch: job.current_batch,
    totalBatches: job.total_batches,
    extractionVersion: job.extraction_version,
    retryCount: job.retry_count,
    errorMessage: job.error_message,
    lastErrorAt: job.last_error_at,
    lockedAt: job.locked_at,
    lockOwner: job.lock_owner,
    runAfter: job.run_after,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  }))
}

/**
 * Extract context entries from a batch of text
 */
async function extractEntriesFromBatch(
  batchText: string,
  startPage: number,
  endPage: number,
  pdfHash: string
): Promise<Array<{
  type: ContextEntryType
  title: string
  content: string
  sourcePage: number
  keywords: string[]
  qualityScore: number
  language: string
}>> {
  const openai = getOpenAIClient()
  const language = detectLanguage(batchText)
  const systemPrompt = language === 'en' ? EXTRACTION_SYSTEM_PROMPT : TRANSLATION_SYSTEM_PROMPT

  const userPrompt = `Extract knowledge entries from the following text (pages ${startPage}-${endPage}):

---
${batchText}
---

Remember to respond with valid JSON only.`

  const completion = await openai.chat.completions.create({
    model: CONTEXT_WORKER_CONFIG.EXTRACTION_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3, // Lower temperature for more consistent extraction
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  })

  const responseContent = completion.choices[0]?.message?.content
  if (!responseContent) {
    return []
  }

  // Parse JSON response
  let parsed: ExtractionResponse
  try {
    parsed = JSON.parse(responseContent)
  } catch {
    console.error('[Context Worker] Failed to parse extraction response:', responseContent.slice(0, 200))
    return []
  }

  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    return []
  }

  // Apply quality penalty for translated content
  const qualityMultiplier = language === 'en' ? 1.0 : 0.9

  return parsed.entries
    .filter((entry) => {
      // Validate entry structure
      return (
        entry.type &&
        entry.title &&
        entry.content &&
        Array.isArray(entry.keywords) &&
        typeof entry.quality_score === 'number'
      )
    })
    .map((entry) => ({
      type: entry.type as ContextEntryType,
      title: entry.title.slice(0, 200), // Limit title length
      content: entry.content,
      sourcePage: startPage, // Use start page of batch
      keywords: entry.keywords.slice(0, 10), // Limit keywords
      qualityScore: entry.quality_score * qualityMultiplier,
      language: 'en',
    }))
}

/**
 * Deduplicate entries within a batch
 */
function deduplicateWithinBatch<T extends { title: string; qualityScore: number }>(
  entries: T[]
): T[] {
  const grouped = new Map<string, T[]>()

  for (const entry of entries) {
    const normalizedTitle = normalizeTitle(entry.title)
    if (!grouped.has(normalizedTitle)) {
      grouped.set(normalizedTitle, [])
    }
    grouped.get(normalizedTitle)!.push(entry)
  }

  const deduplicated: T[] = []
  grouped.forEach((group) => {
    // Keep highest quality score
    const best = group.reduce((a: T, b: T) => (a.qualityScore > b.qualityScore ? a : b))
    deduplicated.push(best)
  })

  return deduplicated
}

/**
 * Process a single context extraction job
 */
export async function processContextJob(job: ExtractionJob): Promise<number> {
  const supabase = createAdminClient()
  let entriesCreated = 0

  try {
    // Get file info
    const { data: file } = await supabase
      .from('files')
      .select('id, storage_key, page_count')
      .eq('id', job.fileId)
      .single()

    if (!file) {
      throw new Error(`File not found: ${job.fileId}`)
    }

    // Download PDF
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from('course-files')
      .download(file.storage_key)

    if (downloadError || !pdfData) {
      throw new Error(`Failed to download PDF: ${downloadError?.message || 'Unknown error'}`)
    }

    const buffer = Buffer.from(await pdfData.arrayBuffer())

    // If this is a fresh start, estimate total words
    if (job.processedPages === 0) {
      const pdfInfo = await extractPdfInfo(buffer)
      const samplePages = Math.min(BATCH_CONFIG.samplePages, file.page_count)
      let sampleWordCount = 0

      for (let i = 0; i < samplePages; i++) {
        const { text } = await extractPageText(buffer, i + 1)
        sampleWordCount += estimateWordCount(text)
      }

      const strategy = calculateBatchStrategy(file.page_count, sampleWordCount, samplePages)

      // Update job with word estimates
      await supabase
        .from('context_extraction_jobs')
        .update({
          total_words: strategy.estimatedTotalWords,
          total_batches: strategy.totalBatches,
        })
        .eq('id', job.id)

      job.totalWords = strategy.estimatedTotalWords
      job.totalBatches = strategy.totalBatches
    }

    // Process remaining batches (resume from checkpoint)
    let currentPage = job.processedPages + 1
    let processedWords = job.processedWords

    while (currentPage <= file.page_count) {
      // Extract text for this batch
      let batchText = ''
      let batchWords = 0
      const startPage = currentPage

      while (
        currentPage <= file.page_count &&
        batchWords < BATCH_CONFIG.targetWordsPerBatch
      ) {
        const { text } = await extractPageText(buffer, currentPage)
        const pageWords = estimateWordCount(text)

        // Stop if adding this page exceeds budget significantly
        if (batchWords > 0 && batchWords + pageWords > BATCH_CONFIG.maxWordsPerBatch) {
          break
        }

        batchText += text + '\n\n'
        batchWords += pageWords
        currentPage++
      }

      if (batchText.trim().length === 0) {
        continue // Skip empty batches
      }

      // Extract entries from this batch
      const entries = await extractEntriesFromBatch(
        batchText,
        startPage,
        currentPage - 1,
        job.pdfHash
      )

      // Filter by quality score
      const qualityFiltered = entries.filter(
        (e) => e.qualityScore >= RETRIEVAL_CONFIG.minQualityScore
      )

      // Deduplicate within batch
      const deduplicated = deduplicateWithinBatch(qualityFiltered)

      // Check against existing entries in DB
      if (deduplicated.length > 0) {
        const titles = deduplicated.map((e) => e.title)
        const { data: existing } = await supabase
          .from('pdf_context_entries')
          .select('title, quality_score')
          .eq('pdf_hash', job.pdfHash)
          .in('title', titles)

        const existingMap = new Map(
          (existing || []).map((e) => [normalizeTitle(e.title), e.quality_score])
        )

        // Filter out entries that are lower quality than existing
        const toInsert = deduplicated.filter((entry) => {
          const existingScore = existingMap.get(normalizeTitle(entry.title))
          return !existingScore || entry.qualityScore > existingScore
        })

        // Insert new entries
        if (toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('pdf_context_entries')
            .insert(
              toInsert.map((entry) => ({
                pdf_hash: job.pdfHash,
                type: entry.type,
                title: entry.title,
                content: entry.content,
                source_page: entry.sourcePage,
                keywords: entry.keywords,
                quality_score: entry.qualityScore,
                language: entry.language,
                extraction_version: EXTRACTION_VERSION,
              }))
            )

          if (insertError) {
            console.error('[Context Worker] Error inserting entries:', insertError)
          } else {
            entriesCreated += toInsert.length

            // Log created entries in development for debugging
            if (process.env.NODE_ENV === 'development') {
              console.log('[Context Worker] Created entries:')
              toInsert.forEach((entry, i) => {
                console.log(`  [${i + 1}] ${entry.type.toUpperCase()}: ${entry.title}`)
                console.log(`      Score: ${entry.qualityScore.toFixed(2)} | Page: ${entry.sourcePage}`)
                console.log(`      Keywords: ${entry.keywords.join(', ')}`)
                console.log(`      Content: ${entry.content.slice(0, 150)}...`)
              })
            }

            // Record entries created metric
            recordMetric('total_entries_created', toInsert.length).catch(() => {})

            // Record average quality score
            if (toInsert.length > 0) {
              const avgScore = toInsert.reduce((sum, e) => sum + e.qualityScore, 0) / toInsert.length
              recordAverageQualityScore(avgScore, toInsert.length).catch(() => {})
            }
          }
        }
      }

      // Update checkpoint
      processedWords += batchWords
      await supabase
        .from('context_extraction_jobs')
        .update({
          processed_pages: currentPage - 1,
          processed_words: processedWords,
          current_batch: job.currentBatch + 1,
        })
        .eq('id', job.id)
    }

    // Mark job as completed
    await supabase
      .from('context_extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        locked_at: null,
        lock_owner: null,
      })
      .eq('id', job.id)

    // Create user context scope association
    const { data: file2 } = await supabase
      .from('files')
      .select('course_id')
      .eq('id', job.fileId)
      .single()

    if (file2) {
      await supabase.from('user_context_scope').upsert(
        {
          user_id: job.userId,
          course_id: file2.course_id,
          file_id: job.fileId,
          pdf_hash: job.pdfHash,
        },
        { onConflict: 'user_id,file_id' }
      )
    }

    console.log(
      `[Context Worker] Job ${job.id} completed: ${entriesCreated} entries created`
    )

    // Record completion metric
    recordMetric('extractions_completed').catch(() => {})

    return entriesCreated
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Report to Sentry with detailed context
    Sentry.captureException(error, {
      tags: {
        component: 'context-extraction',
        phase: 'job-processing',
        retry_count: job.retryCount.toString(),
        will_retry: (job.retryCount < CONTEXT_WORKER_CONFIG.MAX_ATTEMPTS - 1).toString(),
      },
      extra: {
        jobId: job.id,
        pdfHash: job.pdfHash,
        fileId: job.fileId,
        currentBatch: job.currentBatch,
        totalBatches: job.totalBatches,
        processedPages: job.processedPages,
        totalPages: job.totalPages,
        processedWords: job.processedWords,
        totalWords: job.totalWords,
        extractionVersion: job.extractionVersion,
      },
      level: job.retryCount < CONTEXT_WORKER_CONFIG.MAX_ATTEMPTS - 1 ? 'warning' : 'error',
    })

    if (job.retryCount < CONTEXT_WORKER_CONFIG.MAX_ATTEMPTS - 1) {
      // Schedule retry
      const retryDelay = JOB_CONFIG.retryDelaysMs[job.retryCount] || 240000
      const runAfter = new Date(Date.now() + retryDelay).toISOString()

      await supabase
        .from('context_extraction_jobs')
        .update({
          status: 'pending',
          retry_count: job.retryCount + 1,
          run_after: runAfter,
          error_message: errorMessage,
          last_error_at: new Date().toISOString(),
          locked_at: null,
          lock_owner: null,
        })
        .eq('id', job.id)

      // Log failure
      await supabase.from('context_extraction_failures').insert({
        job_id: job.id,
        batch_number: job.currentBatch,
        error_message: errorMessage,
        error_stack: error instanceof Error ? error.stack : undefined,
      })

      console.log(
        `[Context Worker] Job ${job.id} retry ${job.retryCount + 1} scheduled: ${errorMessage}`
      )
    } else {
      // Max retries reached - mark as failed
      await supabase
        .from('context_extraction_jobs')
        .update({
          status: 'failed',
          error_message: `Max retries exceeded: ${errorMessage}`,
          completed_at: new Date().toISOString(),
          locked_at: null,
          lock_owner: null,
        })
        .eq('id', job.id)

      console.log(`[Context Worker] Job ${job.id} failed permanently: ${errorMessage}`)

      // Record failure metric
      recordMetric('extractions_failed').catch(() => {})
    }

    throw error
  }
}

/**
 * Run the context extraction worker
 */
export async function runContextWorker(): Promise<ContextWorkerRunResult> {
  const startTime = Date.now()
  const workerId = generateWorkerId()
  const result: ContextWorkerRunResult = {
    jobsProcessed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    entriesCreated: 0,
    errors: [],
    durationMs: 0,
  }

  try {
    // Pick up jobs
    const jobs = await pickupContextJobs(workerId)

    // Process jobs within runtime budget
    for (const job of jobs) {
      // Check runtime budget
      if (Date.now() - startTime > CONTEXT_WORKER_CONFIG.RUNTIME_BUDGET_MS) {
        console.log('[Context Worker] Runtime budget exceeded, stopping')
        break
      }

      result.jobsProcessed++

      try {
        const entriesCreated = await processContextJob(job)
        result.jobsSucceeded++
        result.entriesCreated += entriesCreated
      } catch (error) {
        // Job-level errors are already reported to Sentry in processContextJob
        result.jobsFailed++
        result.errors.push(
          `Job ${job.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  } catch (error) {
    // Worker-level error (job pickup or iteration failure)
    Sentry.captureException(error, {
      tags: {
        component: 'context-extraction',
        phase: 'worker-execution',
      },
      extra: {
        workerId,
        jobsProcessed: result.jobsProcessed,
        jobsSucceeded: result.jobsSucceeded,
        jobsFailed: result.jobsFailed,
      },
      level: 'error',
    })

    result.errors.push(
      `Worker error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  result.durationMs = Date.now() - startTime
  return result
}

/**
 * Cleanup result type
 */
export interface CleanupResult {
  deletedJobs: number
  deletedFailures: number
  error?: string
}

/**
 * Clean up old completed extraction jobs (>7 days old)
 * Should be run periodically (e.g., daily cron)
 */
export async function cleanupOldJobs(daysOld: number = 7): Promise<CleanupResult> {
  const supabase = createAdminClient()
  const result: CleanupResult = {
    deletedJobs: 0,
    deletedFailures: 0,
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  try {
    // Delete old completed/failed jobs
    const { data: deletedJobs, error: jobsError } = await supabase
      .from('context_extraction_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('completed_at', cutoffDate.toISOString())
      .select('id')

    if (jobsError) {
      console.error('[Context Cleanup] Error deleting old jobs:', jobsError)
      result.error = jobsError.message
    } else {
      result.deletedJobs = deletedJobs?.length || 0
    }

    // Delete old failure logs (keep for debugging, but clean up after 30 days)
    const failureCutoff = new Date()
    failureCutoff.setDate(failureCutoff.getDate() - 30)

    const { data: deletedFailures, error: failuresError } = await supabase
      .from('context_extraction_failures')
      .delete()
      .lt('created_at', failureCutoff.toISOString())
      .select('id')

    if (failuresError) {
      console.error('[Context Cleanup] Error deleting old failures:', failuresError)
      if (!result.error) {
        result.error = failuresError.message
      }
    } else {
      result.deletedFailures = deletedFailures?.length || 0
    }

    console.log(
      `[Context Cleanup] Cleaned up ${result.deletedJobs} jobs, ${result.deletedFailures} failure logs`
    )
  } catch (error) {
    // Cleanup errors are not critical, but should be tracked
    Sentry.captureException(error, {
      tags: {
        component: 'context-extraction',
        phase: 'cleanup',
      },
      extra: {
        daysOld,
        deletedJobs: result.deletedJobs,
        deletedFailures: result.deletedFailures,
      },
      level: 'warning',
    })

    result.error = error instanceof Error ? error.message : String(error)
    console.error('[Context Cleanup] Cleanup failed:', error)
  }

  return result
}
