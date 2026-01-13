/**
 * Unit tests for context library utilities.
 * Tests word counting, token estimation, batch strategy, language detection, etc.
 */
import { describe, it, expect } from 'vitest'
import {
  estimateWordCount,
  estimateTokenCount,
  detectLanguage,
  clamp,
  calculateBatchStrategy,
  calculateRetryDelay,
  getCurrentMonthYear,
  normalizeTitle,
  extractSimpleKeywords,
  truncateText,
  formatFileSize,
  isValidSHA256Hash,
  generateKeywordCacheKey,
} from '../utils'
import { BATCH_CONFIG } from '../types'

describe('Word and Token Counting', () => {
  describe('estimateWordCount', () => {
    it('should count English words correctly', () => {
      const text = 'The derivative of a function measures the rate of change.'
      const count = estimateWordCount(text)
      expect(count).toBe(10)
    })

    it('should count CJK characters as words', () => {
      const text = '导数是函数的变化率'
      const count = estimateWordCount(text)
      expect(count).toBe(9) // 9 CJK characters
    })

    it('should handle mixed English and CJK text', () => {
      const text = 'The derivative 导数 is important'
      const count = estimateWordCount(text)
      expect(count).toBe(6) // 4 English words + 2 CJK chars
    })

    it('should handle empty string', () => {
      expect(estimateWordCount('')).toBe(0)
    })

    it('should handle multiple spaces and newlines', () => {
      const text = 'Word1   Word2\n\nWord3\tWord4'
      const count = estimateWordCount(text)
      expect(count).toBe(4)
    })

    it('should return 0 for non-string input', () => {
      expect(estimateWordCount(null as any)).toBe(0)
      expect(estimateWordCount(undefined as any)).toBe(0)
    })
  })

  describe('estimateTokenCount', () => {
    it('should estimate English tokens at ~1.3 tokens/word', () => {
      const text = 'The derivative of a function'
      const tokens = estimateTokenCount(text)
      const words = 5
      const expectedTokens = Math.ceil(words * 1.3)
      expect(tokens).toBe(expectedTokens)
    })

    it('should estimate CJK tokens at ~1.5 tokens/char', () => {
      const text = '导数是函数'
      const tokens = estimateTokenCount(text)
      const chars = 5
      const expectedTokens = Math.ceil(chars * 1.5)
      expect(tokens).toBe(expectedTokens)
    })

    it('should handle mixed text correctly', () => {
      const text = 'derivative 导数 function 函数'
      const tokens = estimateTokenCount(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(50)
    })

    it('should return 0 for empty string', () => {
      expect(estimateTokenCount('')).toBe(0)
    })
  })
})

describe('Language Detection', () => {
  it('should detect English text', () => {
    const text = 'The derivative of a function measures the rate of change'
    expect(detectLanguage(text)).toBe('en')
  })

  it('should detect Chinese text', () => {
    const text = '导数是函数在某点的变化率'
    expect(detectLanguage(text)).toBe('non-en')
  })

  it('should detect Japanese text', () => {
    const text = 'これは日本語のテキストです'
    expect(detectLanguage(text)).toBe('non-en')
  })

  it('should detect Korean text', () => {
    const text = '이것은 한국어 텍스트입니다'
    expect(detectLanguage(text)).toBe('non-en')
  })

  it('should detect mixed text based on >30% CJK threshold', () => {
    // Mostly English with some CJK
    const englishText = 'The derivative 导数 is a function'
    expect(detectLanguage(englishText)).toBe('en')

    // Mostly CJK with some English
    const cjkText = '导数是函数的变化率 derivative'
    expect(detectLanguage(cjkText)).toBe('non-en')
  })

  it('should handle empty string as English', () => {
    expect(detectLanguage('')).toBe('en')
  })

  it('should handle whitespace-only as English', () => {
    expect(detectLanguage('   \n\t   ')).toBe('en')
  })
})

describe('Batch Strategy Calculation', () => {
  it('should calculate strategy for dense textbook (600 words/page)', () => {
    const totalPages = 200
    const sampleWordCount = 600 * 10 // 10 sample pages
    const sampledPages = 10

    const strategy = calculateBatchStrategy(totalPages, sampleWordCount, sampledPages)

    expect(strategy.avgWordsPerPage).toBe(600)
    expect(strategy.estimatedTotalWords).toBe(120000) // 200 pages * 600 words
    expect(strategy.wordsPerBatch).toBeGreaterThanOrEqual(BATCH_CONFIG.minWordsPerBatch)
    expect(strategy.wordsPerBatch).toBeLessThanOrEqual(BATCH_CONFIG.maxWordsPerBatch)
    expect(strategy.totalBatches).toBeGreaterThan(0)
  })

  it('should calculate strategy for sparse slide deck (80 words/page)', () => {
    const totalPages = 100
    const sampleWordCount = 80 * 10 // 10 sample pages
    const sampledPages = 10

    const strategy = calculateBatchStrategy(totalPages, sampleWordCount, sampledPages)

    expect(strategy.avgWordsPerPage).toBe(80)
    expect(strategy.estimatedTotalWords).toBe(8000) // 100 pages * 80 words
    expect(strategy.wordsPerBatch).toBeGreaterThanOrEqual(BATCH_CONFIG.minWordsPerBatch)
    expect(strategy.totalBatches).toBeGreaterThan(0)
  })

  it('should handle single page PDF', () => {
    const strategy = calculateBatchStrategy(1, 500, 1)

    expect(strategy.avgWordsPerPage).toBe(500)
    expect(strategy.estimatedTotalWords).toBe(500)
    expect(strategy.totalBatches).toBe(1)
  })

  it('should handle empty PDF (no words)', () => {
    const strategy = calculateBatchStrategy(10, 0, 10)

    expect(strategy.avgWordsPerPage).toBe(0)
    expect(strategy.estimatedTotalWords).toBe(0)
    expect(strategy.totalBatches).toBe(1) // At least 1 batch
  })

  it('should respect wordsPerBatch bounds', () => {
    const totalPages = 500
    const sampleWordCount = 1000 * 10
    const sampledPages = 10

    const strategy = calculateBatchStrategy(totalPages, sampleWordCount, sampledPages)

    expect(strategy.wordsPerBatch).toBeGreaterThanOrEqual(BATCH_CONFIG.minWordsPerBatch)
    expect(strategy.wordsPerBatch).toBeLessThanOrEqual(BATCH_CONFIG.maxWordsPerBatch)
  })
})

describe('Utility Functions', () => {
  describe('clamp', () => {
    it('should clamp value to min', () => {
      expect(clamp(5, 10, 20)).toBe(10)
    })

    it('should clamp value to max', () => {
      expect(clamp(25, 10, 20)).toBe(20)
    })

    it('should return value if within range', () => {
      expect(clamp(15, 10, 20)).toBe(15)
    })
  })

  describe('calculateRetryDelay', () => {
    it('should implement exponential backoff', () => {
      expect(calculateRetryDelay(0)).toBe(60000) // 1 min
      expect(calculateRetryDelay(1)).toBe(120000) // 2 min
      expect(calculateRetryDelay(2)).toBe(240000) // 4 min
    })

    it('should cap at max delay', () => {
      expect(calculateRetryDelay(10)).toBe(240000) // Max 4 min
    })
  })

  describe('getCurrentMonthYear', () => {
    it('should return YYYY-MM format', () => {
      const result = getCurrentMonthYear()
      expect(result).toMatch(/^\d{4}-\d{2}$/)
    })
  })

  describe('normalizeTitle', () => {
    it('should lowercase and trim', () => {
      expect(normalizeTitle('  Derivative  ')).toBe('derivative')
    })

    it('should collapse multiple spaces', () => {
      expect(normalizeTitle('Derivative   of   Function')).toBe('derivative of function')
    })

    it('should handle special characters', () => {
      expect(normalizeTitle('Derivative (definition)')).toBe('derivative (definition)')
    })
  })

  describe('extractSimpleKeywords', () => {
    it('should extract keywords from text', () => {
      const text = 'The derivative measures the instantaneous rate of change'
      const keywords = extractSimpleKeywords(text)

      expect(keywords).toContain('derivative')
      expect(keywords).toContain('measures')
      expect(keywords).toContain('instantaneous')
      expect(keywords).not.toContain('the') // Stop word
      expect(keywords).not.toContain('of') // Stop word
    })

    it('should filter short words', () => {
      const text = 'a at to for the derivative'
      const keywords = extractSimpleKeywords(text)

      expect(keywords).toContain('derivative')
      expect(keywords.every(k => k.length > 3)).toBe(true)
    })

    it('should return unique keywords', () => {
      const text = 'derivative derivative derivative function'
      const keywords = extractSimpleKeywords(text)

      expect(keywords).toContain('derivative')
      expect(keywords.filter(k => k === 'derivative').length).toBe(1)
    })

    it('should handle empty string', () => {
      expect(extractSimpleKeywords('')).toEqual([])
    })
  })

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that needs to be truncated'
      const result = truncateText(text, 20)

      expect(result.length).toBe(20)
      expect(result).toMatch(/\.\.\.$/)
    })

    it('should not truncate short text', () => {
      const text = 'Short'
      expect(truncateText(text, 20)).toBe('Short')
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500.0 B')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1024 * 10)).toBe('10.0 KB')
    })

    it('should format megabytes', () => {
      expect(formatFileSize(1024 * 1024 * 5)).toBe('5.0 MB')
    })

    it('should format gigabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB')
    })
  })

  describe('isValidSHA256Hash', () => {
    it('should validate correct SHA-256 hash', () => {
      const validHash = 'a'.repeat(64)
      expect(isValidSHA256Hash(validHash)).toBe(true)
    })

    it('should reject invalid length', () => {
      expect(isValidSHA256Hash('abc123')).toBe(false)
    })

    it('should reject invalid characters', () => {
      const invalidHash = 'g'.repeat(64)
      expect(isValidSHA256Hash(invalidHash)).toBe(false)
    })
  })

  describe('generateKeywordCacheKey', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = generateKeywordCacheKey('test page', 'test question')
      const key2 = generateKeywordCacheKey('test page', 'test question')
      expect(key1).toBe(key2)
    })

    it('should generate different keys for different input', () => {
      const key1 = generateKeywordCacheKey('page1', 'question1')
      const key2 = generateKeywordCacheKey('page2', 'question2')
      expect(key1).not.toBe(key2)
    })

    it('should handle missing question', () => {
      const key = generateKeywordCacheKey('test page')
      expect(key).toMatch(/^keywords:/)
    })
  })
})
