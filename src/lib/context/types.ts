/**
 * Shared types and constants for context library.
 * This file contains only types and constants, no server-side code.
 * Safe to import from both client and server components.
 */

/**
 * Current extraction algorithm version for backfill tracking.
 * Bump this when:
 * - Extraction prompt template changes
 * - Entry structure changes
 * - Quality scoring logic changes
 *
 * History:
 * - 1: Initial extraction algorithm
 */
export const EXTRACTION_VERSION = 1

/**
 * Batch configuration for word-based extraction
 */
export const BATCH_CONFIG = {
  /** Target words per extraction batch */
  targetWordsPerBatch: 4000,
  /** Minimum words per batch (sparse PDFs like slides) */
  minWordsPerBatch: 2000,
  /** Maximum words per batch (dense PDFs like textbooks) */
  maxWordsPerBatch: 6000,
  /** Sample pages for word density estimation */
  samplePages: 10,
} as const

/**
 * Context retrieval configuration
 */
export const RETRIEVAL_CONFIG = {
  /** Maximum tokens for context injection */
  maxTokens: 2000,
  /** Maximum entries to retrieve */
  maxEntries: 30,
  /** Minimum quality score for retrieval */
  minQualityScore: 0.7,
} as const

/**
 * Storage limits for cost control
 */
export const STORAGE_LIMITS = {
  /** Maximum storage per user in bytes (5GB) */
  maxStoragePerUser: 5 * 1024 * 1024 * 1024,
  /** Maximum files per course */
  maxFilesPerCourse: 50,
  /** Maximum file size in bytes (100MB) */
  maxFileSize: 100 * 1024 * 1024,
  /** Maximum pages per file */
  maxPagesPerFile: 200,
  /** Maximum extractions per user per month */
  maxExtractionsPerUserPerMonth: 20,
} as const

/**
 * Job queue configuration
 */
export const JOB_CONFIG = {
  /** Maximum concurrent extraction jobs globally */
  maxConcurrentGlobal: 10,
  /** Maximum concurrent jobs per user */
  maxConcurrentPerUser: 2,
  /** Maximum retry attempts */
  maxRetries: 3,
  /** Retry delays in milliseconds (exponential backoff) */
  retryDelaysMs: [60_000, 120_000, 240_000] as const, // 1min, 2min, 4min
  /** Lock timeout in minutes */
  lockTimeoutMinutes: 5,
} as const

/**
 * Type of context entry
 */
export type ContextEntryType =
  | 'definition'
  | 'formula'
  | 'theorem'
  | 'concept'
  | 'principle'

/**
 * Context extraction job status
 */
export type ContextJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * A single context entry extracted from a PDF
 */
export interface ContextEntry {
  id: string
  pdfHash: string
  type: ContextEntryType
  title: string
  content: string
  sourcePage: number
  keywords: string[]
  qualityScore: number
  language: string
  extractionVersion: number
  createdAt: string
}

/**
 * Context extraction job
 */
export interface ExtractionJob {
  id: string
  pdfHash: string
  fileId: string
  userId: string
  status: ContextJobStatus
  totalPages: number
  totalWords: number
  processedWords: number
  processedPages: number
  currentBatch: number
  totalBatches: number
  extractionVersion: number
  retryCount: number
  errorMessage?: string
  lastErrorAt?: string
  lockedAt?: string
  lockOwner?: string
  runAfter: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

/**
 * User context scope - maps users to accessible context
 */
export interface UserContextScope {
  id: string
  userId: string
  courseId: string
  fileId: string
  pdfHash: string
  createdAt: string
}

/**
 * User extraction quota
 */
export interface ExtractionQuota {
  userId: string
  monthYear: string
  extractionsUsed: number
  extractionsLimit: number
  updatedAt: string
}

/**
 * Result of checking extraction quota
 */
export interface QuotaCheckResult {
  allowed: boolean
  remaining: number
  resetDate: string
}

/**
 * Batch strategy for extraction
 */
export interface BatchStrategy {
  wordsPerBatch: number
  totalBatches: number
  estimatedTotalWords: number
  avgWordsPerPage: number
}

/**
 * Result of cache lookup for context
 */
export interface ContextCacheLookupResult {
  status: 'ready' | 'processing' | 'not_found'
  entriesCount?: number
  jobId?: string
  progress?: {
    processedPages: number
    totalPages: number
    currentBatch: number
    totalBatches: number
  }
}

/**
 * Context retrieval result
 */
export interface ContextRetrievalResult {
  entries: ContextEntry[]
  totalTokens: number
  retrievalTimeMs: number
}

/**
 * Priority scores for context retrieval
 */
export const PRIORITY_SCORES = {
  /** Bonus for entries from current PDF */
  currentPdf: 100,
  /** Bonus for entries from same course */
  sameCourse: 50,
  /** Bonus by entry type */
  byType: {
    definition: 20,
    formula: 15,
    theorem: 10,
    principle: 10,
    concept: 5,
  },
} as const

/**
 * Raw extraction response from OpenAI
 */
export interface ExtractionResponse {
  entries: Array<{
    type: ContextEntryType
    title: string
    content: string
    keywords: string[]
    quality_score: number
  }>
}

/**
 * Parameters for context retrieval
 */
export interface ContextRetrievalParams {
  userId: string
  courseId: string
  fileId: string
  currentPage: number
  query?: string // For Q&A mode
}

/**
 * Extraction trigger result
 */
export interface ExtractionTriggerResult {
  cached: boolean
  jobId?: string
  entriesCount?: number
}

/**
 * Error codes for context library operations
 */
export const CONTEXT_ERROR_CODES = {
  EXTRACTION_IN_PROGRESS: 'EXTRACTION_IN_PROGRESS',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  CONTEXT_RETRIEVAL_ERROR: 'CONTEXT_RETRIEVAL_ERROR',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  FILE_SIZE_EXCEEDED: 'FILE_SIZE_EXCEEDED',
  PAGE_COUNT_EXCEEDED: 'PAGE_COUNT_EXCEEDED',
  COURSE_FILE_LIMIT: 'COURSE_FILE_LIMIT',
  EXTRACTION_QUOTA_EXCEEDED: 'EXTRACTION_QUOTA_EXCEEDED',
} as const

export type ContextErrorCode = keyof typeof CONTEXT_ERROR_CODES
