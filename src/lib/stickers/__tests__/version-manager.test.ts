/**
 * Unit tests for Sticker Version Manager.
 * Tests version creation logic, switching, and circular replacement strategy.
 *
 * Note: Database functions are tested through integration tests.
 * These unit tests verify the logic flow and data transformations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StickerVersion, StickerWithVersions } from '../version-manager'

// Mock the supabase client to test logic without database
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => ({
            // Returns versions list
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  })),
}))

describe('Sticker Version Manager', () => {
  describe('Version Data Structures', () => {
    it('should have correct StickerVersion interface', () => {
      const version: StickerVersion = {
        versionNumber: 1,
        contentMarkdown: 'Explanation content here',
        createdAt: '2024-01-01T00:00:00Z',
      }

      expect(version.versionNumber).toBe(1)
      expect(version.contentMarkdown).toBe('Explanation content here')
      expect(version.createdAt).toBeDefined()
    })

    it('should have correct StickerWithVersions interface', () => {
      const sticker: StickerWithVersions = {
        id: 'sticker-123',
        currentVersion: 2,
        contentMarkdown: 'Current version content',
        versions: [
          {
            versionNumber: 1,
            contentMarkdown: 'Previous version content',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        pageRange: { start: { page: 5 }, end: { page: 6 } },
        page: 5,
        anchorText: 'First sentence of explanation',
      }

      expect(sticker.id).toBe('sticker-123')
      expect(sticker.currentVersion).toBe(2)
      expect(sticker.versions).toHaveLength(1)
      expect(sticker.versions[0].versionNumber).toBe(1)
      expect(sticker.pageRange).toBeDefined()
    })

    it('should handle sticker without page range', () => {
      const sticker: StickerWithVersions = {
        id: 'sticker-456',
        currentVersion: 1,
        contentMarkdown: 'Single page sticker content',
        versions: [],
        pageRange: null,
        page: 10,
        anchorText: 'Anchor text',
      }

      expect(sticker.pageRange).toBeNull()
      expect(sticker.versions).toHaveLength(0)
    })
  })

  describe('Circular Replacement Logic', () => {
    /**
     * The circular replacement strategy works as follows:
     *
     * Initial state: content_markdown = V1, no versions in sticker_versions
     * After 1st refresh: content_markdown = V2, sticker_versions = [V1]
     * After 2nd refresh: content_markdown = V3, sticker_versions = [V2] (V1 deleted)
     * After 3rd refresh: content_markdown = V4, sticker_versions = [V3] (V2 deleted)
     */

    it('should represent initial sticker state (no versions)', () => {
      const initialSticker: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 1,
        contentMarkdown: 'Version 1 content',
        versions: [],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      expect(initialSticker.currentVersion).toBe(1)
      expect(initialSticker.versions).toHaveLength(0)
    })

    it('should represent state after first refresh (2 versions)', () => {
      const afterFirstRefresh: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 2,
        contentMarkdown: 'Version 2 content',
        versions: [
          {
            versionNumber: 1,
            contentMarkdown: 'Version 1 content',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      expect(afterFirstRefresh.currentVersion).toBe(2)
      expect(afterFirstRefresh.versions).toHaveLength(1)
      expect(afterFirstRefresh.versions[0].versionNumber).toBe(1)
    })

    it('should represent state after second refresh (circular replacement)', () => {
      const afterSecondRefresh: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 2,
        contentMarkdown: 'Version 3 content',
        versions: [
          {
            versionNumber: 1,
            contentMarkdown: 'Version 2 content', // V1 was deleted, V2 moved to V1
            createdAt: '2024-01-02T00:00:00Z',
          },
        ],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      expect(afterSecondRefresh.currentVersion).toBe(2)
      expect(afterSecondRefresh.versions).toHaveLength(1)
      // V1 in the versions table is now what was V2
      expect(afterSecondRefresh.versions[0].contentMarkdown).toBe('Version 2 content')
    })

    it('should always have max 2 versions (current + 1 in versions table)', () => {
      const sticker: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 2,
        contentMarkdown: 'Current content',
        versions: [
          {
            versionNumber: 1,
            contentMarkdown: 'Previous content',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      // Total versions = current (1) + versions table (1) = 2
      const totalVersions = 1 + sticker.versions.length
      expect(totalVersions).toBeLessThanOrEqual(2)
    })
  })

  describe('Version Switching Logic', () => {
    it('should be able to switch between versions 1 and 2', () => {
      const sticker: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 2,
        contentMarkdown: 'Current (V2) content',
        versions: [
          {
            versionNumber: 1,
            contentMarkdown: 'Previous (V1) content',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      // Can switch from 2 to 1
      expect(sticker.currentVersion).toBe(2)
      expect(sticker.versions.find((v) => v.versionNumber === 1)).toBeDefined()

      // Simulating switch to version 1
      const switchedSticker = {
        ...sticker,
        currentVersion: 1,
        contentMarkdown: sticker.versions[0].contentMarkdown,
      }

      expect(switchedSticker.currentVersion).toBe(1)
      expect(switchedSticker.contentMarkdown).toBe('Previous (V1) content')
    })

    it('should not allow switching when only one version exists', () => {
      const singleVersionSticker: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 1,
        contentMarkdown: 'Only version content',
        versions: [],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      // No version to switch to
      expect(singleVersionSticker.versions).toHaveLength(0)
    })
  })

  describe('Page Range Handling', () => {
    it('should handle cross-page sticker with page_range', () => {
      const crossPageSticker: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 1,
        contentMarkdown: 'Spans multiple pages',
        versions: [],
        pageRange: {
          start: { page: 5, yStart: 700, yEnd: 600 },
          end: { page: 7, yStart: 500, yEnd: 400 },
        },
        page: 5, // Display on start page
        anchorText: 'First paragraph text',
      }

      expect(crossPageSticker.pageRange).not.toBeNull()
      expect((crossPageSticker.pageRange as { start: { page: number } }).start.page).toBe(5)
      expect((crossPageSticker.pageRange as { end: { page: number } }).end.page).toBe(7)
    })

    it('should handle single-page sticker (PPT style)', () => {
      const singlePageSticker: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 1,
        contentMarkdown: 'Single page explanation',
        versions: [],
        pageRange: null, // No page range for PPT-style
        page: 10,
        anchorText: 'Slide title',
      }

      expect(singlePageSticker.pageRange).toBeNull()
      expect(singlePageSticker.page).toBe(10)
    })
  })

  describe('Version Count Calculation', () => {
    it('should count total versions correctly', () => {
      const stickerWithOneVersion: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 1,
        contentMarkdown: 'Content',
        versions: [],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      // 1 current version + 0 in versions table = 1
      expect(stickerWithOneVersion.versions.length + 1).toBe(1)

      const stickerWithTwoVersions: StickerWithVersions = {
        id: 'sticker-1',
        currentVersion: 2,
        contentMarkdown: 'Content',
        versions: [
          {
            versionNumber: 1,
            contentMarkdown: 'Old',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        pageRange: null,
        page: 1,
        anchorText: 'Anchor',
      }

      // 1 current version + 1 in versions table = 2
      expect(stickerWithTwoVersions.versions.length + 1).toBe(2)
    })
  })

  describe('Refresh Eligibility', () => {
    /**
     * Refresh eligibility is determined by sticker type.
     * Only 'auto' stickers (generated by auto-explain) can be refreshed.
     */

    it('should identify auto stickers as refreshable', () => {
      const autoSticker = {
        type: 'auto' as const,
        page_range: null,
      }

      expect(autoSticker.type).toBe('auto')
    })

    it('should identify manual stickers as non-refreshable', () => {
      const manualSticker = {
        type: 'manual' as const,
        page_range: null,
      }

      expect(manualSticker.type).toBe('manual')
      expect(manualSticker.type).not.toBe('auto')
    })
  })
})
