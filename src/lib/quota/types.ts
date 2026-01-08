/**
 * Quota bucket types and configuration.
 */

export type QuotaBucket =
  | 'learningInteractions'
  | 'documentSummary'
  | 'sectionSummary'
  | 'courseSummary'
  | 'autoExplain'

export interface QuotaInfo {
  used: number
  limit: number
  resetAt: string
}

export interface QuotaRecord {
  id: string
  user_id: string
  bucket: QuotaBucket
  used: number
  limit: number
  reset_at: string
  created_at: string
  updated_at: string
}

// Default quota limits
export const DEFAULT_QUOTA_LIMITS: Record<QuotaBucket, number> = {
  learningInteractions: 150,
  documentSummary: 100,
  sectionSummary: 65,
  courseSummary: 15,
  autoExplain: 300,
}

// Map API bucket names to database enum values
export const BUCKET_TO_DB: Record<QuotaBucket, string> = {
  learningInteractions: 'learningInteractions',
  documentSummary: 'documentSummary',
  sectionSummary: 'sectionSummary',
  courseSummary: 'courseSummary',
  autoExplain: 'autoExplain',
}
