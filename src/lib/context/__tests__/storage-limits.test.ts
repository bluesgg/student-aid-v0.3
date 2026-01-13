/**
 * Unit tests for storage limit validation.
 * Tests file size, page count, course file limits, and user quota enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateFileSize,
  validatePageCount,
  validateCourseFileCount,
  validateUserStorageQuota,
  validateStorageLimits,
  type StorageLimitValidation,
} from '../storage-limits'
import { STORAGE_LIMITS } from '../index'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}))

describe('Storage Limits Validation', () => {
  describe('validateFileSize', () => {
    it('should accept files under the limit', () => {
      const result = validateFileSize(50 * 1024 * 1024) // 50MB
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should accept files exactly at the limit', () => {
      const result = validateFileSize(STORAGE_LIMITS.maxFileSize)
      expect(result.valid).toBe(true)
    })

    it('should reject files over the limit', () => {
      const fileSize = STORAGE_LIMITS.maxFileSize + 1
      const result = validateFileSize(fileSize)

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('FILE_SIZE_EXCEEDED')
      expect(result.error?.message).toContain('exceeds maximum size')
      expect(result.error?.details?.actualSize).toBe(fileSize)
      expect(result.error?.details?.maxSize).toBe(STORAGE_LIMITS.maxFileSize)
    })

    it('should include formatted sizes in error', () => {
      const fileSize = 150 * 1024 * 1024 // 150MB
      const result = validateFileSize(fileSize)

      expect(result.error?.details?.actualSizeFormatted).toMatch(/MB/)
      expect(result.error?.details?.maxSizeFormatted).toMatch(/MB/)
    })

    it('should handle zero-byte files', () => {
      const result = validateFileSize(0)
      expect(result.valid).toBe(true)
    })
  })

  describe('validatePageCount', () => {
    it('should accept PDFs under page limit', () => {
      const result = validatePageCount(100)
      expect(result.valid).toBe(true)
    })

    it('should accept PDFs exactly at page limit', () => {
      const result = validatePageCount(STORAGE_LIMITS.maxPagesPerFile)
      expect(result.valid).toBe(true)
    })

    it('should reject PDFs over page limit', () => {
      const pageCount = STORAGE_LIMITS.maxPagesPerFile + 1
      const result = validatePageCount(pageCount)

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('PAGE_COUNT_EXCEEDED')
      expect(result.error?.message).toContain('exceeds maximum')
      expect(result.error?.details?.actualPages).toBe(pageCount)
      expect(result.error?.details?.maxPages).toBe(STORAGE_LIMITS.maxPagesPerFile)
    })

    it('should handle single-page PDFs', () => {
      const result = validatePageCount(1)
      expect(result.valid).toBe(true)
    })
  })

  describe('validateCourseFileCount', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should accept course with files under limit', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        count: 25,
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateCourseFileCount('course-123')

      expect(result.valid).toBe(true)
    })

    it('should reject course at file limit', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        count: STORAGE_LIMITS.maxFilesPerCourse,
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateCourseFileCount('course-123')

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('COURSE_FILE_LIMIT')
      expect(result.error?.details?.currentCount).toBe(STORAGE_LIMITS.maxFilesPerCourse)
      expect(result.error?.details?.maxFiles).toBe(STORAGE_LIMITS.maxFilesPerCourse)
    })

    it('should handle database errors gracefully (allow upload)', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        count: null,
        error: { message: 'Database error' },
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateCourseFileCount('course-123')

      // Should allow upload on error (graceful degradation)
      expect(result.valid).toBe(true)
    })

    it('should handle course with no files', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        count: 0,
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateCourseFileCount('course-123')

      expect(result.valid).toBe(true)
    })
  })

  describe('validateUserStorageQuota', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should accept upload within quota', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: Array(10).fill({ storage_key: 'key' }), // 10 files
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const newFileSize = 10 * 1024 * 1024 // 10MB
      const result = await validateUserStorageQuota('user-123', newFileSize)

      expect(result.valid).toBe(true)
    })

    it('should reject upload that exceeds quota', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: Array(1010).fill({ storage_key: 'key' }), // 1010 files * 5MB = 5050MB, + 100MB = 5150MB > 5GB
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const newFileSize = 100 * 1024 * 1024 // 100MB
      const result = await validateUserStorageQuota('user-123', newFileSize)

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('STORAGE_QUOTA_EXCEEDED')
      expect(result.error?.message).toContain('exceed your storage quota')
    })

    it('should handle database errors gracefully (allow upload)', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateUserStorageQuota('user-123', 10 * 1024 * 1024)

      // Should allow upload on error (graceful degradation)
      expect(result.valid).toBe(true)
    })

    it('should handle user with no files', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateUserStorageQuota('user-123', 10 * 1024 * 1024)

      expect(result.valid).toBe(true)
    })
  })

  describe('validateStorageLimits (combined)', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should validate all limits and pass', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        count: 10,
        data: Array(10).fill({ storage_key: 'key' }),
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateStorageLimits({
        fileSize: 50 * 1024 * 1024, // 50MB
        pageCount: 100,
        courseId: 'course-123',
        userId: 'user-123',
      })

      expect(result.valid).toBe(true)
    })

    it('should fail on file size limit', async () => {
      const result = await validateStorageLimits({
        fileSize: STORAGE_LIMITS.maxFileSize + 1,
        pageCount: 100,
        courseId: 'course-123',
        userId: 'user-123',
      })

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('FILE_SIZE_EXCEEDED')
    })

    it('should fail on page count limit', async () => {
      const result = await validateStorageLimits({
        fileSize: 50 * 1024 * 1024,
        pageCount: STORAGE_LIMITS.maxPagesPerFile + 1,
        courseId: 'course-123',
        userId: 'user-123',
      })

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('PAGE_COUNT_EXCEEDED')
    })

    it('should fail on course file limit', async () => {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({
        count: STORAGE_LIMITS.maxFilesPerCourse,
        error: null,
      })

      ;(createAdminClient as any).mockReturnValue({
        from: vi.fn(() => ({
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        })),
      })

      const result = await validateStorageLimits({
        fileSize: 50 * 1024 * 1024,
        pageCount: 100,
        courseId: 'course-123',
        userId: 'user-123',
      })

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('COURSE_FILE_LIMIT')
    })

    it('should check limits in order and stop at first failure', async () => {
      // File size exceeds - should fail immediately without checking other limits
      const result = await validateStorageLimits({
        fileSize: STORAGE_LIMITS.maxFileSize + 1,
        pageCount: STORAGE_LIMITS.maxPagesPerFile + 1, // Also exceeds, but won't be checked
        courseId: 'course-123',
        userId: 'user-123',
      })

      expect(result.valid).toBe(false)
      expect(result.error?.code).toBe('FILE_SIZE_EXCEEDED') // First check fails
    })
  })

  describe('Storage Limits Configuration', () => {
    it('should have correct configured limits', () => {
      expect(STORAGE_LIMITS.maxFileSize).toBe(100 * 1024 * 1024) // 100MB
      expect(STORAGE_LIMITS.maxPagesPerFile).toBe(200)
      expect(STORAGE_LIMITS.maxFilesPerCourse).toBe(50)
      expect(STORAGE_LIMITS.maxStoragePerUser).toBe(5 * 1024 * 1024 * 1024) // 5GB
    })
  })
})
