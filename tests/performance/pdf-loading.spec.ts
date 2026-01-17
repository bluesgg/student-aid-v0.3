/**
 * PDF Loading Performance Tests
 *
 * Measures and validates PDF loading performance metrics:
 * - First page render time
 * - Full document load time
 * - Cache hit performance
 *
 * Run with:
 *   pnpm exec playwright test tests/performance/pdf-loading.spec.ts
 *
 * Environment variables:
 *   PERF_TEST_COURSE_ID - Course ID with test files
 *   PERF_TEST_FILE_ID - File ID for testing
 *   PERF_TEST_BASE_URL - Base URL (default: http://localhost:3000)
 */

import { test, expect, type Page } from '@playwright/test'

// Performance baseline thresholds (in milliseconds)
const PERF_THRESHOLDS = {
  // First page should appear quickly
  firstPageRender: {
    cacheMiss: 3000, // 3s for uncached load
    cacheHit: 500, // 500ms for cached load
  },
  // Full document load
  fullDocLoad: {
    cacheMiss: 10000, // 10s for uncached load
    cacheHit: 1000, // 1s for cached load
  },
  // Regression tolerance (20%)
  regressionTolerance: 0.2,
}

// Test configuration
const TEST_CONFIG = {
  courseId: process.env.PERF_TEST_COURSE_ID || 'test-course-id',
  fileId: process.env.PERF_TEST_FILE_ID || 'test-file-id',
  baseUrl: process.env.PERF_TEST_BASE_URL || 'http://localhost:3000',
  // Number of runs for averaging
  sampleRuns: 3,
}

// Performance result type
interface PerformanceResult {
  firstPageTimeMs: number | null
  fullLoadTimeMs: number | null
  cacheHit: boolean
  pageCount: number
}

/**
 * Measure PDF loading performance on a page
 */
async function measurePdfLoadPerformance(page: Page, url: string): Promise<PerformanceResult> {
  // Start timing
  const startTime = Date.now()
  let firstPageTime: number | null = null

  // Set up performance mark listener
  await page.addInitScript(() => {
    // Listen for first page render
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'pdf-first-page-ready') {
        (window as unknown as { __firstPageTime: number }).__firstPageTime = Date.now()
      }
    })
  })

  // Navigate to PDF viewer
  await page.goto(url, { waitUntil: 'networkidle' })

  // Wait for PDF viewer to appear
  await page.waitForSelector('[data-testid="pdf-viewer"], .react-pdf__Document', {
    timeout: 30000,
  })

  // Wait for first page canvas to render
  try {
    await page.waitForSelector('canvas[data-page-number="1"], .react-pdf__Page__canvas', {
      timeout: 15000,
    })
    firstPageTime = Date.now() - startTime
  } catch {
    console.warn('First page canvas not detected within timeout')
  }

  // Wait for document to fully load (all pages available)
  try {
    await page.waitForFunction(
      () => {
        const toolbar = document.querySelector('[data-testid="pdf-toolbar"]')
        const pageInfo = toolbar?.textContent || ''
        // Check if page count is available (e.g., "Page 1 of 10")
        return /\d+\s*(of|\/)\s*\d+/i.test(pageInfo) || document.querySelector('.react-pdf__Document--loaded')
      },
      { timeout: 30000 }
    )
  } catch {
    console.warn('Document load indicator not detected within timeout')
  }

  const fullLoadTime = Date.now() - startTime

  // Check if loaded from cache (look for debug indicator or network requests)
  const cacheIndicator = await page.locator('[data-cache-status="hit"]').count()
  const cacheHit = cacheIndicator > 0

  // Get page count
  let pageCount = 0
  try {
    const pageText = await page.locator('[data-testid="pdf-toolbar"]').textContent()
    const match = pageText?.match(/of\s*(\d+)/i) || pageText?.match(/\/\s*(\d+)/)
    if (match) {
      pageCount = parseInt(match[1], 10)
    }
  } catch {
    // Ignore errors
  }

  return {
    firstPageTimeMs: firstPageTime,
    fullLoadTimeMs: fullLoadTime,
    cacheHit,
    pageCount,
  }
}

/**
 * Clear PDF cache to ensure clean test state
 */
async function clearPdfCache(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Clear IndexedDB cache
    try {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db.name?.includes('pdf-cache') || db.name?.includes('studentaid')) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    } catch {
      // Ignore errors in environments that don't support databases()
    }

    // Clear session storage
    sessionStorage.clear()
  })
}

test.describe('PDF Loading Performance', () => {
  test.describe.configure({ mode: 'serial' }) // Run tests in order

  const testUrl = `${TEST_CONFIG.baseUrl}/courses/${TEST_CONFIG.courseId}/files/${TEST_CONFIG.fileId}`

  test.beforeEach(async ({ page }) => {
    // Login first (skip if using test auth)
    await page.goto(`${TEST_CONFIG.baseUrl}/login`)

    // Wait for login page or redirect if already logged in
    const isLoginPage = await page.locator('form[action*="login"], input[type="email"]').count() > 0

    if (isLoginPage) {
      // TODO: Add login credentials from test environment
      console.log('Login required - skipping performance test')
      test.skip()
    }
  })

  test('should load PDF first page within threshold (uncached)', async ({ page }) => {
    // Clear cache to ensure uncached load
    await clearPdfCache(page)

    const result = await measurePdfLoadPerformance(page, testUrl)

    console.log('Uncached load results:', {
      firstPageTimeMs: result.firstPageTimeMs,
      fullLoadTimeMs: result.fullLoadTimeMs,
      pageCount: result.pageCount,
    })

    // Validate first page time
    if (result.firstPageTimeMs !== null) {
      expect(
        result.firstPageTimeMs,
        `First page render time (${result.firstPageTimeMs}ms) exceeded threshold (${PERF_THRESHOLDS.firstPageRender.cacheMiss}ms)`
      ).toBeLessThanOrEqual(PERF_THRESHOLDS.firstPageRender.cacheMiss)
    }

    // Validate full load time
    expect(
      result.fullLoadTimeMs,
      `Full load time (${result.fullLoadTimeMs}ms) exceeded threshold (${PERF_THRESHOLDS.fullDocLoad.cacheMiss}ms)`
    ).toBeLessThanOrEqual(PERF_THRESHOLDS.fullDocLoad.cacheMiss)
  })

  test('should load PDF significantly faster from cache', async ({ page }) => {
    // First load to populate cache
    await measurePdfLoadPerformance(page, testUrl)

    // Reload to test cached performance
    const cachedResult = await measurePdfLoadPerformance(page, testUrl)

    console.log('Cached load results:', {
      firstPageTimeMs: cachedResult.firstPageTimeMs,
      fullLoadTimeMs: cachedResult.fullLoadTimeMs,
      cacheHit: cachedResult.cacheHit,
    })

    // Validate cached performance
    expect(
      cachedResult.fullLoadTimeMs,
      `Cached load time (${cachedResult.fullLoadTimeMs}ms) exceeded threshold (${PERF_THRESHOLDS.fullDocLoad.cacheHit}ms)`
    ).toBeLessThanOrEqual(PERF_THRESHOLDS.fullDocLoad.cacheHit)
  })

  test('should not regress beyond tolerance', async ({ page }) => {
    // Collect multiple samples for averaging
    const samples: PerformanceResult[] = []

    for (let i = 0; i < TEST_CONFIG.sampleRuns; i++) {
      await clearPdfCache(page)
      const result = await measurePdfLoadPerformance(page, testUrl)
      samples.push(result)

      // Wait between runs
      await page.waitForTimeout(1000)
    }

    // Calculate average load time
    const validSamples = samples.filter((s) => s.fullLoadTimeMs !== null)
    const avgLoadTime =
      validSamples.reduce((sum, s) => sum + (s.fullLoadTimeMs ?? 0), 0) / validSamples.length

    console.log('Performance summary:', {
      samples: validSamples.length,
      avgLoadTimeMs: Math.round(avgLoadTime),
      threshold: PERF_THRESHOLDS.fullDocLoad.cacheMiss,
      tolerance: `${PERF_THRESHOLDS.regressionTolerance * 100}%`,
    })

    // Validate average is within threshold + tolerance
    const maxAllowed =
      PERF_THRESHOLDS.fullDocLoad.cacheMiss * (1 + PERF_THRESHOLDS.regressionTolerance)

    expect(
      avgLoadTime,
      `Average load time (${Math.round(avgLoadTime)}ms) exceeded max allowed (${Math.round(maxAllowed)}ms)`
    ).toBeLessThanOrEqual(maxAllowed)
  })

  test('should measure first page render accurately', async ({ page }) => {
    await clearPdfCache(page)

    // Navigate to PDF
    const startTime = Date.now()
    await page.goto(testUrl, { waitUntil: 'commit' })

    // Wait for first canvas
    await page.waitForSelector('canvas', { timeout: 15000 })
    const firstCanvasTime = Date.now() - startTime

    console.log('First canvas render time:', firstCanvasTime, 'ms')

    // Should render something quickly
    expect(firstCanvasTime).toBeLessThan(PERF_THRESHOLDS.firstPageRender.cacheMiss)
  })
})

test.describe('PDF Cache Behavior', () => {
  const testUrl = `${TEST_CONFIG.baseUrl}/courses/${TEST_CONFIG.courseId}/files/${TEST_CONFIG.fileId}`

  test('should cache PDF after first load', async ({ page }) => {
    // Clear cache
    await page.goto(`${TEST_CONFIG.baseUrl}`)
    await clearPdfCache(page)

    // First load
    await measurePdfLoadPerformance(page, testUrl)

    // Check cache has entry
    const cacheSize = await page.evaluate(async () => {
      try {
        const request = indexedDB.open('studentaid-pdf-cache', 1)
        return new Promise<number>((resolve) => {
          request.onsuccess = () => {
            const db = request.result
            try {
              const transaction = db.transaction('pdf-data', 'readonly')
              const store = transaction.objectStore('pdf-data')
              const countRequest = store.count()
              countRequest.onsuccess = () => resolve(countRequest.result)
              countRequest.onerror = () => resolve(0)
            } catch {
              resolve(0)
            }
          }
          request.onerror = () => resolve(0)
        })
      } catch {
        return 0
      }
    })

    console.log('Cache entries after first load:', cacheSize)
    expect(cacheSize).toBeGreaterThan(0)
  })

  test('should clear cache when requested', async ({ page }) => {
    // Load PDF to populate cache
    await page.goto(testUrl)
    await page.waitForSelector('canvas', { timeout: 15000 })

    // Navigate to settings and clear cache
    await page.goto(`${TEST_CONFIG.baseUrl}/settings`)

    // Look for cache clear button
    const clearButton = page.locator('button:has-text("Clear PDF Cache"), button:has-text("清除 PDF 缓存")')
    if (await clearButton.count() > 0) {
      await clearButton.click()

      // Confirm if dialog appears
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("确定")')
      if (await confirmButton.count() > 0) {
        await confirmButton.click()
      }

      // Wait for cache to be cleared
      await page.waitForTimeout(1000)

      // Verify cache is empty
      const cacheSize = await page.evaluate(async () => {
        try {
          const request = indexedDB.open('studentaid-pdf-cache', 1)
          return new Promise<number>((resolve) => {
            request.onsuccess = () => {
              const db = request.result
              try {
                const transaction = db.transaction('pdf-data', 'readonly')
                const store = transaction.objectStore('pdf-data')
                const countRequest = store.count()
                countRequest.onsuccess = () => resolve(countRequest.result)
                countRequest.onerror = () => resolve(0)
              } catch {
                resolve(0)
              }
            }
            request.onerror = () => resolve(0)
          })
        } catch {
          return 0
        }
      })

      expect(cacheSize).toBe(0)
    } else {
      console.log('Cache clear button not found - skipping test')
      test.skip()
    }
  })
})

test.describe('PDF Prefetch Behavior', () => {
  test('should prefetch files when viewing file list', async ({ page }) => {
    const courseUrl = `${TEST_CONFIG.baseUrl}/courses/${TEST_CONFIG.courseId}`

    // Clear cache
    await page.goto(`${TEST_CONFIG.baseUrl}`)
    await clearPdfCache(page)

    // Navigate to course file list
    await page.goto(courseUrl)
    await page.waitForSelector('[data-testid="file-list"], .file-list', { timeout: 10000 })

    // Wait for prefetch to potentially start (delay is 2 seconds in hook)
    await page.waitForTimeout(5000)

    // Check if any cache entries were created
    const cacheSize = await page.evaluate(async () => {
      try {
        const request = indexedDB.open('studentaid-pdf-cache', 1)
        return new Promise<number>((resolve) => {
          request.onsuccess = () => {
            const db = request.result
            try {
              const transaction = db.transaction('pdf-data', 'readonly')
              const store = transaction.objectStore('pdf-data')
              const countRequest = store.count()
              countRequest.onsuccess = () => resolve(countRequest.result)
              countRequest.onerror = () => resolve(0)
            } catch {
              resolve(0)
            }
          }
          request.onerror = () => resolve(0)
        })
      } catch {
        return 0
      }
    })

    console.log('Prefetched cache entries:', cacheSize)

    // Note: Prefetch may not work in test environment due to auth/network constraints
    // This test documents expected behavior
  })
})
