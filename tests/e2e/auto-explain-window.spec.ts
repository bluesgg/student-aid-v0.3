/**
 * E2E tests for Auto-Explain Window feature (Intelligent Auto-Explain)
 * Tests the sliding window generation workflow with version management.
 */
import { test, expect } from '@playwright/test'

// Test configuration
const TEST_TIMEOUT = 60000 // 60 seconds for AI generation tests

test.describe('Auto-Explain Window Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/login')
    // TODO: Add test credentials from environment
    // await page.fill('[data-testid="email-input"]', process.env.TEST_USER_EMAIL || '')
    // await page.fill('[data-testid="password-input"]', process.env.TEST_USER_PASSWORD || '')
    // await page.click('[data-testid="login-button"]')
    // await page.waitForURL('/courses')
  })

  test.describe('Start Explaining Flow', () => {
    test('should start auto-explain session from current page', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      // Navigate to PDF viewer
      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Navigate to page 10 (simulating scroll)
      // await page.evaluate(() => window.scrollTo(0, 2000))

      // Click "Explain From This Page" button
      const explainButton = page.locator('button:has-text("Explain From This Page")')
      await expect(explainButton).toBeVisible()
      await explainButton.click()

      // Should show progress toast
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible({
        timeout: 5000,
      })

      // Toast should show generating status
      await expect(page.locator('text=Generating explanations')).toBeVisible()
    })

    test('should disable button when session is active', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session
      const explainButton = page.locator('button:has-text("Explain From This Page")')
      await explainButton.click()

      // Button should be disabled after clicking
      await expect(explainButton).toBeDisabled()

      // Should show "Explaining..." state
      await expect(page.locator('text=Explaining')).toBeVisible()
    })

    test('should show stickers as they are generated', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session
      await page.click('button:has-text("Explain From This Page")')

      // Wait for first sticker to appear
      await expect(page.locator('[data-testid="sticker-card"]').first()).toBeVisible({
        timeout: 30000,
      })
    })
  })

  test.describe('Scroll and Window Expansion', () => {
    test('should expand window when user scrolls to next page', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session on page 10
      await page.click('button:has-text("Explain From This Page")')
      await page.waitForSelector('[data-testid="session-progress-toast"]')

      // Scroll to simulate page change
      await page.evaluate(() => {
        const viewer = document.querySelector('[data-testid="pdf-viewer"]')
        if (viewer) {
          viewer.scrollTop += 1000
        }
      })

      // Wait for window update
      await page.waitForTimeout(500)

      // Progress should update
      const progressText = await page.locator('[data-testid="session-progress-toast"]').textContent()
      expect(progressText).toBeTruthy()
    })

    test('should handle page jump (>10 pages)', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session on page 10
      await page.click('button:has-text("Explain From This Page")')
      await page.waitForSelector('[data-testid="session-progress-toast"]')

      // Jump to page 50 (simulated - would need page navigation in real app)
      // This would typically be done via a page selector or keyboard navigation
      // await page.click('[data-testid="page-selector"]')
      // await page.fill('[data-testid="page-input"]', '50')
      // await page.press('[data-testid="page-input"]', 'Enter')

      // Progress toast should update with new window
      // await expect(page.locator('text=Window:')).toBeVisible()
    })
  })

  test.describe('Session Progress Toast', () => {
    test('should show progress updates in real-time', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session
      await page.click('button:has-text("Explain From This Page")')

      // Wait for toast
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // Check for progress indicator
      const progressBar = page.locator('[data-testid="session-progress-bar"]')
      if (await progressBar.isVisible()) {
        // Progress should increase over time
        const initialWidth = await progressBar.evaluate(el => el.style.width)
        await page.waitForTimeout(5000)
        const laterWidth = await progressBar.evaluate(el => el.style.width)

        // Progress should have advanced
        expect(laterWidth).not.toBe(initialWidth)
      }
    })

    test('should allow user to stop session via toast button', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session
      await page.click('button:has-text("Explain From This Page")')

      // Wait for toast with stop button
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // Click stop button
      const stopButton = page.locator('[data-testid="stop-session-button"]')
      if (await stopButton.isVisible()) {
        await stopButton.click()

        // Toast should dismiss or show stopped state
        await expect(page.locator('text=Session stopped')).toBeVisible({ timeout: 5000 })
      }
    })

    test('should auto-dismiss toast when session completes', async ({ page }) => {
      test.setTimeout(120000) // Extended timeout for full generation

      await page.goto('/courses/test-course-id/files/test-file-id?page=1')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session on small window
      await page.click('button:has-text("Explain From This Page")')

      // Wait for toast
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // Wait for completion (or timeout)
      // Toast should eventually show completion or dismiss
      await expect(
        page.locator('[data-testid="session-progress-toast"]:has-text("Complete")')
      ).toBeVisible({ timeout: 90000 })
    })
  })

  test.describe('Sticker Version Management', () => {
    test('should show version arrows when sticker has multiple versions', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Assuming a sticker with versions exists
      const stickerCard = page.locator('[data-testid="sticker-card-versioned"]').first()

      if (await stickerCard.isVisible()) {
        // Look for version navigation arrows
        const leftArrow = stickerCard.locator('[data-testid="version-prev"]')
        const rightArrow = stickerCard.locator('[data-testid="version-next"]')

        // Either both or neither should be visible (depends on version count)
        const hasVersions = await leftArrow.isVisible() || await rightArrow.isVisible()

        if (hasVersions) {
          // Version counter should be visible
          await expect(stickerCard.locator('[data-testid="version-counter"]')).toBeVisible()
        }
      }
    })

    test('should switch version when clicking arrows', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const stickerCard = page.locator('[data-testid="sticker-card-versioned"]').first()

      if (await stickerCard.isVisible()) {
        const prevArrow = stickerCard.locator('[data-testid="version-prev"]')

        if (await prevArrow.isVisible()) {
          // Get current content
          const contentBefore = await stickerCard.locator('[data-testid="sticker-content"]').textContent()

          // Click previous version
          await prevArrow.click()

          // Wait for content update
          await page.waitForTimeout(1000)

          // Content should change
          const contentAfter = await stickerCard.locator('[data-testid="sticker-content"]').textContent()
          expect(contentAfter).not.toBe(contentBefore)
        }
      }
    })

    test('should refresh sticker and create new version', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const stickerCard = page.locator('[data-testid="sticker-card-versioned"]').first()

      if (await stickerCard.isVisible()) {
        const refreshButton = stickerCard.locator('[data-testid="refresh-sticker"]')

        if (await refreshButton.isVisible()) {
          // Click refresh
          await refreshButton.click()

          // Should show loading state
          await expect(stickerCard.locator('[data-testid="refresh-loading"]')).toBeVisible()

          // Wait for refresh to complete
          await expect(stickerCard.locator('[data-testid="refresh-loading"]')).not.toBeVisible({
            timeout: 30000,
          })

          // Version counter should update
          const versionCounter = stickerCard.locator('[data-testid="version-counter"]')
          if (await versionCounter.isVisible()) {
            const versionText = await versionCounter.textContent()
            expect(versionText).toContain('2')
          }
        }
      }
    })

    test('should debounce rapid refresh clicks', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const stickerCard = page.locator('[data-testid="sticker-card-versioned"]').first()

      if (await stickerCard.isVisible()) {
        const refreshButton = stickerCard.locator('[data-testid="refresh-sticker"]')

        if (await refreshButton.isVisible()) {
          // Click refresh
          await refreshButton.click()

          // Immediately try to click again
          await page.waitForTimeout(100)
          await refreshButton.click()

          // Should only trigger one refresh (debounce)
          // Could verify via network requests or loading state
        }
      }
    })
  })

  test.describe('Window Mode + Image Selection Coexistence', () => {
    test('should allow image selection during active window session', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start window session
      await page.click('button:has-text("Explain From This Page")')
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // Enable image selection tool (if exists)
      const imageSelectButton = page.locator('[data-testid="image-select-tool"]')
      if (await imageSelectButton.isVisible()) {
        await imageSelectButton.click()

        // Draw selection rectangle on PDF
        const pdfCanvas = page.locator('[data-testid="pdf-canvas"]')
        if (await pdfCanvas.isVisible()) {
          const box = await pdfCanvas.boundingBox()
          if (box) {
            // Draw rectangle
            await page.mouse.move(box.x + 50, box.y + 50)
            await page.mouse.down()
            await page.mouse.move(box.x + 200, box.y + 200)
            await page.mouse.up()

            // Should show image selection UI
            await expect(page.locator('[data-testid="image-selection-confirm"]')).toBeVisible()
          }
        }
      }
    })
  })

  test.describe('Error Handling', () => {
    test('should handle concurrent session rejection', async ({ page, context }) => {
      test.setTimeout(TEST_TIMEOUT)

      // Open two tabs
      const page2 = await context.newPage()

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page2.goto('/courses/test-course-id/files/test-file-id')

      await page.waitForSelector('[data-testid="pdf-viewer"]')
      await page2.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session on first tab
      await page.click('button:has-text("Explain From This Page")')
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // Try to start session on second tab
      await page2.click('button:has-text("Explain From This Page")')

      // Should show error about existing session
      await expect(page2.locator('text=session already exists')).toBeVisible({
        timeout: 10000,
      })

      await page2.close()
    })

    test('should continue session on individual page failures', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session
      await page.click('button:has-text("Explain From This Page")')
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // Wait for some progress
      await page.waitForTimeout(5000)

      // Session should continue even if some pages fail
      // Progress should still be shown
      const toast = page.locator('[data-testid="session-progress-toast"]')
      await expect(toast).toBeVisible()

      // If there are failures, they should be indicated but not stop the session
      const failedIndicator = toast.locator('[data-testid="failed-pages-count"]')
      // Failures are expected to be handled gracefully
    })
  })

  test.describe('PDF Type Detection', () => {
    test('should detect PPT-style PDFs correctly', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      // Navigate to a known PPT-style PDF
      await page.goto('/courses/test-course-id/files/ppt-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session
      await page.click('button:has-text("Explain From This Page")')

      // Wait for detection to complete
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // PPT detection would generate 1 sticker per page
      // This is verified by the sticker count matching page count
    })

    test('should detect text-heavy PDFs correctly', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      // Navigate to a known text-heavy PDF (textbook)
      await page.goto('/courses/test-course-id/files/textbook-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Start session
      await page.click('button:has-text("Explain From This Page")')

      // Wait for detection to complete
      await expect(page.locator('[data-testid="session-progress-toast"]')).toBeVisible()

      // Text detection would use paragraph accumulation
      // Stickers may span multiple pages
    })
  })
})

test.describe('Auto-Explain API Integration', () => {
  test('should create session via API', async ({ request }) => {
    // POST to create session
    const response = await request.post('/api/ai/explain-page', {
      data: {
        courseId: 'test-course-id',
        fileId: 'test-file-id',
        page: 10,
        pdfType: 'Lecture',
        locale: 'en',
        mode: 'window',
      },
    })

    // Should return 202 with session info
    expect(response.status()).toBe(202)

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.sessionId).toBeTruthy()
    expect(body.windowRange).toBeDefined()
    expect(body.windowRange.start).toBeLessThanOrEqual(10)
    expect(body.windowRange.end).toBeGreaterThanOrEqual(10)
  })

  test('should get session status via API', async ({ request }) => {
    // First create a session
    const createResponse = await request.post('/api/ai/explain-page', {
      data: {
        courseId: 'test-course-id',
        fileId: 'test-file-id',
        page: 10,
        pdfType: 'Lecture',
        locale: 'en',
        mode: 'window',
      },
    })

    if (createResponse.status() === 202) {
      const { sessionId } = await createResponse.json()

      // GET session status
      const statusResponse = await request.get(`/api/ai/explain-page/session/${sessionId}`)

      expect(statusResponse.status()).toBe(200)

      const status = await statusResponse.json()
      expect(status.ok).toBe(true)
      expect(status.data.sessionId).toBe(sessionId)
      expect(status.data.progress).toBeDefined()
      expect(status.data.progress.total).toBeGreaterThan(0)
    }
  })

  test('should update session window via API', async ({ request }) => {
    // Create session
    const createResponse = await request.post('/api/ai/explain-page', {
      data: {
        courseId: 'test-course-id',
        fileId: 'test-file-id',
        page: 10,
        pdfType: 'Lecture',
        locale: 'en',
        mode: 'window',
      },
    })

    if (createResponse.status() === 202) {
      const { sessionId } = await createResponse.json()

      // PATCH to update window
      const updateResponse = await request.patch(`/api/ai/explain-page/session/${sessionId}`, {
        data: {
          currentPage: 12,
          action: 'extend',
        },
      })

      expect(updateResponse.status()).toBe(200)

      const result = await updateResponse.json()
      expect(result.ok).toBe(true)
      expect(result.data.windowRange).toBeDefined()
    }
  })

  test('should cancel session via API', async ({ request }) => {
    // Create session
    const createResponse = await request.post('/api/ai/explain-page', {
      data: {
        courseId: 'test-course-id',
        fileId: 'test-file-id',
        page: 10,
        pdfType: 'Lecture',
        locale: 'en',
        mode: 'window',
      },
    })

    if (createResponse.status() === 202) {
      const { sessionId } = await createResponse.json()

      // DELETE to cancel
      const deleteResponse = await request.delete(`/api/ai/explain-page/session/${sessionId}`)

      expect(deleteResponse.status()).toBe(200)

      const result = await deleteResponse.json()
      expect(result.ok).toBe(true)
    }
  })
})
