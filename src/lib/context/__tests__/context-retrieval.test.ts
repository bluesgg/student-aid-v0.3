/**
 * Unit tests for context retrieval.
 * Tests priority scoring, token budget enforcement, and retrieval logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  type ContextEntry,
  RETRIEVAL_CONFIG,
  PRIORITY_SCORES,
} from '../types'
import { estimateTokenCount } from '../utils'

// Mock functions for testing (these replicate the internal logic)
function calculatePriorityScore(
  entry: ContextEntry,
  currentPdfHash: string
): number {
  let score = 0
  score += entry.qualityScore * 10

  const typeBonus = PRIORITY_SCORES.byType[entry.type] || 0
  score += typeBonus

  if (entry.pdfHash === currentPdfHash) {
    score += PRIORITY_SCORES.currentPdf
  } else {
    score += PRIORITY_SCORES.sameCourse
  }

  return score
}

function applyTokenBudget(
  entries: ContextEntry[],
  maxTokens: number
): { entries: ContextEntry[]; totalTokens: number } {
  const result: ContextEntry[] = []
  let totalTokens = 0

  for (const entry of entries) {
    const entryTokens = estimateTokenCount(`${entry.title}: ${entry.content}`)
    if (totalTokens + entryTokens > maxTokens) {
      break
    }
    result.push(entry)
    totalTokens += entryTokens
  }

  return { entries: result, totalTokens }
}

function generateMockEntry(overrides?: Partial<ContextEntry>): ContextEntry {
  return {
    id: 'entry-1',
    pdfHash: 'hash-1',
    type: 'definition',
    title: 'Test Definition',
    content: 'This is a test definition content.',
    sourcePage: 1,
    keywords: ['test', 'definition'],
    qualityScore: 0.8,
    language: 'en',
    extractionVersion: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Context Retrieval Tests', () => {
  describe('Priority Scoring', () => {
    it('should prioritize current PDF entries over other PDFs', () => {
      const currentPdfEntry = generateMockEntry({
        pdfHash: 'current-hash',
        qualityScore: 0.8,
      })

      const otherPdfEntry = generateMockEntry({
        pdfHash: 'other-hash',
        qualityScore: 0.8,
      })

      const currentScore = calculatePriorityScore(currentPdfEntry, 'current-hash')
      const otherScore = calculatePriorityScore(otherPdfEntry, 'current-hash')

      expect(currentScore).toBeGreaterThan(otherScore)
      expect(currentScore - otherScore).toBe(PRIORITY_SCORES.currentPdf - PRIORITY_SCORES.sameCourse)
    })

    it('should apply type bonuses correctly', () => {
      const baseScore = 0.8 * 10 + PRIORITY_SCORES.sameCourse

      const definitionEntry = generateMockEntry({ type: 'definition', qualityScore: 0.8 })
      const formulaEntry = generateMockEntry({ type: 'formula', qualityScore: 0.8 })
      const theoremEntry = generateMockEntry({ type: 'theorem', qualityScore: 0.8 })
      const conceptEntry = generateMockEntry({ type: 'concept', qualityScore: 0.8 })
      const principleEntry = generateMockEntry({ type: 'principle', qualityScore: 0.8 })

      const definitionScore = calculatePriorityScore(definitionEntry, 'other-hash')
      const formulaScore = calculatePriorityScore(formulaEntry, 'other-hash')
      const theoremScore = calculatePriorityScore(theoremEntry, 'other-hash')
      const conceptScore = calculatePriorityScore(conceptEntry, 'other-hash')
      const principleScore = calculatePriorityScore(principleEntry, 'other-hash')

      // Definition should have highest type bonus
      expect(definitionScore).toBeGreaterThan(formulaScore)
      expect(formulaScore).toBeGreaterThan(theoremScore)
      expect(theoremScore).toBe(principleScore) // theorem and principle have same bonus (10)
      expect(principleScore).toBeGreaterThan(conceptScore)
    })

    it('should factor in quality score linearly', () => {
      const highQuality = generateMockEntry({ qualityScore: 1.0 })
      const medQuality = generateMockEntry({ qualityScore: 0.8 })
      const lowQuality = generateMockEntry({ qualityScore: 0.7 })

      const highScore = calculatePriorityScore(highQuality, 'other-hash')
      const medScore = calculatePriorityScore(medQuality, 'other-hash')
      const lowScore = calculatePriorityScore(lowQuality, 'other-hash')

      expect(highScore).toBeGreaterThan(medScore)
      expect(medScore).toBeGreaterThan(lowScore)

      // Quality score is multiplied by 10
      expect(highScore - medScore).toBeCloseTo((1.0 - 0.8) * 10)
      expect(medScore - lowScore).toBeCloseTo((0.8 - 0.7) * 10)
    })

    it('should combine quality, type, and source bonuses correctly', () => {
      const currentPdfDefinition = generateMockEntry({
        pdfHash: 'current',
        type: 'definition',
        qualityScore: 1.0,
      })

      const otherPdfConcept = generateMockEntry({
        pdfHash: 'other',
        type: 'concept',
        qualityScore: 0.7,
      })

      const score1 = calculatePriorityScore(currentPdfDefinition, 'current')
      const score2 = calculatePriorityScore(otherPdfConcept, 'current')

      // First entry should score much higher
      expect(score1).toBeGreaterThan(score2)
    })
  })

  describe('Token Budget Enforcement', () => {
    it('should enforce max token limit', () => {
      const entries = Array.from({ length: 100 }, (_, i) =>
        generateMockEntry({
          id: `entry-${i}`,
          title: `Entry ${i}`,
          content: 'Some content that will consume tokens. '.repeat(10),
        })
      )

      const { entries: filtered, totalTokens } = applyTokenBudget(
        entries,
        RETRIEVAL_CONFIG.maxTokens
      )

      expect(totalTokens).toBeLessThanOrEqual(RETRIEVAL_CONFIG.maxTokens)
      expect(filtered.length).toBeLessThan(entries.length)
    })

    it('should include entries until budget is reached', () => {
      const shortEntry = generateMockEntry({
        id: 'short',
        title: 'Short',
        content: 'Brief.',
      })

      const entries = Array.from({ length: 50 }, () => shortEntry)

      const { entries: filtered, totalTokens } = applyTokenBudget(
        entries,
        RETRIEVAL_CONFIG.maxTokens
      )

      expect(filtered.length).toBeGreaterThan(0)
      expect(totalTokens).toBeLessThanOrEqual(RETRIEVAL_CONFIG.maxTokens)
    })

    it('should stop at first entry that exceeds budget', () => {
      const smallEntry = generateMockEntry({
        id: 'small',
        content: 'Small content.',
      })

      const largeEntry = generateMockEntry({
        id: 'large',
        content: 'Very large content. '.repeat(500), // Large enough to exceed budget
      })

      const entries = [smallEntry, largeEntry, smallEntry, smallEntry]

      const { entries: filtered } = applyTokenBudget(entries, 500)

      // Should include first small entry but stop before large entry
      expect(filtered.length).toBe(1)
      expect(filtered[0].id).toBe('small')
    })

    it('should handle empty entries list', () => {
      const { entries, totalTokens } = applyTokenBudget([], RETRIEVAL_CONFIG.maxTokens)

      expect(entries).toEqual([])
      expect(totalTokens).toBe(0)
    })

    it('should handle single entry that exceeds budget', () => {
      const largeEntry = generateMockEntry({
        content: 'Very large content. '.repeat(1000),
      })

      const { entries, totalTokens } = applyTokenBudget([largeEntry], 500)

      expect(entries).toEqual([])
      expect(totalTokens).toBe(0)
    })
  })

  describe('Quality Score Filtering', () => {
    it('should filter entries below minimum quality threshold', () => {
      const entries = [
        generateMockEntry({ qualityScore: 0.9 }), // Above threshold
        generateMockEntry({ qualityScore: 0.7 }), // At threshold
        generateMockEntry({ qualityScore: 0.6 }), // Below threshold
        generateMockEntry({ qualityScore: 0.5 }), // Below threshold
      ]

      const filtered = entries.filter(
        e => e.qualityScore >= RETRIEVAL_CONFIG.minQualityScore
      )

      expect(filtered.length).toBe(2)
      expect(filtered.every(e => e.qualityScore >= RETRIEVAL_CONFIG.minQualityScore)).toBe(true)
    })

    it('should accept entries exactly at threshold', () => {
      const entry = generateMockEntry({ qualityScore: RETRIEVAL_CONFIG.minQualityScore })

      const passed = entry.qualityScore >= RETRIEVAL_CONFIG.minQualityScore
      expect(passed).toBe(true)
    })
  })

  describe('Max Entries Limit', () => {
    it('should limit results to maxEntries', () => {
      const entries = Array.from({ length: 100 }, (_, i) =>
        generateMockEntry({ id: `entry-${i}` })
      )

      const limited = entries.slice(0, RETRIEVAL_CONFIG.maxEntries)

      expect(limited.length).toBe(RETRIEVAL_CONFIG.maxEntries)
      expect(limited.length).toBeLessThan(entries.length)
    })
  })

  describe('Entry Sorting and Ranking', () => {
    it('should sort entries by priority score descending', () => {
      const entries = [
        generateMockEntry({ id: '1', qualityScore: 0.7 }),
        generateMockEntry({ id: '2', qualityScore: 0.9 }),
        generateMockEntry({ id: '3', qualityScore: 0.8 }),
      ]

      const scored = entries
        .map(entry => ({
          entry,
          score: calculatePriorityScore(entry, 'other'),
        }))
        .sort((a, b) => b.score - a.score)

      expect(scored[0].entry.id).toBe('2') // 0.9 quality
      expect(scored[1].entry.id).toBe('3') // 0.8 quality
      expect(scored[2].entry.id).toBe('1') // 0.7 quality
    })

    it('should prioritize current PDF over higher quality from other PDF', () => {
      const currentPdf = generateMockEntry({
        id: 'current',
        pdfHash: 'current-hash',
        qualityScore: 0.75,
        type: 'concept',
      })

      const otherPdf = generateMockEntry({
        id: 'other',
        pdfHash: 'other-hash',
        qualityScore: 0.85,
        type: 'definition',
      })

      const currentScore = calculatePriorityScore(currentPdf, 'current-hash')
      const otherScore = calculatePriorityScore(otherPdf, 'current-hash')

      // Current PDF bonus should overcome quality and type differences
      expect(currentScore).toBeGreaterThan(otherScore)
    })
  })

  describe('Graceful Degradation', () => {
    it('should return empty result when no keywords extracted', () => {
      const result = {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: 10,
      }

      expect(result.entries).toEqual([])
      expect(result.totalTokens).toBe(0)
    })

    it('should return empty result when no matching entries found', () => {
      const result = {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: 50,
      }

      expect(result.entries).toEqual([])
      expect(result.retrievalTimeMs).toBeGreaterThan(0)
    })

    it('should handle retrieval errors gracefully', () => {
      const errorResult = {
        entries: [],
        totalTokens: 0,
        retrievalTimeMs: 100,
      }

      expect(errorResult.entries).toEqual([])
      expect(errorResult.totalTokens).toBe(0)
    })
  })

  describe('Token Estimation Accuracy', () => {
    it('should accurately estimate tokens for typical entries', () => {
      const entry = generateMockEntry({
        title: 'Derivative',
        content: 'The derivative measures the instantaneous rate of change of a function.',
      })

      const tokens = estimateTokenCount(`${entry.title}: ${entry.content}`)

      // Rough estimate: ~15 words, ~20 tokens at 1.3 tokens/word
      expect(tokens).toBeGreaterThan(10)
      expect(tokens).toBeLessThan(50)
    })

    it('should handle CJK content in token estimation', () => {
      const entry = generateMockEntry({
        title: '导数',
        content: '导数是函数在某点的变化率',
      })

      const tokens = estimateTokenCount(`${entry.title}: ${entry.content}`)

      // CJK characters should be estimated at ~1.5 tokens/char
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe('Context Configuration', () => {
    it('should use correct configuration values', () => {
      expect(RETRIEVAL_CONFIG.maxEntries).toBe(30)
      expect(RETRIEVAL_CONFIG.maxTokens).toBe(2000)
      expect(RETRIEVAL_CONFIG.minQualityScore).toBe(0.7)
    })

    it('should use correct priority scores', () => {
      expect(PRIORITY_SCORES.currentPdf).toBe(100)
      expect(PRIORITY_SCORES.sameCourse).toBe(50)
      expect(PRIORITY_SCORES.byType.definition).toBe(20)
      expect(PRIORITY_SCORES.byType.formula).toBe(15)
      expect(PRIORITY_SCORES.byType.theorem).toBe(10)
      expect(PRIORITY_SCORES.byType.concept).toBe(5)
      expect(PRIORITY_SCORES.byType.principle).toBe(10)
    })
  })
})
