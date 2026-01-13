/**
 * Performance tests for extraction worker and batch processing.
 * Tests extraction time, deduplication overhead, and database performance.
 */
import { describe, it, expect } from 'vitest'
import { estimateWordCount, calculateBatchStrategy, normalizeTitle } from '../utils'
import { BATCH_CONFIG } from '../types'

describe('Extraction Performance Tests', () => {
  describe('Batch Strategy Performance', () => {
    it('should calculate batch strategy for dense textbook quickly', () => {
      const startTime = performance.now()

      const strategy = calculateBatchStrategy(200, 6000, 10) // 600 words/page

      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(5) // Should be near-instant
      expect(strategy.avgWordsPerPage).toBe(600)
      expect(strategy.estimatedTotalWords).toBe(120000)
    })

    it('should calculate batch strategy for sparse slide deck quickly', () => {
      const startTime = performance.now()

      const strategy = calculateBatchStrategy(100, 800, 10) // 80 words/page

      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(5)
      expect(strategy.avgWordsPerPage).toBe(80)
      expect(strategy.estimatedTotalWords).toBe(8000)
    })

    it('should handle large PDFs efficiently', () => {
      const startTime = performance.now()

      const strategy = calculateBatchStrategy(500, 30000, 50) // 600 words/page, 50 sample pages

      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(10)
      expect(strategy.estimatedTotalWords).toBe(300000)
    })
  })

  describe('Word Count Estimation Performance', () => {
    it('should count words in typical page text quickly', () => {
      const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100)

      const startTime = performance.now()
      const count = estimateWordCount(text)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(5)
      expect(count).toBeGreaterThan(0)
    })

    it('should handle CJK text efficiently', () => {
      const text = '导数是函数在某点的变化率。这是一个数学概念。'.repeat(50)

      const startTime = performance.now()
      const count = estimateWordCount(text)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(10)
      expect(count).toBeGreaterThan(0)
    })

    it('should handle very long text (100k chars) efficiently', () => {
      const text = 'word '.repeat(20000) // ~100k characters

      const startTime = performance.now()
      const count = estimateWordCount(text)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(50) // Should complete in under 50ms
      expect(count).toBeCloseTo(20000, -2) // Approximately 20k words
    })
  })

  describe('Deduplication Performance', () => {
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
        const best = group.reduce((a: T, b: T) => (a.qualityScore > b.qualityScore ? a : b))
        deduplicated.push(best)
      })

      return deduplicated
    }

    it('should deduplicate small batch (<50 entries) quickly', () => {
      const entries = Array.from({ length: 50 }, (_, i) => ({
        id: `entry-${i}`,
        title: `Entry ${i % 10}`, // 5x duplication
        qualityScore: 0.7 + Math.random() * 0.3,
      }))

      const startTime = performance.now()
      const deduplicated = deduplicateWithinBatch(entries)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(10) // Should complete in <10ms
      expect(deduplicated.length).toBe(10)
    })

    it('should deduplicate medium batch (~100 entries) with <50ms overhead', () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        id: `entry-${i}`,
        title: `Entry ${i % 20}`,
        qualityScore: 0.7 + Math.random() * 0.3,
      }))

      const startTime = performance.now()
      const deduplicated = deduplicateWithinBatch(entries)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(50)
      expect(deduplicated.length).toBe(20)
      console.log(`Deduplication (100 entries): ${duration.toFixed(2)}ms`)
    })

    it('should deduplicate large batch (~500 entries) with <100ms overhead', () => {
      const entries = Array.from({ length: 500 }, (_, i) => ({
        id: `entry-${i}`,
        title: `Entry ${i % 50}`,
        qualityScore: 0.7 + Math.random() * 0.3,
      }))

      const startTime = performance.now()
      const deduplicated = deduplicateWithinBatch(entries)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(100)
      expect(deduplicated.length).toBe(50)
      console.log(`Deduplication (500 entries): ${duration.toFixed(2)}ms`)
    })
  })

  describe('Batch Processing Simulation', () => {
    it('should simulate batch processing for 100-page slide deck', () => {
      // Slide deck: 100 pages, ~80 words/page = 8k words total
      const totalPages = 100
      const wordsPerPage = 80
      const totalWords = totalPages * wordsPerPage

      const strategy = calculateBatchStrategy(totalPages, wordsPerPage * 10, 10)

      // Estimate processing time based on batch count
      const batchesNeeded = Math.ceil(totalWords / BATCH_CONFIG.targetWordsPerBatch)
      const estimatedTimeSeconds = batchesNeeded * 10 // ~10 seconds per batch

      console.log(`100-page slide deck: ${batchesNeeded} batches, estimated ${estimatedTimeSeconds}s`)

      // Target: <1 minute (60 seconds)
      expect(estimatedTimeSeconds).toBeLessThan(60)
    })

    it('should simulate batch processing for 200-page textbook', () => {
      // Textbook: 200 pages, ~600 words/page = 120k words total
      const totalPages = 200
      const wordsPerPage = 600
      const totalWords = totalPages * wordsPerPage

      const strategy = calculateBatchStrategy(totalPages, wordsPerPage * 10, 10)

      const batchesNeeded = Math.ceil(totalWords / BATCH_CONFIG.targetWordsPerBatch)
      const estimatedTimeSeconds = batchesNeeded * 10 // ~10 seconds per batch

      console.log(`200-page textbook: ${batchesNeeded} batches, estimated ${estimatedTimeSeconds}s`)

      // Target: under 6 minutes (360 seconds) for 200-page textbook
      expect(estimatedTimeSeconds).toBeLessThan(360)
      expect(batchesNeeded).toBeGreaterThan(0)
    })

    it('should compare dense vs sparse PDF batching', () => {
      // Dense textbook
      const denseStrategy = calculateBatchStrategy(200, 6000, 10) // 600 words/page
      const denseBatches = Math.ceil(denseStrategy.estimatedTotalWords / BATCH_CONFIG.targetWordsPerBatch)

      // Sparse slides
      const sparseStrategy = calculateBatchStrategy(200, 800, 10) // 80 words/page
      const sparseBatches = Math.ceil(sparseStrategy.estimatedTotalWords / BATCH_CONFIG.targetWordsPerBatch)

      console.log(`Dense PDF (600 w/p): ${denseBatches} batches`)
      console.log(`Sparse PDF (80 w/p): ${sparseBatches} batches`)

      // Dense should require more batches
      expect(denseBatches).toBeGreaterThan(sparseBatches)
      expect(denseStrategy.estimatedTotalWords).toBeGreaterThan(sparseStrategy.estimatedTotalWords)
    })
  })

  describe('Title Normalization Performance', () => {
    it('should normalize titles quickly in bulk', () => {
      const titles = Array.from({ length: 1000 }, (_, i) => `  Title ${i}  `)

      const startTime = performance.now()
      const normalized = titles.map(t => normalizeTitle(t))
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(50) // Should complete in <50ms
      expect(normalized.length).toBe(1000)
      expect(normalized[0]).toBe('title 0')
    })

    it('should handle complex titles efficiently', () => {
      const titles = Array.from(
        { length: 500 },
        (_, i) => `  Complex   Title   with   Spaces   ${i}  `
      )

      const startTime = performance.now()
      const normalized = titles.map(t => normalizeTitle(t))
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(30)
      expect(normalized.every(t => !t.match(/\s{2,}/))).toBe(true) // No multiple spaces
    })
  })

  describe('Memory Usage Considerations', () => {
    it('should handle large entry arrays without excessive memory', () => {
      // Create 10k entries
      const entries = Array.from({ length: 10000 }, (_, i) => ({
        id: `entry-${i}`,
        title: `Entry ${i}`,
        content: 'Content '.repeat(50),
        qualityScore: 0.8,
      }))

      const memBefore = process.memoryUsage().heapUsed

      // Process entries
      const processed = entries.filter(e => e.qualityScore >= 0.7)

      const memAfter = process.memoryUsage().heapUsed
      const memDelta = (memAfter - memBefore) / 1024 / 1024 // MB

      console.log(`Memory delta for 10k entries: ${memDelta.toFixed(2)}MB`)

      expect(processed.length).toBe(10000)
      expect(memDelta).toBeLessThan(100) // Should not use excessive memory
    })
  })

  describe('Batch Configuration Validation', () => {
    it('should have reasonable batch configuration values', () => {
      expect(BATCH_CONFIG.minWordsPerBatch).toBe(2000)
      expect(BATCH_CONFIG.targetWordsPerBatch).toBe(4000)
      expect(BATCH_CONFIG.maxWordsPerBatch).toBe(6000)
      expect(BATCH_CONFIG.samplePages).toBe(10)

      // Target should be between min and max
      expect(BATCH_CONFIG.targetWordsPerBatch).toBeGreaterThanOrEqual(BATCH_CONFIG.minWordsPerBatch)
      expect(BATCH_CONFIG.targetWordsPerBatch).toBeLessThanOrEqual(BATCH_CONFIG.maxWordsPerBatch)
    })
  })
})

describe('Real-World Extraction Simulations', () => {
  it('should simulate extraction for typical calculus textbook', () => {
    // Typical calculus textbook: 800 pages, ~600 words/page
    const pages = 800
    const wordsPerPage = 600
    const totalWords = pages * wordsPerPage // 480k words

    const strategy = calculateBatchStrategy(pages, wordsPerPage * 10, 10)
    const batches = Math.ceil(totalWords / BATCH_CONFIG.targetWordsPerBatch)

    console.log(`Calculus textbook (${pages} pages):`)
    console.log(`- Total words: ${totalWords.toLocaleString()}`)
    console.log(`- Batches: ${batches}`)
    console.log(`- Estimated time: ${(batches * 10 / 60).toFixed(1)} minutes`)

    expect(batches).toBeGreaterThan(100)
  })

  it('should simulate extraction for lecture slide deck', () => {
    // Lecture slides: 50 pages, ~100 words/page
    const pages = 50
    const wordsPerPage = 100
    const totalWords = pages * wordsPerPage // 5k words

    const strategy = calculateBatchStrategy(pages, wordsPerPage * 10, 10)
    const batches = Math.ceil(totalWords / BATCH_CONFIG.targetWordsPerBatch)

    console.log(`Lecture slides (${pages} pages):`)
    console.log(`- Total words: ${totalWords.toLocaleString()}`)
    console.log(`- Batches: ${batches}`)
    console.log(`- Estimated time: ${batches * 10} seconds`)

    expect(batches).toBeLessThanOrEqual(2)
  })
})
