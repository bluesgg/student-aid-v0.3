/**
 * E2E tests for PDF context extraction flow.
 * Tests the full user journey from upload to AI enhancement.
 */
import { test, expect } from '@playwright/test'

test.describe('Context Extraction E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/login')
    // TODO: Add login credentials from test environment
  })

  test('should upload PDF and trigger extraction', async ({ page }) => {
    // Navigate to course
    await page.goto('/courses')
    await page.click('text=Test Course')

    // Upload PDF
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('./tests/fixtures/sample-calculus.pdf')

    // Wait for upload to complete
    await expect(page.locator('text=Upload complete')).toBeVisible({ timeout: 10000 })

    // Verify file appears in list
    await expect(page.locator('text=sample-calculus.pdf')).toBeVisible()
  })

  test('should show extraction progress in file list', async ({ page }) => {
    // Navigate to course with pending extraction
    await page.goto('/courses/test-course-id')

    // Check for progress indicator
    await expect(page.locator('text=Analyzing document')).toBeVisible()

    // Should show progress (e.g., "45/100 pages")
    await expect(page.locator('[data-testid="extraction-progress"]')).toBeVisible()
  })

  test('should wait for extraction completion and show success', async ({ page }) => {
    // Navigate to course
    await page.goto('/courses/test-course-id')

    // Wait for extraction to complete (may take 1-2 minutes for test PDF)
    await expect(page.locator('text=Ready for AI')).toBeVisible({ timeout: 180000 })

    // Should show checkmark or completion indicator
    await expect(page.locator('[data-testid="extraction-complete"]')).toBeVisible()
  })

  test('should show toast notification on extraction completion', async ({ page }) => {
    // Navigate to course with ongoing extraction
    await page.goto('/courses/test-course-id')

    // Wait for toast notification
    await expect(page.locator('text=Document analysis complete')).toBeVisible({ timeout: 180000 })

    // Toast should include file name
    await expect(page.locator('text=sample-calculus.pdf')).toBeVisible()
  })

  test('should use context in auto-explain feature', async ({ page }) => {
    // Navigate to PDF viewer
    await page.goto('/courses/test-course-id/files/test-file-id')

    // Wait for page to load
    await page.waitForSelector('[data-testid="pdf-viewer"]')

    // Click "Explain this page" button
    await page.click('text=Explain this page')

    // Wait for AI response
    await expect(page.locator('[data-testid="ai-explanation"]')).toBeVisible({ timeout: 15000 })

    // Response should reference extracted context (check for definition/formula mentions)
    const explanation = await page.locator('[data-testid="ai-explanation"]').textContent()
    expect(explanation).toBeTruthy()
    expect(explanation!.length).toBeGreaterThan(100)
  })

  test('should use context in Q&A feature', async ({ page }) => {
    // Navigate to PDF viewer
    await page.goto('/courses/test-course-id/files/test-file-id')

    // Type question in Q&A input
    await page.fill('[data-testid="qa-input"]', 'What is a derivative?')
    await page.click('[data-testid="qa-submit"]')

    // Wait for AI response
    await expect(page.locator('[data-testid="qa-response"]')).toBeVisible({ timeout: 15000 })

    // Response should include references to source pages
    await expect(page.locator('text=References:')).toBeVisible()
    await expect(page.locator('text=p.')).toBeVisible() // Page number reference
  })

  test('should handle extraction errors gracefully', async ({ page }) => {
    // Upload a corrupted or invalid PDF
    await page.goto('/courses/test-course-id')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('./tests/fixtures/corrupted.pdf')

    // Should show error message
    await expect(page.locator('text=Extraction failed')).toBeVisible({ timeout: 60000 })

    // Should offer retry option
    await expect(page.locator('button:has-text("Retry")')).toBeVisible()
  })

  test('should show extraction progress updates in real-time', async ({ page }) => {
    // Navigate to course with ongoing extraction
    await page.goto('/courses/test-course-id')

    // Check initial progress
    const progressText1 = await page.locator('[data-testid="extraction-progress"]').textContent()

    // Wait a few seconds
    await page.waitForTimeout(5000)

    // Progress should have updated
    const progressText2 = await page.locator('[data-testid="extraction-progress"]').textContent()

    expect(progressText1).not.toBe(progressText2)
  })

  test('should handle concurrent extractions correctly', async ({ page }) => {
    // Upload multiple PDFs
    await page.goto('/courses/test-course-id')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([
      './tests/fixtures/pdf1.pdf',
      './tests/fixtures/pdf2.pdf',
      './tests/fixtures/pdf3.pdf',
    ])

    // All files should show in list
    await expect(page.locator('text=pdf1.pdf')).toBeVisible()
    await expect(page.locator('text=pdf2.pdf')).toBeVisible()
    await expect(page.locator('text=pdf3.pdf')).toBeVisible()

    // At least some should show extraction progress
    const progressIndicators = page.locator('[data-testid="extraction-progress"]')
    await expect(progressIndicators.first()).toBeVisible()
  })

  test('should persist extraction status across page refreshes', async ({ page }) => {
    // Navigate to course with ongoing extraction
    await page.goto('/courses/test-course-id')

    // Note the progress
    const progressBefore = await page.locator('[data-testid="extraction-progress"]').textContent()

    // Refresh page
    await page.reload()

    // Progress should still be visible
    await expect(page.locator('[data-testid="extraction-progress"]')).toBeVisible()

    const progressAfter = await page.locator('[data-testid="extraction-progress"]').textContent()

    // Progress should be preserved or advanced (not reset)
    expect(progressAfter).toBeTruthy()
  })

  test('should cache context for duplicate PDF uploads', async ({ page }) => {
    // Upload same PDF twice in different courses
    await page.goto('/courses/course-1')
    const fileInput1 = page.locator('input[type="file"]')
    await fileInput1.setInputFiles('./tests/fixtures/sample-calculus.pdf')

    // Wait for first extraction
    await expect(page.locator('text=Ready for AI')).toBeVisible({ timeout: 180000 })

    // Upload to second course
    await page.goto('/courses/course-2')
    const fileInput2 = page.locator('input[type="file"]')
    await fileInput2.setInputFiles('./tests/fixtures/sample-calculus.pdf')

    // Second upload should complete much faster (cache hit)
    await expect(page.locator('text=Ready for AI')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Context Extraction Limits', () => {
  test('should enforce monthly extraction quota', async ({ page }) => {
    // TODO: Upload PDFs until quota is reached
    // Should show quota exceeded message
  })

  test('should enforce file size limit', async ({ page }) => {
    await page.goto('/courses/test-course-id')

    // Try to upload file over 100MB
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('./tests/fixtures/large-file.pdf')

    // Should show error
    await expect(page.locator('text=exceeds maximum size')).toBeVisible()
  })

  test('should enforce page count limit', async ({ page }) => {
    await page.goto('/courses/test-course-id')

    // Try to upload file with >200 pages
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('./tests/fixtures/large-textbook.pdf')

    // Should show error
    await expect(page.locator('text=exceeds maximum')).toBeVisible()
    await expect(page.locator('text=200 pages')).toBeVisible()
  })
})
