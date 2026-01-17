/**
 * Unit tests for PDF Type Detection Module.
 * Tests scoring functions and type identification logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _testing,
  PdfType,
  TypeScoreBreakdown,
} from '../type-detector'

const {
  calculateImageAreaScore,
  calculateTextDensityScore,
  calculateLayoutScore,
  calculateMetadataScore,
} = _testing

// Mock page analysis type
interface MockPageAnalysis {
  pageNumber: number
  wordCount: number
  textDensity: number
  hasBulletPoints: boolean
  hasCenteredText: boolean
  hasShortLines: boolean
  estimatedImageRatio: number
}

describe('PDF Type Detection', () => {
  describe('calculateImageAreaScore', () => {
    it('should return 0 for empty page analyses', () => {
      expect(calculateImageAreaScore([])).toBe(0)
    })

    it('should return high score for high image ratio (PPT-style)', () => {
      const pptPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 30,
          textDensity: 0.06,
          hasBulletPoints: true,
          hasCenteredText: true,
          hasShortLines: true,
          estimatedImageRatio: 0.7,
        },
        {
          pageNumber: 2,
          wordCount: 25,
          textDensity: 0.05,
          hasBulletPoints: true,
          hasCenteredText: false,
          hasShortLines: true,
          estimatedImageRatio: 0.7,
        },
      ]

      const score = calculateImageAreaScore(pptPages)
      // avgImageRatio = 0.7, score = 0.7 * 0.8 = 0.56, capped at 0.4
      expect(score).toBe(0.4)
    })

    it('should return low score for text-heavy PDFs', () => {
      const textPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 450,
          textDensity: 0.9,
          hasBulletPoints: false,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.1,
        },
        {
          pageNumber: 2,
          wordCount: 500,
          textDensity: 1.0,
          hasBulletPoints: false,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.1,
        },
      ]

      const score = calculateImageAreaScore(textPages)
      // avgImageRatio = 0.1, score = 0.1 * 0.8 = 0.08
      expect(score).toBeCloseTo(0.08, 5)
    })

    it('should handle moderate image ratio', () => {
      const mixedPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 200,
          textDensity: 0.4,
          hasBulletPoints: false,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.3,
        },
      ]

      const score = calculateImageAreaScore(mixedPages)
      // avgImageRatio = 0.3, score = 0.3 * 0.8 = 0.24
      expect(score).toBe(0.24)
    })
  })

  describe('calculateTextDensityScore', () => {
    it('should return 0 for empty page analyses', () => {
      expect(calculateTextDensityScore([])).toBe(0)
    })

    it('should return high score for low density (PPT-style)', () => {
      const pptPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 30,
          textDensity: 0.1,
          hasBulletPoints: true,
          hasCenteredText: true,
          hasShortLines: true,
          estimatedImageRatio: 0.7,
        },
      ]

      const score = calculateTextDensityScore(pptPages)
      expect(score).toBe(0.3) // Low density < 0.2 gets max score
    })

    it('should return medium score for moderate density', () => {
      const moderatePages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 150,
          textDensity: 0.35,
          hasBulletPoints: true,
          hasCenteredText: false,
          hasShortLines: true,
          estimatedImageRatio: 0.3,
        },
      ]

      const score = calculateTextDensityScore(moderatePages)
      expect(score).toBe(0.2) // density 0.2-0.4 gets 0.2
    })

    it('should return 0 for high density (text-heavy)', () => {
      const textPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 500,
          textDensity: 0.9,
          hasBulletPoints: false,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.1,
        },
      ]

      const score = calculateTextDensityScore(textPages)
      expect(score).toBe(0) // density > 0.6 gets 0
    })
  })

  describe('calculateLayoutScore', () => {
    it('should return 0 for empty page analyses', () => {
      expect(calculateLayoutScore([])).toBe(0)
    })

    it('should return high score for PPT layout patterns', () => {
      const pptPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 50,
          textDensity: 0.1,
          hasBulletPoints: true,
          hasCenteredText: true,
          hasShortLines: true,
          estimatedImageRatio: 0.5,
        },
        {
          pageNumber: 2,
          wordCount: 40,
          textDensity: 0.08,
          hasBulletPoints: true,
          hasCenteredText: true,
          hasShortLines: true,
          estimatedImageRatio: 0.6,
        },
      ]

      const score = calculateLayoutScore(pptPages)
      // All patterns present: 1.0 * 0.07 + 1.0 * 0.07 + 1.0 * 0.06 = 0.2
      expect(score).toBe(0.2)
    })

    it('should return 0 for text-heavy layout', () => {
      const textPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 500,
          textDensity: 1.0,
          hasBulletPoints: false,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.1,
        },
      ]

      const score = calculateLayoutScore(textPages)
      expect(score).toBe(0)
    })

    it('should return partial score for mixed layout', () => {
      const mixedPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 100,
          textDensity: 0.2,
          hasBulletPoints: true,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.3,
        },
        {
          pageNumber: 2,
          wordCount: 400,
          textDensity: 0.8,
          hasBulletPoints: false,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.1,
        },
      ]

      const score = calculateLayoutScore(mixedPages)
      // bulletRatio = 0.5 * 0.07 = 0.035
      expect(score).toBeCloseTo(0.035, 3)
    })
  })

  describe('calculateMetadataScore', () => {
    it('should return 0.1 for PowerPoint creator', () => {
      const metadata = { creator: 'microsoft powerpoint', producer: 'pdf lib' }
      expect(calculateMetadataScore(metadata)).toBe(0.1)
    })

    it('should return 0.1 for Keynote creator', () => {
      const metadata = { creator: 'apple keynote', producer: undefined }
      expect(calculateMetadataScore(metadata)).toBe(0.1)
    })

    it('should return 0.1 for Google Slides', () => {
      const metadata = { creator: undefined, producer: 'google slides' }
      expect(calculateMetadataScore(metadata)).toBe(0.1)
    })

    it('should return 0.1 for Canva', () => {
      const metadata = { creator: 'canva' }
      expect(calculateMetadataScore(metadata)).toBe(0.1)
    })

    it('should return 0 for non-presentation creator', () => {
      const metadata = { creator: 'latex', producer: 'pdflatex' }
      expect(calculateMetadataScore(metadata)).toBe(0)
    })

    it('should return 0 for missing metadata', () => {
      expect(calculateMetadataScore({})).toBe(0)
      expect(calculateMetadataScore({ creator: undefined, producer: undefined })).toBe(0)
    })
  })

  describe('Type Detection Integration', () => {
    it('should correctly identify PPT-style PDF (total score > 0.6)', () => {
      const pptPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 30,
          textDensity: 0.06,
          hasBulletPoints: true,
          hasCenteredText: true,
          hasShortLines: true,
          estimatedImageRatio: 0.7,
        },
      ]
      const pptMetadata = { creator: 'microsoft powerpoint' }

      const imageScore = calculateImageAreaScore(pptPages)
      const densityScore = calculateTextDensityScore(pptPages)
      const layoutScore = calculateLayoutScore(pptPages)
      const metadataScore = calculateMetadataScore(pptMetadata)
      const totalScore = imageScore + densityScore + layoutScore + metadataScore

      // Should be > 0.6 for PPT
      expect(totalScore).toBeGreaterThan(0.6)
    })

    it('should correctly identify text-heavy PDF (total score <= 0.6)', () => {
      const textPages: MockPageAnalysis[] = [
        {
          pageNumber: 1,
          wordCount: 500,
          textDensity: 1.0,
          hasBulletPoints: false,
          hasCenteredText: false,
          hasShortLines: false,
          estimatedImageRatio: 0.1,
        },
      ]
      const textMetadata = { creator: 'pdflatex' }

      const imageScore = calculateImageAreaScore(textPages)
      const densityScore = calculateTextDensityScore(textPages)
      const layoutScore = calculateLayoutScore(textPages)
      const metadataScore = calculateMetadataScore(textMetadata)
      const totalScore = imageScore + densityScore + layoutScore + metadataScore

      // Should be <= 0.6 for text
      expect(totalScore).toBeLessThanOrEqual(0.6)
    })
  })
})
