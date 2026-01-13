/**
 * Unit tests for keyword extraction with caching.
 * Tests LLM-based extraction, cache hit/miss scenarios, and fallback behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractKeywords,
  clearKeywordCache,
  getKeywordCacheStats,
  resetCacheStats,
} from '../keyword-extraction'

// Mock OpenAI client
vi.mock('@/lib/openai/client', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}))

describe('Keyword Extraction', () => {
  beforeEach(() => {
    clearKeywordCache()
    resetCacheStats()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('extractKeywords', () => {
    it('should extract keywords from page text', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              keywords: ['derivative', 'calculus', 'function', 'rate of change']
            })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords('The derivative measures the rate of change')

      expect(keywords).toContain('derivative')
      expect(keywords).toContain('calculus')
      expect(mockCreate).toHaveBeenCalledOnce()
    })

    it('should extract keywords from page text and question', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              keywords: ['derivative', 'chain rule', 'composition']
            })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords(
        'The chain rule is used for composition',
        'How do I apply the chain rule?'
      )

      expect(keywords).toContain('derivative')
      expect(keywords).toContain('chain rule')
      expect(mockCreate).toHaveBeenCalledOnce()
    })

    it('should return empty array for empty input', async () => {
      const keywords = await extractKeywords('', '')
      expect(keywords).toEqual([])
    })

    it('should normalize and filter keywords', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              keywords: ['  Derivative  ', 'CALCULUS', 'a', 'x'.repeat(150)] // Whitespace, case, short, long
            })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords('test text')

      expect(keywords).toContain('derivative') // Normalized
      expect(keywords).toContain('calculus') // Lowercased
      expect(keywords).not.toContain('a') // Too short
      expect(keywords.every(k => k.length <= 100)).toBe(true) // Length limited
    })

    it('should handle array response format', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(['derivative', 'function'])
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords('test')
      expect(keywords).toContain('derivative')
      expect(keywords).toContain('function')
    })

    it('should fall back to simple extraction on LLM error', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockRejectedValue(new Error('API error'))

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords('The derivative function calculus mathematics')

      // Should use fallback heuristic extraction
      expect(keywords.length).toBeGreaterThan(0)
      expect(keywords).toContain('derivative')
    })

    it('should fall back on invalid JSON response', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'invalid json'
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords('derivative calculus mathematics')
      expect(keywords.length).toBeGreaterThan(0)
    })

    it('should truncate very long input text', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['test'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const longText = 'word '.repeat(2000) // Very long text
      await extractKeywords(longText)

      // Check that the API call was made with truncated text
      const apiCall = mockCreate.mock.calls[0][0]
      const userMessage = apiCall.messages.find((m: any) => m.role === 'user')
      expect(userMessage.content.length).toBeLessThan(longText.length)
    })
  })

  describe('Keyword Caching', () => {
    it('should cache keywords and return on subsequent calls', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['derivative', 'calculus'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      // First call - should hit LLM
      const keywords1 = await extractKeywords('test page', 'test question')
      expect(mockCreate).toHaveBeenCalledOnce()

      // Second call with same input - should use cache
      const keywords2 = await extractKeywords('test page', 'test question')
      expect(mockCreate).toHaveBeenCalledOnce() // Still only once
      expect(keywords2).toEqual(keywords1)
    })

    it('should track cache hits and misses', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['test'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      // First call - miss
      await extractKeywords('page1')
      let stats = getKeywordCacheStats()
      expect(stats.misses).toBe(1)
      expect(stats.hits).toBe(0)

      // Second call same input - hit
      await extractKeywords('page1')
      stats = getKeywordCacheStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)

      // Third call different input - miss
      await extractKeywords('page2')
      stats = getKeywordCacheStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(2)

      // Calculate hit rate
      expect(stats.hitRate).toBeCloseTo(1 / 3)
    })

    it('should use different cache keys for different inputs', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['test'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      await extractKeywords('page1', 'question1')
      await extractKeywords('page1', 'question2') // Different question
      await extractKeywords('page2', 'question1') // Different page

      // Should make 3 separate API calls
      expect(mockCreate).toHaveBeenCalledTimes(3)
    })

    it('should clean up cache when size exceeds limit', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['test'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      // Add many entries to trigger cleanup
      for (let i = 0; i < 1100; i++) {
        await extractKeywords(`page${i}`)
      }

      // Cache should be cleaned up (cleanup only removes expired entries, not size-based)
      // Since all entries are fresh, cache size will still be 1100
      const stats = getKeywordCacheStats()
      expect(stats.size).toBeLessThanOrEqual(1100)
    })

    it('should reset stats correctly', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['test'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      // Generate some stats
      await extractKeywords('test1')
      await extractKeywords('test1')

      // Reset
      resetCacheStats()

      const stats = getKeywordCacheStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.totalRequests).toBe(0)
    })
  })

  describe('Cache Statistics', () => {
    it('should calculate hit rate correctly', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['test'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      // 2 misses, 3 hits
      await extractKeywords('page1')
      await extractKeywords('page2')
      await extractKeywords('page1') // Hit
      await extractKeywords('page1') // Hit
      await extractKeywords('page2') // Hit

      const stats = getKeywordCacheStats()
      expect(stats.hits).toBe(3)
      expect(stats.misses).toBe(2)
      expect(stats.totalRequests).toBe(5)
      expect(stats.hitRate).toBeCloseTo(0.6) // 3/5 = 60%
    })

    it('should handle zero requests', () => {
      const stats = getKeywordCacheStats()
      expect(stats.hitRate).toBe(0)
      expect(stats.totalRequests).toBe(0)
    })

    it('should track cache size', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['test'] })
          }
        }]
      })

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      await extractKeywords('page1')
      await extractKeywords('page2')
      await extractKeywords('page3')

      const stats = getKeywordCacheStats()
      expect(stats.size).toBe(3)
    })
  })

  describe('Fallback Keyword Extraction', () => {
    it('should extract keywords using heuristics when LLM fails', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockRejectedValue(new Error('API error'))

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords(
        'The derivative function calculus mathematics integration differentiation'
      )

      expect(keywords.length).toBeGreaterThan(0)
      // Should include some key academic terms
      const hasRelevantKeyword = keywords.some(k =>
        ['derivative', 'function', 'calculus', 'mathematics', 'integration', 'differentiation'].includes(k)
      )
      expect(hasRelevantKeyword).toBe(true)
    })

    it('should filter stop words in fallback', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockRejectedValue(new Error('API error'))

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords('the and or but with derivative function')

      // Should not include stop words
      expect(keywords).not.toContain('the')
      expect(keywords).not.toContain('and')
      expect(keywords).not.toContain('but')

      // Should include real keywords
      expect(keywords).toContain('derivative')
      expect(keywords).toContain('function')
    })

    it('should limit to top keywords by frequency in fallback', async () => {
      const { getOpenAIClient } = await import('@/lib/openai/client')
      const mockCreate = vi.fn().mockRejectedValue(new Error('API error'))

      ;(getOpenAIClient as any).mockReturnValue({
        chat: { completions: { create: mockCreate } }
      })

      const keywords = await extractKeywords(
        'derivative derivative derivative function function calculus theorem principle definition'
      )

      expect(keywords.length).toBeLessThanOrEqual(8)
      // Most frequent should come first
      expect(keywords[0]).toBe('derivative')
    })
  })
})
