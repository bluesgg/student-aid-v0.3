/**
 * Storage limit validation for the context library.
 * Enforces limits on file size, page count, files per course, and user storage quota.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { STORAGE_LIMITS, formatFileSize } from './index'

/**
 * Result of storage limit validation
 */
export interface StorageLimitValidation {
  valid: boolean
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

/**
 * Validate file size against limit
 */
export function validateFileSize(fileSize: number): StorageLimitValidation {
  if (fileSize > STORAGE_LIMITS.maxFileSize) {
    return {
      valid: false,
      error: {
        code: 'FILE_SIZE_EXCEEDED',
        message: `File exceeds maximum size of ${formatFileSize(STORAGE_LIMITS.maxFileSize)}`,
        details: {
          actualSize: fileSize,
          maxSize: STORAGE_LIMITS.maxFileSize,
          actualSizeFormatted: formatFileSize(fileSize),
          maxSizeFormatted: formatFileSize(STORAGE_LIMITS.maxFileSize),
        },
      },
    }
  }
  return { valid: true }
}

/**
 * Validate page count against limit
 */
export function validatePageCount(pageCount: number): StorageLimitValidation {
  if (pageCount > STORAGE_LIMITS.maxPagesPerFile) {
    return {
      valid: false,
      error: {
        code: 'PAGE_COUNT_EXCEEDED',
        message: `PDF exceeds maximum of ${STORAGE_LIMITS.maxPagesPerFile} pages`,
        details: {
          actualPages: pageCount,
          maxPages: STORAGE_LIMITS.maxPagesPerFile,
        },
      },
    }
  }
  return { valid: true }
}

/**
 * Validate files per course limit
 */
export async function validateCourseFileCount(
  courseId: string
): Promise<StorageLimitValidation> {
  try {
    const supabase = createAdminClient()

    const { count, error } = await supabase
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)

    if (error) {
      console.error('Error checking course file count:', error)
      // Non-fatal: allow upload if check fails
      return { valid: true }
    }

    const fileCount = count || 0
    if (fileCount >= STORAGE_LIMITS.maxFilesPerCourse) {
      return {
        valid: false,
        error: {
          code: 'COURSE_FILE_LIMIT',
          message: `Course has reached the maximum of ${STORAGE_LIMITS.maxFilesPerCourse} files`,
          details: {
            currentCount: fileCount,
            maxFiles: STORAGE_LIMITS.maxFilesPerCourse,
          },
        },
      }
    }

    return { valid: true }
  } catch (error) {
    console.error('Error validating course file count:', error)
    // Non-fatal: allow upload if check fails
    return { valid: true }
  }
}

/**
 * Validate user storage quota
 */
export async function validateUserStorageQuota(
  userId: string,
  newFileSize: number
): Promise<StorageLimitValidation> {
  try {
    const supabase = createAdminClient()

    // Calculate current storage usage
    const { data: files, error } = await supabase
      .from('files')
      .select('storage_key')
      .eq('user_id', userId)

    if (error) {
      console.error('Error checking user storage:', error)
      // Non-fatal: allow upload if check fails
      return { valid: true }
    }

    // Get actual storage usage from Supabase Storage
    // For simplicity, we estimate based on file count and average size
    // A more accurate implementation would query storage bucket sizes
    const estimatedCurrentUsage = (files?.length || 0) * 5 * 1024 * 1024 // Assume 5MB avg

    const projectedUsage = estimatedCurrentUsage + newFileSize

    if (projectedUsage > STORAGE_LIMITS.maxStoragePerUser) {
      return {
        valid: false,
        error: {
          code: 'STORAGE_QUOTA_EXCEEDED',
          message: `Upload would exceed your storage quota of ${formatFileSize(STORAGE_LIMITS.maxStoragePerUser)}`,
          details: {
            currentUsage: estimatedCurrentUsage,
            newFileSize,
            projectedUsage,
            maxStorage: STORAGE_LIMITS.maxStoragePerUser,
            currentUsageFormatted: formatFileSize(estimatedCurrentUsage),
            maxStorageFormatted: formatFileSize(STORAGE_LIMITS.maxStoragePerUser),
          },
        },
      }
    }

    return { valid: true }
  } catch (error) {
    console.error('Error validating user storage quota:', error)
    // Non-fatal: allow upload if check fails
    return { valid: true }
  }
}

/**
 * Validate all storage limits for a file upload
 */
export async function validateStorageLimits(params: {
  fileSize: number
  pageCount: number
  courseId: string
  userId: string
}): Promise<StorageLimitValidation> {
  const { fileSize, pageCount, courseId, userId } = params

  // Check file size
  const fileSizeValidation = validateFileSize(fileSize)
  if (!fileSizeValidation.valid) {
    return fileSizeValidation
  }

  // Check page count
  const pageCountValidation = validatePageCount(pageCount)
  if (!pageCountValidation.valid) {
    return pageCountValidation
  }

  // Check course file limit
  const courseFileValidation = await validateCourseFileCount(courseId)
  if (!courseFileValidation.valid) {
    return courseFileValidation
  }

  // Check user storage quota
  const storageQuotaValidation = await validateUserStorageQuota(userId, fileSize)
  if (!storageQuotaValidation.valid) {
    return storageQuotaValidation
  }

  return { valid: true }
}
