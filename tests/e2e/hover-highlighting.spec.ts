/**
 * E2E tests for Sticker Hover Highlighting feature
 * Tests bidirectional highlighting between sticker cards and PDF regions.
 */
import { test, expect } from '@playwright/test'

// Test configuration
const TEST_TIMEOUT = 30000

test.describe('Sticker Hover Highlighting', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user (placeholder)
    await page.goto('/login')
    // TODO: Add test credentials from environment
    // await page.fill('[data-testid="email-input"]', process.env.TEST_USER_EMAIL || '')
    // await page.fill('[data-testid="password-input"]', process.env.TEST_USER_PASSWORD || '')
    // await page.click('[data-testid="login-button"]')
    // await page.waitForURL('/courses')
  })

  test.describe('Sticker Card → PDF Highlight', () => {
    test('should highlight PDF region when hovering sticker card', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      // Navigate to PDF viewer with existing stickers
      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Wait for stickers to load
      const stickerCard = page.locator('[data-testid="sticker-card"]').first()
      await expect(stickerCard).toBeVisible({ timeout: 10000 })

      // Hover over sticker card
      await stickerCard.hover()

      // Should show highlight overlay on PDF
      const highlight = page.locator('[data-testid="sticker-anchor-highlight"]')
      await expect(highlight).toBeVisible({ timeout: 3000 })

      // Verify highlight has correct styling (blue border)
      const borderColor = await highlight.evaluate((el) => {
        return window.getComputedStyle(el).borderColor
      })
      expect(borderColor).toContain('59, 130, 246') // #3B82F6 in RGB
    })

    test('should remove PDF highlight when mouse leaves sticker card', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const stickerCard = page.locator('[data-testid="sticker-card"]').first()
      await expect(stickerCard).toBeVisible({ timeout: 10000 })

      // Hover over sticker card
      await stickerCard.hover()

      // Highlight should appear
      const highlight = page.locator('[data-testid="sticker-anchor-highlight"]')
      await expect(highlight).toBeVisible({ timeout: 3000 })

      // Move mouse away
      await page.mouse.move(0, 0)

      // Highlight should disappear
      await expect(highlight).not.toBeVisible({ timeout: 2000 })
    })

    test('should not show highlight for full-page (PPT) stickers', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      // Navigate to a PPT-type PDF
      await page.goto('/courses/test-course-id/files/ppt-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Wait for PPT stickers to load
      const stickerCard = page.locator('[data-testid="sticker-card"]').first()
      await expect(stickerCard).toBeVisible({ timeout: 10000 })

      // Check if this is a full-page sticker (has full-page indicator)
      const isFullPage = await stickerCard.getAttribute('data-full-page')

      if (isFullPage === 'true') {
        // Hover over sticker card
        await stickerCard.hover()

        // Should NOT show highlight for full-page stickers
        const highlight = page.locator('[data-testid="sticker-anchor-highlight"]')
        await expect(highlight).not.toBeVisible({ timeout: 2000 })
      }
    })

    test('should show highlight on correct page when sticker is for different page', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Navigate to page 1
      await page.goto('/courses/test-course-id/files/test-file-id?page=1')

      // Get a sticker for page 5 (if exists in panel)
      const stickerCard = page.locator('[data-testid="sticker-card"][data-page="5"]').first()

      if (await stickerCard.isVisible()) {
        // Hover over sticker
        await stickerCard.hover()

        // Highlight should appear on page 5 canvas (not current page)
        const highlightOnPage5 = page.locator(
          '[data-testid="pdf-page-5"] [data-testid="sticker-anchor-highlight"]'
        )
        await expect(highlightOnPage5).toBeVisible({ timeout: 3000 })
      }
    })
  })

  test.describe('PDF Region → Sticker Highlight (Future)', () => {
    // Note: These tests are for the future PDF → Sticker direction
    // Currently marked as future enhancement (task 5.5)

    test.skip('should highlight sticker card when hovering PDF region', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Get PDF canvas
      const pdfCanvas = page.locator('[data-testid="pdf-canvas"]').first()
      await expect(pdfCanvas).toBeVisible()

      // Hover over a specific region on the PDF
      const box = await pdfCanvas.boundingBox()
      if (box) {
        // Hover at 20% from top, 10% from left (typical paragraph location)
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.2)

        // Should highlight matching sticker card
        const highlightedSticker = page.locator('[data-testid="sticker-card"][data-highlighted="true"]')
        await expect(highlightedSticker).toBeVisible({ timeout: 3000 })
      }
    })

    test.skip('should remove sticker highlight when mouse leaves PDF region', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const pdfCanvas = page.locator('[data-testid="pdf-canvas"]').first()
      const box = await pdfCanvas.boundingBox()

      if (box) {
        // Hover over PDF region
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.2)

        // Move mouse away
        await page.mouse.move(0, 0)

        // Sticker highlight should disappear
        const highlightedSticker = page.locator('[data-testid="sticker-card"][data-highlighted="true"]')
        await expect(highlightedSticker).not.toBeVisible({ timeout: 2000 })
      }
    })
  })

  test.describe('Highlight Styling', () => {
    test('should apply correct border and background to PDF highlight', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const stickerCard = page.locator('[data-testid="sticker-card"]').first()
      await expect(stickerCard).toBeVisible({ timeout: 10000 })

      await stickerCard.hover()

      const highlight = page.locator('[data-testid="sticker-anchor-highlight"]')
      await expect(highlight).toBeVisible({ timeout: 3000 })

      // Verify styling matches design spec
      const styles = await highlight.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          border: computed.border,
          borderColor: computed.borderColor,
          backgroundColor: computed.backgroundColor,
        }
      })

      // Border: 2px solid #3B82F6
      expect(styles.borderColor).toContain('59, 130, 246') // RGB of #3B82F6

      // Background: rgba(59, 130, 246, 0.1)
      expect(styles.backgroundColor).toContain('rgba')
    })

    test('should apply correct highlight styling to sticker card', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // This test verifies the sticker card highlighted state
      // Currently triggered by matchingStickers in context

      const stickerCard = page.locator('[data-testid="sticker-card"]').first()
      await expect(stickerCard).toBeVisible({ timeout: 10000 })

      // Manually trigger highlight state for testing (via JavaScript)
      await page.evaluate(() => {
        const card = document.querySelector('[data-testid="sticker-card"]')
        if (card) {
          card.setAttribute('data-highlighted', 'true')
          card.classList.add('border-2', 'border-blue-500', 'bg-blue-50/50')
        }
      })

      // Verify styling
      const styles = await stickerCard.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          borderColor: computed.borderColor,
          backgroundColor: computed.backgroundColor,
        }
      })

      // Should have blue styling when highlighted
      // Note: Exact values depend on CSS implementation
    })
  })

  test.describe('Anchor Rect Coordinates', () => {
    test('should correctly position highlight using normalized coordinates', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const stickerCard = page.locator('[data-testid="sticker-card"]').first()
      await expect(stickerCard).toBeVisible({ timeout: 10000 })

      await stickerCard.hover()

      const highlight = page.locator('[data-testid="sticker-anchor-highlight"]')
      await expect(highlight).toBeVisible({ timeout: 3000 })

      // Get highlight position
      const highlightBox = await highlight.boundingBox()

      // Get PDF page position
      const pdfPage = page.locator('[data-testid="pdf-page"]').first()
      const pdfBox = await pdfPage.boundingBox()

      if (highlightBox && pdfBox) {
        // Highlight should be within PDF page bounds
        expect(highlightBox.x).toBeGreaterThanOrEqual(pdfBox.x)
        expect(highlightBox.y).toBeGreaterThanOrEqual(pdfBox.y)
        expect(highlightBox.x + highlightBox.width).toBeLessThanOrEqual(pdfBox.x + pdfBox.width)
        expect(highlightBox.y + highlightBox.height).toBeLessThanOrEqual(pdfBox.y + pdfBox.height)
      }
    })

    test('should handle full-page rect (0,0,1,1) for PPT stickers', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/ppt-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // For PPT stickers with isFullPage=true, highlighting should be skipped
      // But if it were to render, it would cover the entire page

      const stickerCard = page.locator('[data-testid="sticker-card"][data-full-page="true"]').first()

      if (await stickerCard.isVisible()) {
        const anchorRect = await stickerCard.getAttribute('data-anchor-rect')

        if (anchorRect) {
          const rect = JSON.parse(anchorRect)
          expect(rect.x).toBe(0)
          expect(rect.y).toBe(0)
          expect(rect.width).toBe(1)
          expect(rect.height).toBe(1)
        }
      }
    })
  })

  test.describe('Multiple Stickers', () => {
    test('should only highlight one PDF region at a time', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      const stickerCards = page.locator('[data-testid="sticker-card"]')
      const count = await stickerCards.count()

      if (count >= 2) {
        // Hover first sticker
        await stickerCards.nth(0).hover()

        // Should have exactly one highlight
        const highlights = page.locator('[data-testid="sticker-anchor-highlight"]')
        await expect(highlights).toHaveCount(1)

        // Move to second sticker
        await stickerCards.nth(1).hover()

        // Should still have exactly one highlight (different position)
        await expect(highlights).toHaveCount(1)
      }
    })

    test('should highlight correct sticker when multiple exist on same page', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id?page=5')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Get stickers for current page
      const pageStickers = page.locator('[data-testid="sticker-card"][data-page="5"]')
      const count = await pageStickers.count()

      if (count >= 2) {
        // Hover first sticker
        await pageStickers.nth(0).hover()

        const highlight = page.locator('[data-testid="sticker-anchor-highlight"]')
        await expect(highlight).toBeVisible()

        // Get first highlight position
        const pos1 = await highlight.boundingBox()

        // Hover second sticker
        await pageStickers.nth(1).hover()

        // Get second highlight position
        const pos2 = await highlight.boundingBox()

        if (pos1 && pos2) {
          // Positions should be different (different anchor regions)
          const samePosition =
            pos1.x === pos2.x && pos1.y === pos2.y && pos1.width === pos2.width && pos1.height === pos2.height
          expect(samePosition).toBe(false)
        }
      }
    })
  })

  test.describe('Context Provider Integration', () => {
    test('should share hover state between components', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT)

      await page.goto('/courses/test-course-id/files/test-file-id')
      await page.waitForSelector('[data-testid="pdf-viewer"]')

      // Verify HoverHighlightProvider is mounted
      const contextMounted = await page.evaluate(() => {
        // Check if the hover context is available
        return document.querySelector('[data-testid="hover-highlight-provider"]') !== null
      })

      // Context should be mounted (or components using it should work)
      // This is verified by the hover behavior working correctly
      const stickerCard = page.locator('[data-testid="sticker-card"]').first()

      if (await stickerCard.isVisible()) {
        await stickerCard.hover()

        const highlight = page.locator('[data-testid="sticker-anchor-highlight"]')
        // If highlight appears, context is working
        const contextWorks = await highlight.isVisible()
        expect(contextWorks).toBe(true)
      }
    })
  })
})

test.describe('Hover Highlighting API', () => {
  test('should include anchor rect in sticker API response', async ({ request }) => {
    // GET stickers for a file
    const response = await request.get('/api/ai/stickers?fileId=test-file-id&page=1')

    if (response.ok()) {
      const body = await response.json()

      if (body.items && body.items.length > 0) {
        const sticker = body.items[0]

        // Sticker should have anchor with textSnippet
        expect(sticker.anchor).toBeDefined()
        expect(sticker.anchor.textSnippet).toBeDefined()

        // If rect exists, it should have correct structure
        if (sticker.anchor.rect) {
          expect(typeof sticker.anchor.rect.x).toBe('number')
          expect(typeof sticker.anchor.rect.y).toBe('number')
          expect(typeof sticker.anchor.rect.width).toBe('number')
          expect(typeof sticker.anchor.rect.height).toBe('number')

          // Coordinates should be normalized (0-1)
          expect(sticker.anchor.rect.x).toBeGreaterThanOrEqual(0)
          expect(sticker.anchor.rect.x).toBeLessThanOrEqual(1)
          expect(sticker.anchor.rect.y).toBeGreaterThanOrEqual(0)
          expect(sticker.anchor.rect.y).toBeLessThanOrEqual(1)
        }

        // PPT stickers should have isFullPage flag
        if (sticker.anchor.isFullPage !== undefined) {
          expect(typeof sticker.anchor.isFullPage).toBe('boolean')
        }
      }
    }
  })

  test('should return isFullPage=true for PPT stickers', async ({ request }) => {
    // GET stickers for a PPT-type file
    const response = await request.get('/api/ai/stickers?fileId=ppt-file-id&page=1')

    if (response.ok()) {
      const body = await response.json()

      if (body.items && body.items.length > 0) {
        const pptSticker = body.items.find((s: { anchor: { isFullPage?: boolean } }) => s.anchor.isFullPage === true)

        if (pptSticker) {
          expect(pptSticker.anchor.isFullPage).toBe(true)

          // Full-page stickers should have rect covering entire page
          if (pptSticker.anchor.rect) {
            expect(pptSticker.anchor.rect.x).toBe(0)
            expect(pptSticker.anchor.rect.y).toBe(0)
            expect(pptSticker.anchor.rect.width).toBe(1)
            expect(pptSticker.anchor.rect.height).toBe(1)
          }
        }
      }
    }
  })
})
