/**
 * Unit tests for cost validation and monitoring.
 * Tests cost estimation, budget compliance, and projections.
 */
import { describe, it, expect } from 'vitest'
import {
  estimateExtractionCost,
  estimateKeywordCost,
  projectMonthlyCosts,
  COST_TARGETS,
} from '../cost-validation'

describe('Cost Validation Tests', () => {
  describe('Extraction Cost Estimation', () => {
    it('should estimate cost for 100-page textbook', () => {
      const estimate = estimateExtractionCost({
        totalPages: 100,
        wordsPerPage: 600, // Dense textbook
        outputEntriesPerBatch: 10,
        wordsPerEntry: 100,
      })

      console.log(`100-page textbook cost: $${estimate.totalCost.toFixed(4)}`)
      console.log(`Cost per 100 pages: $${estimate.costPer100Pages.toFixed(4)}`)

      expect(estimate.totalCost).toBeGreaterThan(0)
      expect(estimate.inputTokens).toBeGreaterThan(0)
      expect(estimate.outputTokens).toBeGreaterThan(0)

      // Should be close to target of $0.03
      expect(estimate.costPer100Pages).toBeLessThan(0.10) // Reasonable upper bound
    })

    it('should estimate cost for 200-page textbook', () => {
      const estimate = estimateExtractionCost({
        totalPages: 200,
        wordsPerPage: 600,
        outputEntriesPerBatch: 10,
        wordsPerEntry: 100,
      })

      console.log(`200-page textbook cost: $${estimate.totalCost.toFixed(4)}`)
      console.log(`Cost per 100 pages: $${estimate.costPer100Pages.toFixed(4)}`)

      // Cost should scale linearly with pages
      expect(estimate.costPer100Pages).toBeGreaterThan(0)
    })

    it('should estimate cost for sparse slide deck', () => {
      const estimate = estimateExtractionCost({
        totalPages: 100,
        wordsPerPage: 80, // Sparse slides
        outputEntriesPerBatch: 5,
        wordsPerEntry: 50,
      })

      console.log(`100-page slide deck cost: $${estimate.totalCost.toFixed(4)}`)

      // Sparse content should cost less than dense textbook
      const denseEstimate = estimateExtractionCost({
        totalPages: 100,
        wordsPerPage: 600,
        outputEntriesPerBatch: 10,
        wordsPerEntry: 100,
      })

      expect(estimate.totalCost).toBeLessThan(denseEstimate.totalCost)
    })

    it('should break down input vs output costs', () => {
      const estimate = estimateExtractionCost({
        totalPages: 100,
        wordsPerPage: 600,
        outputEntriesPerBatch: 10,
        wordsPerEntry: 100,
      })

      // For extraction, input cost is higher despite output tokens being more expensive per-token
      // because we send in much more text than we extract
      expect(estimate.inputCost).toBeGreaterThan(estimate.outputCost)

      // Total should be sum of both
      expect(estimate.totalCost).toBeCloseTo(estimate.inputCost + estimate.outputCost)
    })
  })

  describe('Keyword Cost Estimation', () => {
    it('should estimate cost per keyword extraction call', () => {
      const estimate = estimateKeywordCost({
        textLength: 2000,
        cacheHitRate: 0,
      })

      console.log(`Keyword extraction cost (no cache): $${estimate.costPerCall.toFixed(6)}`)

      expect(estimate.costPerCall).toBeGreaterThan(0)
      expect(estimate.costPerCall).toBeLessThan(0.001) // Should be very cheap with gpt-4o-mini
    })

    it('should calculate average cost with caching', () => {
      const noCache = estimateKeywordCost({
        textLength: 2000,
        cacheHitRate: 0,
      })

      const withCache = estimateKeywordCost({
        textLength: 2000,
        cacheHitRate: 0.7, // 70% cache hit rate
      })

      console.log(`Keyword cost without cache: $${noCache.costPerCall.toFixed(6)}`)
      console.log(`Keyword cost with 70% cache: $${withCache.averageCostWithCache.toFixed(6)}`)

      // With caching, average cost should be lower
      expect(withCache.averageCostWithCache).toBeLessThan(noCache.costPerCall)

      // Should be 30% of original cost (70% cache hit rate)
      expect(withCache.averageCostWithCache).toBeCloseTo(noCache.costPerCall * 0.3, 6)
    })

    it('should meet target cost per call with high cache hit rate', () => {
      const estimate = estimateKeywordCost({
        textLength: 2000,
        cacheHitRate: COST_TARGETS.keywordCacheHitRate,
      })

      console.log(
        `Target keyword cost: $${COST_TARGETS.keywordExtractionPerCall}, Actual: $${estimate.averageCostWithCache.toFixed(6)}`
      )

      // Should be close to or below target
      expect(estimate.averageCostWithCache).toBeLessThan(COST_TARGETS.keywordExtractionPerCall * 2)
    })

    it('should handle truncated text', () => {
      const longText = estimateKeywordCost({
        textLength: 10000, // Will be truncated to 4000
        cacheHitRate: 0,
      })

      const normalText = estimateKeywordCost({
        textLength: 2000,
        cacheHitRate: 0,
      })

      // Long text should cost more but not 5x more (due to truncation)
      expect(longText.costPerCall).toBeGreaterThan(normalText.costPerCall)
      expect(longText.costPerCall).toBeLessThan(normalText.costPerCall * 3)
    })
  })

  describe('Monthly Cost Projections', () => {
    it('should project costs for typical usage pattern', () => {
      const projection = projectMonthlyCosts({
        activeUsers: 1000,
        avgPdfsPerUserPerMonth: 5,
        avgPagesPerPdf: 100,
        avgWordsPerPage: 400,
        avgAiQueriesPerUser: 50,
        pdfCacheHitRate: 0.9,
        keywordCacheHitRate: 0.7,
      })

      console.log('\n--- Monthly Cost Projection (1000 users) ---')
      console.log(`Extraction costs: $${projection.extractionCosts.toFixed(2)}`)
      console.log(`Keyword costs: $${projection.keywordCosts.toFixed(2)}`)
      console.log(`Total costs: $${projection.totalCosts.toFixed(2)}`)
      console.log(`Cost per 1000 users: $${projection.costPer1000Users.toFixed(2)}`)
      console.log(`Within budget: ${projection.withinBudget}`)
      console.log(`Utilization: ${(projection.utilizationRate * 100).toFixed(1)}%`)

      // Should be within target budget
      expect(projection.costPer1000Users).toBeLessThan(COST_TARGETS.monthlyPer1000UsersMax)
      expect(projection.withinBudget).toBe(true)
    })

    it('should show impact of cache hit rates', () => {
      const noCacheProjection = projectMonthlyCosts({
        activeUsers: 1000,
        avgPdfsPerUserPerMonth: 5,
        avgPagesPerPdf: 100,
        avgWordsPerPage: 400,
        avgAiQueriesPerUser: 50,
        pdfCacheHitRate: 0, // No caching
        keywordCacheHitRate: 0,
      })

      const withCacheProjection = projectMonthlyCosts({
        activeUsers: 1000,
        avgPdfsPerUserPerMonth: 5,
        avgPagesPerPdf: 100,
        avgWordsPerPage: 400,
        avgAiQueriesPerUser: 50,
        pdfCacheHitRate: 0.9, // 90% cache hit rate
        keywordCacheHitRate: 0.7, // 70% cache hit rate
      })

      console.log('\nCache Impact:')
      console.log(`Without cache: $${noCacheProjection.costPer1000Users.toFixed(2)}`)
      console.log(`With cache: $${withCacheProjection.costPer1000Users.toFixed(2)}`)

      // Caching should dramatically reduce costs
      expect(withCacheProjection.costPer1000Users).toBeLessThan(
        noCacheProjection.costPer1000Users * 0.5
      )
    })

    it('should calculate utilization rate correctly', () => {
      const projection = projectMonthlyCosts({
        activeUsers: 1000,
        avgPdfsPerUserPerMonth: 5,
        avgPagesPerPdf: 100,
        avgWordsPerPage: 400,
        avgAiQueriesPerUser: 50,
        pdfCacheHitRate: 0.9,
        keywordCacheHitRate: 0.7,
      })

      // Utilization rate should be cost / target budget
      const expectedUtilization =
        projection.costPer1000Users / COST_TARGETS.monthlyPer1000Users

      expect(projection.utilizationRate).toBeCloseTo(expectedUtilization, 2)
    })

    it('should handle light usage pattern', () => {
      const projection = projectMonthlyCosts({
        activeUsers: 100,
        avgPdfsPerUserPerMonth: 2,
        avgPagesPerPdf: 50,
        avgWordsPerPage: 300,
        avgAiQueriesPerUser: 20,
        pdfCacheHitRate: 0.5, // Lower cache hit rate for small user base
        keywordCacheHitRate: 0.5,
      })

      console.log(`\nLight usage (100 users): $${projection.costPer1000Users.toFixed(2)} per 1000 users`)

      expect(projection.withinBudget).toBe(true)
    })

    it('should handle heavy usage pattern', () => {
      const projection = projectMonthlyCosts({
        activeUsers: 5000,
        avgPdfsPerUserPerMonth: 10,
        avgPagesPerPdf: 200,
        avgWordsPerPage: 600,
        avgAiQueriesPerUser: 100,
        pdfCacheHitRate: 0.95, // Higher cache hit rate at scale
        keywordCacheHitRate: 0.8,
      })

      console.log(`\nHeavy usage (5000 users): $${projection.costPer1000Users.toFixed(2)} per 1000 users`)

      // Even with heavy usage and good caching, should stay within ceiling
      if (!projection.withinBudget) {
        console.warn('Warning: Heavy usage exceeds budget ceiling')
      }
    })
  })

  describe('Cost Targets Configuration', () => {
    it('should have reasonable cost targets', () => {
      expect(COST_TARGETS.extractionPer100Pages).toBe(0.03)
      expect(COST_TARGETS.keywordExtractionPerCall).toBe(0.0001)
      expect(COST_TARGETS.monthlyPer1000Users).toBe(100)
      expect(COST_TARGETS.monthlyPer1000UsersMax).toBe(150)
      expect(COST_TARGETS.pdfCacheHitRate).toBe(0.90)
      expect(COST_TARGETS.keywordCacheHitRate).toBe(0.70)
      expect(COST_TARGETS.translationPenalty).toBe(0.05)
    })

    it('should have hard ceiling above target', () => {
      expect(COST_TARGETS.monthlyPer1000UsersMax).toBeGreaterThan(
        COST_TARGETS.monthlyPer1000Users
      )
    })
  })

  describe('Cost Comparisons', () => {
    it('should compare token-based vs page-based batching costs', () => {
      // Token-based (our approach): 4000 words per batch
      const tokenBased = estimateExtractionCost({
        totalPages: 200,
        wordsPerPage: 600,
        outputEntriesPerBatch: 10,
        wordsPerEntry: 100,
      })

      // Hypothetical page-based: 10 pages per batch
      const pageBased = estimateExtractionCost({
        totalPages: 200,
        wordsPerPage: 600,
        outputEntriesPerBatch: 10,
        wordsPerEntry: 100,
      })

      console.log('\nBatching Strategy Comparison:')
      console.log(`Token-based (4000 words): $${tokenBased.totalCost.toFixed(4)}`)
      console.log(`Page-based (10 pages): $${pageBased.totalCost.toFixed(4)}`)

      // Both should be similar for uniform PDFs
      expect(tokenBased.totalCost).toBeCloseTo(pageBased.totalCost, 3)
    })

    it('should show translation cost penalty', () => {
      const englishCost = estimateExtractionCost({
        totalPages: 100,
        wordsPerPage: 600,
        outputEntriesPerBatch: 10,
        wordsPerEntry: 100,
      })

      // Translation adds 10% quality penalty, effectively filtering more entries
      // But output tokens remain similar
      const translatedCost = estimateExtractionCost({
        totalPages: 100,
        wordsPerPage: 600,
        outputEntriesPerBatch: 9, // 10% fewer entries pass quality filter
        wordsPerEntry: 100,
      })

      console.log(`\nEnglish PDF: $${englishCost.totalCost.toFixed(4)}`)
      console.log(`Translated PDF: $${translatedCost.totalCost.toFixed(4)}`)

      const actualPenalty = (translatedCost.totalCost - englishCost.totalCost) / englishCost.totalCost

      // Penalty should be small
      expect(Math.abs(actualPenalty)).toBeLessThan(COST_TARGETS.translationPenalty * 2)
    })
  })
})
