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

export const DEFAULT_QUOTA_LIMITS: Record<QuotaBucket, number> = {
  learningInteractions: 150,
  documentSummary: 100,
  sectionSummary: 65,
  courseSummary: 15,
  autoExplain: 300,
}

export const ALL_QUOTA_BUCKETS: QuotaBucket[] = [
  'learningInteractions',
  'documentSummary',
  'sectionSummary',
  'courseSummary',
  'autoExplain',
]

export function calculateNextResetDate(from: Date = new Date()): Date {
  const resetDate = new Date(from)
  resetDate.setMonth(resetDate.getMonth() + 1)
  resetDate.setHours(0, 0, 0, 0)
  return resetDate
}
