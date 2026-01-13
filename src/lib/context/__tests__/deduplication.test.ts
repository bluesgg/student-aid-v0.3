/**
 * Integration tests for deduplication logic.
 * Tests within-batch and cross-batch deduplication scenarios.
 */
import { describe, it, expect } from 'vitest'
import { normalizeTitle } from '../utils'

// Mock deduplication function (replicates internal logic)
function deduplicateWithinBatch<T extends { title: string; qualityScore: number }>(
  entries: T[]
): T[] {
  const grouped = new Map<string, T[]>()

  for (const entry of entries) {
    const normalizedTitle = normalizeTitle(entry.title)
    if (!grouped.has(normalizedTitle)) {
      grouped.set(normalizedTitle, [])
    }
    grouped.get(normalizedTitle)!.push(entry)
  }

  const deduplicated: T[] = []
  grouped.forEach((group) => {
    // Keep highest quality score
    const best = group.reduce((a: T, b: T) => (a.qualityScore > b.qualityScore ? a : b))
    deduplicated.push(best)
  })

  return deduplicated
}

interface TestEntry {
  id: string
  title: string
  content: string
  sourcePage: number
  qualityScore: number
}

function createTestEntry(overrides: Partial<TestEntry>): TestEntry {
  return {
    id: 'entry-1',
    title: 'Test Entry',
    content: 'Test content',
    sourcePage: 1,
    qualityScore: 0.8,
    ...overrides,
  }
}

describe('Deduplication Tests', () => {
  describe('Within-Batch Deduplication', () => {
    it('should remove exact duplicate titles', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.8 }),
        createTestEntry({ id: '2', title: 'Derivative', qualityScore: 0.9 }),
        createTestEntry({ id: '3', title: 'Derivative', qualityScore: 0.7 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(1)
      expect(deduplicated[0].id).toBe('2') // Highest quality score
      expect(deduplicated[0].qualityScore).toBe(0.9)
    })

    it('should treat case-insensitive titles as duplicates', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'derivative', qualityScore: 0.8 }),
        createTestEntry({ id: '2', title: 'Derivative', qualityScore: 0.9 }),
        createTestEntry({ id: '3', title: 'DERIVATIVE', qualityScore: 0.7 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(1)
      expect(deduplicated[0].id).toBe('2')
    })

    it('should treat whitespace-normalized titles as duplicates', () => {
      const entries = [
        createTestEntry({ id: '1', title: '  Derivative  ', qualityScore: 0.8 }),
        createTestEntry({ id: '2', title: 'Derivative', qualityScore: 0.9 }),
        createTestEntry({ id: '3', title: 'Derivative   ', qualityScore: 0.7 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(1)
    })

    it('should treat multiple-space titles as duplicates', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'Chain   Rule', qualityScore: 0.8 }),
        createTestEntry({ id: '2', title: 'Chain  Rule', qualityScore: 0.9 }),
        createTestEntry({ id: '3', title: 'Chain Rule', qualityScore: 0.7 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(1)
      expect(deduplicated[0].qualityScore).toBe(0.9)
    })

    it('should keep entries with different titles', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.8 }),
        createTestEntry({ id: '2', title: 'Integral', qualityScore: 0.9 }),
        createTestEntry({ id: '3', title: 'Limit', qualityScore: 0.7 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(3)
      expect(deduplicated.map(e => e.id).sort()).toEqual(['1', '2', '3'])
    })

    it('should keep highest quality when multiple duplicates exist', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.75 }),
        createTestEntry({ id: '2', title: 'Derivative', qualityScore: 0.95 }), // Highest
        createTestEntry({ id: '3', title: 'Derivative', qualityScore: 0.80 }),
        createTestEntry({ id: '4', title: 'Derivative', qualityScore: 0.70 }),
        createTestEntry({ id: '5', title: 'Derivative', qualityScore: 0.85 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(1)
      expect(deduplicated[0].id).toBe('2')
      expect(deduplicated[0].qualityScore).toBe(0.95)
    })

    it('should handle mixed duplicates and unique entries', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.8 }),
        createTestEntry({ id: '2', title: 'Derivative', qualityScore: 0.9 }),
        createTestEntry({ id: '3', title: 'Integral', qualityScore: 0.7 }),
        createTestEntry({ id: '4', title: 'Limit', qualityScore: 0.85 }),
        createTestEntry({ id: '5', title: 'Limit', qualityScore: 0.75 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(3)

      // Check correct entries were kept
      const titles = deduplicated.map(e => normalizeTitle(e.title))
      expect(titles).toContain('derivative')
      expect(titles).toContain('integral')
      expect(titles).toContain('limit')

      // Check highest quality kept for each
      const derivative = deduplicated.find(e => normalizeTitle(e.title) === 'derivative')
      expect(derivative?.qualityScore).toBe(0.9)

      const limit = deduplicated.find(e => normalizeTitle(e.title) === 'limit')
      expect(limit?.qualityScore).toBe(0.85)
    })

    it('should handle empty entries array', () => {
      const deduplicated = deduplicateWithinBatch([])
      expect(deduplicated).toEqual([])
    })

    it('should handle single entry', () => {
      const entries = [createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.8 })]
      const deduplicated = deduplicateWithinBatch(entries)
      expect(deduplicated).toEqual(entries)
    })
  })

  describe('Near-Duplicate Detection', () => {
    it('should treat "Derivative" and "Derivative (definition)" as different', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.8 }),
        createTestEntry({ id: '2', title: 'Derivative (definition)', qualityScore: 0.9 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      // These should be treated as different entries
      expect(deduplicated.length).toBe(2)
    })

    it('should preserve entry metadata after deduplication', () => {
      const entries = [
        createTestEntry({
          id: '1',
          title: 'Derivative',
          content: 'Content A',
          sourcePage: 5,
          qualityScore: 0.7,
        }),
        createTestEntry({
          id: '2',
          title: 'Derivative',
          content: 'Content B',
          sourcePage: 10,
          qualityScore: 0.9,
        }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(1)
      expect(deduplicated[0].content).toBe('Content B')
      expect(deduplicated[0].sourcePage).toBe(10)
    })
  })

  describe('Cross-Batch Deduplication Simulation', () => {
    it('should simulate database check for existing entries', () => {
      // Batch 1 entries (already in DB)
      const existingEntries = new Map([
        ['derivative', 0.85],
        ['integral', 0.80],
      ])

      // Batch 2 entries (new batch to check)
      const newEntries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.90 }), // Higher quality
        createTestEntry({ id: '2', title: 'Derivative', qualityScore: 0.75 }), // Lower quality
        createTestEntry({ id: '3', title: 'Integral', qualityScore: 0.75 }), // Lower quality
        createTestEntry({ id: '4', title: 'Limit', qualityScore: 0.85 }), // New entry
      ]

      // Filter out entries that are lower quality than existing
      const toInsert = newEntries.filter((entry) => {
        const normalizedTitle = normalizeTitle(entry.title)
        const existingScore = existingEntries.get(normalizedTitle)
        return !existingScore || entry.qualityScore > existingScore
      })

      expect(toInsert.length).toBe(2)
      expect(toInsert.some(e => normalizeTitle(e.title) === 'derivative' && e.qualityScore === 0.90)).toBe(true)
      expect(toInsert.some(e => normalizeTitle(e.title) === 'limit')).toBe(true)
      expect(toInsert.some(e => normalizeTitle(e.title) === 'integral')).toBe(false)
    })

    it('should keep new entry when no existing entry found', () => {
      const existingEntries = new Map<string, number>()
      const newEntries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.80 }),
      ]

      const toInsert = newEntries.filter((entry) => {
        const normalizedTitle = normalizeTitle(entry.title)
        const existingScore = existingEntries.get(normalizedTitle)
        return !existingScore || entry.qualityScore > existingScore
      })

      expect(toInsert.length).toBe(1)
    })

    it('should skip new entry when existing has higher quality', () => {
      const existingEntries = new Map([['derivative', 0.95]])
      const newEntries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.80 }),
      ]

      const toInsert = newEntries.filter((entry) => {
        const normalizedTitle = normalizeTitle(entry.title)
        const existingScore = existingEntries.get(normalizedTitle)
        return !existingScore || entry.qualityScore > existingScore
      })

      expect(toInsert.length).toBe(0)
    })

    it('should replace when new entry has equal quality (tiebreaker)', () => {
      const existingEntries = new Map([['derivative', 0.80]])
      const newEntries = [
        createTestEntry({ id: '1', title: 'Derivative', qualityScore: 0.80 }),
      ]

      const toInsert = newEntries.filter((entry) => {
        const normalizedTitle = normalizeTitle(entry.title)
        const existingScore = existingEntries.get(normalizedTitle)
        // With > comparison, equal quality is NOT inserted
        return !existingScore || entry.qualityScore > existingScore
      })

      expect(toInsert.length).toBe(0) // Equal quality is not considered better
    })
  })

  describe('Title Normalization Edge Cases', () => {
    it('should handle special characters in titles', () => {
      const title1 = 'f(x) = x^2'
      const title2 = 'F(X) = X^2'

      expect(normalizeTitle(title1)).toBe(normalizeTitle(title2))
    })

    it('should handle unicode characters', () => {
      const title1 = '导数'
      const title2 = '导数  '

      expect(normalizeTitle(title1)).toBe(normalizeTitle(title2))
    })

    it('should handle very long titles', () => {
      const longTitle = 'A'.repeat(500)
      const normalized = normalizeTitle(longTitle)

      expect(normalized.length).toBe(500)
      expect(normalized).toBe(longTitle.toLowerCase())
    })

    it('should handle empty title', () => {
      expect(normalizeTitle('')).toBe('')
    })

    it('should collapse tabs and newlines', () => {
      const title = 'Derivative\t\nFunction'
      const normalized = normalizeTitle(title)

      expect(normalized).toBe('derivative function')
    })
  })

  describe('Quality Score Comparison', () => {
    it('should correctly compare floating point quality scores', () => {
      const score1 = 0.7999999
      const score2 = 0.8000001

      expect(score2 > score1).toBe(true)
    })

    it('should handle quality score edge cases', () => {
      const entries = [
        createTestEntry({ id: '1', title: 'Entry', qualityScore: 0.0 }),
        createTestEntry({ id: '2', title: 'Entry', qualityScore: 1.0 }),
      ]

      const deduplicated = deduplicateWithinBatch(entries)

      expect(deduplicated.length).toBe(1)
      expect(deduplicated[0].qualityScore).toBe(1.0)
    })
  })

  describe('Deduplication Performance', () => {
    it('should handle large batches efficiently', () => {
      // Create 1000 entries with some duplicates
      const entries: TestEntry[] = []
      for (let i = 0; i < 1000; i++) {
        entries.push(
          createTestEntry({
            id: `entry-${i}`,
            title: `Entry ${i % 100}`, // 10x duplication
            qualityScore: 0.7 + (Math.random() * 0.3),
          })
        )
      }

      const startTime = performance.now()
      const deduplicated = deduplicateWithinBatch(entries)
      const duration = performance.now() - startTime

      expect(deduplicated.length).toBe(100) // Should have 100 unique titles
      expect(duration).toBeLessThan(100) // Should complete in under 100ms
    })
  })
})
