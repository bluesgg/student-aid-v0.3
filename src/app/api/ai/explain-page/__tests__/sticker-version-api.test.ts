/**
 * Unit tests for Sticker Version API endpoints.
 * Tests /api/ai/explain-page/sticker/[stickerId]/refresh and /version
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies
const mockSupabaseUser = { id: 'user-123' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: mockSupabaseUser },
          error: null,
        })
      ),
    },
    from: vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: {
              id: 'sticker-123',
              user_id: 'user-123',
              type: 'auto',
              page: 5,
              anchor_text: 'Test anchor',
              content_markdown: 'Test content',
              current_version: 1,
              course_id: 'course-456',
              file_id: 'file-789',
              page_range: null,
              files: {
                storage_key: 'path/to/file.pdf',
              },
            },
            error: null,
          })),
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: {
                id: 'sticker-123',
                user_id: 'user-123',
                current_version: 1,
              },
              error: null,
            })),
          })),
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(() =>
          Promise.resolve({
            data: new Blob(['mock pdf content']),
            error: null,
          })
        ),
      })),
    },
  })),
}))

vi.mock('@/lib/api-response', () => ({
  successResponse: vi.fn((data) => ({
    ok: true,
    ...data,
    json: () => Promise.resolve({ ok: true, ...data }),
  })),
  errors: {
    unauthorized: vi.fn(() => ({ status: 401, error: 'Unauthorized' })),
    notFound: vi.fn((entity) => ({ status: 404, error: `${entity} not found` })),
    custom: vi.fn((code, message, status) => ({ status, error: { code, message } })),
    internalError: vi.fn(() => ({ status: 500, error: 'Internal error' })),
    invalidInput: vi.fn((msg) => ({ status: 400, error: msg })),
  },
}))

vi.mock('@/lib/stickers/version-manager', () => ({
  createVersion: vi.fn(),
  switchVersion: vi.fn(),
  getStickerWithVersions: vi.fn(),
}))

vi.mock('@/lib/pdf/extract', () => ({
  extractPageText: vi.fn(() => Promise.resolve({ text: 'Mock page text content for testing purposes' })),
  extractPagesText: vi.fn(() => Promise.resolve('Mock multi-page text content')),
}))

vi.mock('@/lib/openai/client', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(() =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: 'This is a regenerated explanation with fresh perspective.',
                },
              },
            ],
          })
        ),
      },
    },
  })),
  DEFAULT_MODEL: 'gpt-4o',
}))

vi.mock('@/lib/context', () => ({
  retrieveContextForPage: vi.fn(() =>
    Promise.resolve({ entries: [], totalTokens: 0 })
  ),
  buildContextHint: vi.fn(() => ''),
}))

import {
  createVersion,
  switchVersion,
  getStickerWithVersions,
} from '@/lib/stickers/version-manager'

describe('Sticker Version API', () => {
  const mockCreateVersion = vi.mocked(createVersion)
  const mockSwitchVersion = vi.mocked(switchVersion)
  const mockGetStickerWithVersions = vi.mocked(getStickerWithVersions)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/ai/explain-page/sticker/[stickerId]/refresh', () => {
    // We need to import fresh to clear debounce state between tests
    let POST: typeof import('../sticker/[stickerId]/refresh/route').POST

    beforeEach(async () => {
      // Dynamic import to get fresh module with cleared debounce
      vi.resetModules()
      const refreshRoute = await import('../sticker/[stickerId]/refresh/route')
      POST = refreshRoute.POST
    })

    it('should regenerate sticker and create new version', async () => {
      mockCreateVersion.mockResolvedValueOnce({
        success: true,
        newVersion: 2,
        sticker: {
          id: 'sticker-123',
          currentVersion: 2,
          contentMarkdown: 'This is a regenerated explanation.',
          versions: [
            { versionNumber: 1, contentMarkdown: 'Old content', createdAt: new Date().toISOString() },
            { versionNumber: 2, contentMarkdown: 'New content', createdAt: new Date().toISOString() },
          ],
          page: 5,
          anchorText: 'Test anchor',
          pageRange: null,
        },
      })

      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/refresh',
        { method: 'POST' }
      )
      const result = await POST(request, { params: { stickerId: 'sticker-123' } })

      expect(mockCreateVersion).toHaveBeenCalled()
      expect(result).toMatchObject({
        ok: true,
        sticker: {
          id: 'sticker-123',
          currentVersion: 2,
        },
      })
    })

    it('should return 429 on rapid refresh (debounce)', async () => {
      mockCreateVersion.mockResolvedValueOnce({
        success: true,
        newVersion: 2,
        sticker: {
          id: 'sticker-123',
          currentVersion: 2,
          contentMarkdown: 'New content',
          versions: [],
          page: 5,
          anchorText: 'Test',
          pageRange: null,
        },
      })

      // First request
      const request1 = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/refresh',
        { method: 'POST' }
      )
      await POST(request1, { params: { stickerId: 'sticker-123' } })

      // Second request immediately after (should be debounced)
      const request2 = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/refresh',
        { method: 'POST' }
      )
      const result = await POST(request2, { params: { stickerId: 'sticker-123' } })

      expect(result.status).toBe(429)
    })
  })

  describe('GET /api/ai/explain-page/sticker/[stickerId]/version', () => {
    let GET: typeof import('../sticker/[stickerId]/version/route').GET

    beforeEach(async () => {
      vi.resetModules()
      const versionRoute = await import('../sticker/[stickerId]/version/route')
      GET = versionRoute.GET
    })

    it('should return sticker with version info', async () => {
      mockGetStickerWithVersions.mockResolvedValueOnce({
        id: 'sticker-123',
        currentVersion: 1,
        contentMarkdown: 'Current content',
        versions: [
          { versionNumber: 2, contentMarkdown: 'Older content', createdAt: '2024-01-01T00:00:00Z' },
        ],
        page: 5,
        anchorText: 'Test anchor',
        pageRange: null,
      })

      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/version'
      )
      const result = await GET(request, { params: { stickerId: 'sticker-123' } })

      expect(mockGetStickerWithVersions).toHaveBeenCalledWith('sticker-123')
      expect(result).toMatchObject({
        ok: true,
        sticker: {
          id: 'sticker-123',
          currentVersion: 1,
          totalVersions: 2, // current + 1 in versions array
        },
      })
    })

    it('should return 404 when sticker not found', async () => {
      mockGetStickerWithVersions.mockResolvedValueOnce(null)

      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/invalid/version'
      )
      const result = await GET(request, { params: { stickerId: 'invalid' } })

      // The mock supabase returns user_id check error for invalid sticker
      expect(result.status).toBe(404)
    })
  })

  describe('PATCH /api/ai/explain-page/sticker/[stickerId]/version', () => {
    let PATCH: typeof import('../sticker/[stickerId]/version/route').PATCH

    beforeEach(async () => {
      vi.resetModules()
      const versionRoute = await import('../sticker/[stickerId]/version/route')
      PATCH = versionRoute.PATCH
    })

    it('should switch to version 2', async () => {
      mockSwitchVersion.mockResolvedValueOnce({
        success: true,
        currentVersion: 2,
        contentMarkdown: 'Version 2 content',
      })

      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/version',
        {
          method: 'PATCH',
          body: JSON.stringify({ version: 2 }),
        }
      )
      const result = await PATCH(request, { params: { stickerId: 'sticker-123' } })

      expect(mockSwitchVersion).toHaveBeenCalledWith('sticker-123', 2)
      expect(result).toMatchObject({
        ok: true,
        currentVersion: 2,
        contentMarkdown: 'Version 2 content',
      })
    })

    it('should handle switching between versions', async () => {
      // This test verifies the version switching logic works
      // The actual version switch is tested via the switchVersion mock
      mockSwitchVersion.mockResolvedValueOnce({
        success: true,
        currentVersion: 2,
        contentMarkdown: 'Switched content',
      })

      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/version',
        {
          method: 'PATCH',
          body: JSON.stringify({ version: 2 }),
        }
      )
      const result = await PATCH(request, { params: { stickerId: 'sticker-123' } })

      expect(mockSwitchVersion).toHaveBeenCalled()
      expect(result.ok).toBe(true)
    })

    it('should return success when already on target version', async () => {
      // The mocked sticker is on version 1, request version 1
      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/version',
        {
          method: 'PATCH',
          body: JSON.stringify({ version: 1 }),
        }
      )
      const result = await PATCH(request, { params: { stickerId: 'sticker-123' } })

      // Should not call switchVersion, return success message
      expect(mockSwitchVersion).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        ok: true,
        message: 'Already on requested version',
        currentVersion: 1,
      })
    })

    it('should return 404 when version does not exist', async () => {
      mockSwitchVersion.mockResolvedValueOnce({
        success: false,
        error: 'VERSION_NOT_FOUND',
      })

      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/version',
        {
          method: 'PATCH',
          body: JSON.stringify({ version: 2 }),
        }
      )
      const result = await PATCH(request, { params: { stickerId: 'sticker-123' } })

      expect(result.status).toBe(404)
    })

    it('should reject invalid version number', async () => {
      const request = new NextRequest(
        'http://localhost/api/ai/explain-page/sticker/sticker-123/version',
        {
          method: 'PATCH',
          body: JSON.stringify({ version: 3 }), // Invalid - only 1 or 2 allowed
        }
      )
      const result = await PATCH(request, { params: { stickerId: 'sticker-123' } })

      expect(result.status).toBe(400)
    })
  })
})
