/**
 * Unit tests for Text PDF Sticker Generator.
 * Tests paragraph accumulation strategy for text-heavy PDFs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before importing the module
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          data: [{ id: 'sticker-1' }, { id: 'sticker-2' }],
          error: null,
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/pdf/paragraph-extractor', () => ({
  extractParagraphs: vi.fn(),
  extractFirstSentence: vi.fn((text: string) => text.slice(0, 50)),
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
                  content: 'This is a test explanation in markdown format.',
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

vi.mock('./window-manager', () => ({
  updateSessionProgress: vi.fn(() => Promise.resolve()),
}))

import {
  generateTextPdfStickers,
  saveTextStickersToDatabase,
  type TextPdfSticker,
  type PageRange,
} from '../text-pdf-generator'
import { extractParagraphs } from '@/lib/pdf/paragraph-extractor'
import type { PageParagraphs, ExtractedParagraph } from '@/lib/pdf/paragraph-extractor'

describe('Text PDF Generator', () => {
  const mockExtractParagraphs = vi.mocked(extractParagraphs)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generateTextPdfStickers', () => {
    const mockPdfBuffer = Buffer.from('mock-pdf-content')
    const baseOptions = {
      userId: 'user-123',
      courseId: 'course-456',
      fileId: 'file-789',
    }

    it('should generate sticker when paragraphs reach 300+ words on single page', async () => {
      // Mock single page with 400 words
      mockExtractParagraphs.mockResolvedValueOnce({
        pageNumber: 1,
        paragraphs: [
          {
            text: 'A '.repeat(200) + 'large paragraph with many words.',
            wordCount: 400,
            yStart: 700,
            yEnd: 500,
            lineCount: 20,
          },
        ],
        totalWordCount: 400,
      })

      const result = await generateTextPdfStickers(mockPdfBuffer, [1], baseOptions)

      expect(result).toHaveLength(1)
      expect(result[0].page).toBe(1)
      expect(result[0].pageRange).toBeNull() // Single page, no cross-page range
      expect(result[0].contentMarkdown).toBe(
        'This is a test explanation in markdown format.'
      )
    })

    it('should create cross-page sticker when accumulating across pages', async () => {
      // Mock 3 pages with paragraphs totaling ~450 words
      mockExtractParagraphs
        .mockResolvedValueOnce({
          pageNumber: 1,
          paragraphs: [
            {
              text: 'Word '.repeat(150),
              wordCount: 150,
              yStart: 700,
              yEnd: 600,
              lineCount: 5,
            },
          ],
          totalWordCount: 150,
        })
        .mockResolvedValueOnce({
          pageNumber: 2,
          paragraphs: [
            {
              text: 'Text '.repeat(100),
              wordCount: 100,
              yStart: 700,
              yEnd: 650,
              lineCount: 3,
            },
          ],
          totalWordCount: 100,
        })
        .mockResolvedValueOnce({
          pageNumber: 3,
          paragraphs: [
            {
              text: 'More '.repeat(100),
              wordCount: 100,
              yStart: 700,
              yEnd: 680,
              lineCount: 2,
            },
          ],
          totalWordCount: 100,
        })

      const result = await generateTextPdfStickers(
        mockPdfBuffer,
        [1, 2, 3],
        baseOptions
      )

      // Should have 1 cross-page sticker (150+100+100 = 350 words > 300 threshold)
      expect(result).toHaveLength(1)
      expect(result[0].page).toBe(1) // Display on first page
      expect(result[0].pageRange).not.toBeNull()
      if (result[0].pageRange) {
        expect(result[0].pageRange.start.page).toBe(1)
        expect(result[0].pageRange.end.page).toBe(3)
      }
    })

    it('should handle end-of-window remainder with 100+ words', async () => {
      // Mock pages where last accumulation has 150 words (above ABSOLUTE_MIN of 100)
      mockExtractParagraphs
        .mockResolvedValueOnce({
          pageNumber: 1,
          paragraphs: [
            {
              text: 'Large '.repeat(200),
              wordCount: 400,
              yStart: 700,
              yEnd: 500,
              lineCount: 10,
            },
          ],
          totalWordCount: 400,
        })
        .mockResolvedValueOnce({
          pageNumber: 2,
          paragraphs: [
            {
              text: 'Remaining '.repeat(75),
              wordCount: 150,
              yStart: 700,
              yEnd: 650,
              lineCount: 5,
            },
          ],
          totalWordCount: 150,
        })

      const result = await generateTextPdfStickers(
        mockPdfBuffer,
        [1, 2],
        baseOptions
      )

      // Should have 2 stickers: one from page 1 (400 words), one remainder from page 2 (150 words)
      expect(result).toHaveLength(2)
      expect(result[0].page).toBe(1)
      expect(result[1].page).toBe(2)
    })

    it('should skip remainder under 100 words', async () => {
      // Mock pages where last accumulation has only 50 words
      mockExtractParagraphs
        .mockResolvedValueOnce({
          pageNumber: 1,
          paragraphs: [
            {
              text: 'Large '.repeat(200),
              wordCount: 400,
              yStart: 700,
              yEnd: 500,
              lineCount: 10,
            },
          ],
          totalWordCount: 400,
        })
        .mockResolvedValueOnce({
          pageNumber: 2,
          paragraphs: [
            {
              text: 'Short '.repeat(25),
              wordCount: 50,
              yStart: 700,
              yEnd: 680,
              lineCount: 2,
            },
          ],
          totalWordCount: 50,
        })

      const result = await generateTextPdfStickers(
        mockPdfBuffer,
        [1, 2],
        baseOptions
      )

      // Only 1 sticker (page 1), remainder on page 2 is too short
      expect(result).toHaveLength(1)
      expect(result[0].page).toBe(1)
    })

    it('should handle abort signal', async () => {
      const abortController = new AbortController()

      mockExtractParagraphs.mockResolvedValueOnce({
        pageNumber: 1,
        paragraphs: [
          {
            text: 'Test '.repeat(200),
            wordCount: 400,
            yStart: 700,
            yEnd: 500,
            lineCount: 10,
          },
        ],
        totalWordCount: 400,
      })

      // Abort immediately
      abortController.abort()

      const result = await generateTextPdfStickers(mockPdfBuffer, [1], {
        ...baseOptions,
        signal: abortController.signal,
      })

      // Should return empty due to abort
      expect(result).toHaveLength(0)
    })

    it('should call onPageComplete callback', async () => {
      const onPageComplete = vi.fn()

      mockExtractParagraphs
        .mockResolvedValueOnce({
          pageNumber: 1,
          paragraphs: [
            {
              text: 'Test '.repeat(200),
              wordCount: 400,
              yStart: 700,
              yEnd: 500,
              lineCount: 10,
            },
          ],
          totalWordCount: 400,
        })
        .mockResolvedValueOnce({
          pageNumber: 2,
          paragraphs: [
            {
              text: 'More '.repeat(200),
              wordCount: 400,
              yStart: 700,
              yEnd: 500,
              lineCount: 10,
            },
          ],
          totalWordCount: 400,
        })

      await generateTextPdfStickers(mockPdfBuffer, [1, 2], {
        ...baseOptions,
        onPageComplete,
      })

      expect(onPageComplete).toHaveBeenCalledTimes(2)
      expect(onPageComplete).toHaveBeenCalledWith(1, expect.any(Number))
      expect(onPageComplete).toHaveBeenCalledWith(2, expect.any(Number))
    })

    it('should handle empty pages', async () => {
      mockExtractParagraphs.mockResolvedValueOnce({
        pageNumber: 1,
        paragraphs: [],
        totalWordCount: 0,
      })

      const result = await generateTextPdfStickers(mockPdfBuffer, [1], baseOptions)

      expect(result).toHaveLength(0)
    })

    it('should process pages in sorted order', async () => {
      const callOrder: number[] = []

      mockExtractParagraphs.mockImplementation(async (_buffer, page) => {
        callOrder.push(page)
        return {
          pageNumber: page,
          paragraphs: [],
          totalWordCount: 0,
        }
      })

      // Pass pages out of order
      await generateTextPdfStickers(mockPdfBuffer, [5, 2, 8, 1], baseOptions)

      // Should process in sorted order
      expect(callOrder).toEqual([1, 2, 5, 8])
    })
  })

  describe('saveTextStickersToDatabase', () => {
    it('should save stickers to database', async () => {
      const stickers: TextPdfSticker[] = [
        {
          page: 1,
          anchorText: 'First anchor',
          contentMarkdown: '# Explanation 1',
          pageRange: null,
        },
        {
          page: 3,
          anchorText: 'Second anchor',
          contentMarkdown: '# Explanation 2',
          pageRange: {
            start: { page: 3, yStart: 700, yEnd: 600 },
            end: { page: 5, yStart: 500, yEnd: 400 },
          },
        },
      ]

      const result = await saveTextStickersToDatabase(stickers, {
        userId: 'user-123',
        courseId: 'course-456',
        fileId: 'file-789',
      })

      expect(result).toHaveLength(2)
      expect(result).toContain('sticker-1')
      expect(result).toContain('sticker-2')
    })

    it('should return empty array for empty stickers', async () => {
      const result = await saveTextStickersToDatabase([], {
        userId: 'user-123',
        courseId: 'course-456',
        fileId: 'file-789',
      })

      expect(result).toEqual([])
    })
  })
})
