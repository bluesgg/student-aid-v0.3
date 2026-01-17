/**
 * Typed database query helpers for Supabase.
 * Provides type-safe access to database tables.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ==================== Type Definitions ====================

export type FileType = 'Lecture' | 'Homework' | 'Exam' | 'Other'
export type StickerType = 'auto' | 'manual'
export type QuotaBucket =
  | 'learningInteractions'
  | 'documentSummary'
  | 'sectionSummary'
  | 'courseSummary'
  | 'autoExplain'
export type SummaryType = 'document' | 'section' | 'course'
export type Locale = 'en' | 'zh'
export type ImageExtractionStatus = 'pending' | 'partial' | 'complete' | 'failed'
export type ImageDetectionMethod = 'ops' | 'manual'
export type PdfType = 'ppt' | 'textbook'
export type ImageFeedbackType = 'wrong_boundary' | 'missed_image' | 'false_positive'

// ==================== Table Row Types ====================

export interface Course {
  id: string
  user_id: string
  name: string
  school: string
  term: string
  file_count: number
  last_visited_at: string | null
  created_at: string
  updated_at: string
}

export interface File {
  id: string
  course_id: string
  user_id: string
  name: string
  type: FileType
  page_count: number
  is_scanned: boolean
  pdf_content_hash: string | null
  storage_key: string
  last_read_page: number
  image_extraction_status: ImageExtractionStatus
  image_extraction_progress: number
  uploaded_at: string
  updated_at: string
}

export interface Sticker {
  id: string
  user_id: string
  course_id: string
  file_id: string
  type: StickerType
  page: number
  anchor_text: string
  anchor_rect: { x: number; y: number; width: number; height: number } | null
  parent_id: string | null
  content_markdown: string
  folded: boolean
  depth: number
  created_at: string
}

export interface Quota {
  id: string
  user_id: string
  bucket: QuotaBucket
  used: number
  limit: number
  reset_at: string
  created_at: string
  updated_at: string
}

export interface QAInteraction {
  id: string
  user_id: string
  course_id: string
  file_id: string
  question: string
  answer_markdown: string
  references: { page: number; snippet: string }[]
  created_at: string
}

export interface Summary {
  id: string
  user_id: string
  course_id: string
  file_id: string | null
  type: SummaryType
  page_range_start: number | null
  page_range_end: number | null
  content_markdown: string
  created_at: string
}

export interface AIUsageLog {
  id: string
  request_id: string | null
  user_id: string | null
  course_id: string | null
  file_id: string | null
  operation_type: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd_approx: number
  latency_ms: number
  success: boolean
  error_code: string | null
  created_at: string
}

export interface UserPreferences {
  user_id: string
  ui_locale: Locale
  explain_locale: Locale
  created_at: string
  updated_at: string
}

export interface DetectedImage {
  id: string
  pdf_hash: string
  page: number
  image_index: number
  rect: { x: number; y: number; width: number; height: number }
  detection_method: ImageDetectionMethod
  pdf_type: PdfType | null
  created_at: string
}

export interface ImageFeedback {
  id: string
  detected_image_id: string
  user_id: string
  feedback_type: ImageFeedbackType
  correct_rect: { x: number; y: number; width: number; height: number } | null
  created_at: string
}

// ==================== Database Type ====================

export interface Database {
  public: {
    Tables: {
      courses: {
        Row: Course
        Insert: Omit<Course, 'id' | 'created_at' | 'updated_at' | 'file_count'>
        Update: Partial<Omit<Course, 'id' | 'user_id' | 'created_at'>>
      }
      files: {
        Row: File
        Insert: Omit<File, 'id' | 'uploaded_at' | 'updated_at' | 'last_read_page' | 'image_extraction_status' | 'image_extraction_progress'>
        Update: Partial<Omit<File, 'id' | 'user_id' | 'course_id' | 'uploaded_at'>>
      }
      stickers: {
        Row: Sticker
        Insert: Omit<Sticker, 'id' | 'created_at'>
        Update: Partial<Omit<Sticker, 'id' | 'user_id' | 'created_at'>>
      }
      quotas: {
        Row: Quota
        Insert: Omit<Quota, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Quota, 'id' | 'user_id' | 'bucket' | 'created_at'>>
      }
      qa_interactions: {
        Row: QAInteraction
        Insert: Omit<QAInteraction, 'id' | 'created_at'>
        Update: never
      }
      summaries: {
        Row: Summary
        Insert: Omit<Summary, 'id' | 'created_at'>
        Update: never
      }
      ai_usage_logs: {
        Row: AIUsageLog
        Insert: Omit<AIUsageLog, 'id' | 'created_at'>
        Update: never
      }
      user_preferences: {
        Row: UserPreferences
        Insert: Omit<UserPreferences, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserPreferences, 'user_id' | 'created_at'>>
      }
      detected_images: {
        Row: DetectedImage
        Insert: Omit<DetectedImage, 'id' | 'created_at'>
        Update: never
      }
      image_feedback: {
        Row: ImageFeedback
        Insert: Omit<ImageFeedback, 'id' | 'created_at'>
        Update: never
      }
    }
  }
}

// ==================== Query Helpers ====================

/**
 * Get typed table accessor
 */
export function getTable<T extends keyof Database['public']['Tables']>(
  supabase: SupabaseClient,
  table: T
) {
  return supabase.from(table)
}

/**
 * Helper to handle Supabase query results
 */
export async function handleQueryResult<T>(
  query: Promise<{ data: T | null; error: Error | null }>
): Promise<T> {
  const { data, error } = await query
  if (error) throw error
  if (!data) throw new Error('No data returned')
  return data
}

/**
 * Helper to handle Supabase query results that may be empty
 */
export async function handleQueryResultNullable<T>(
  query: Promise<{ data: T | null; error: Error | null }>
): Promise<T | null> {
  const { data, error } = await query
  if (error) throw error
  return data
}
