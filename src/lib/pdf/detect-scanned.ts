/**
 * Detects if a PDF is a scanned document based on text content.
 * A PDF is considered scanned if it has less than 50 characters per page on average.
 */

const SCANNED_THRESHOLD_CHARS_PER_PAGE = 50

/**
 * Check if a PDF appears to be a scanned document.
 * @param textContent - Extracted text from the PDF
 * @param pageCount - Number of pages in the PDF
 * @returns true if the PDF appears to be scanned
 */
export function isScannedPdf(textContent: string, pageCount: number): boolean {
  if (pageCount <= 0) return false

  const charCount = textContent.replace(/\s/g, '').length
  const avgCharsPerPage = charCount / pageCount

  return avgCharsPerPage < SCANNED_THRESHOLD_CHARS_PER_PAGE
}

/**
 * Get average characters per page for a PDF.
 * @param textContent - Extracted text from the PDF
 * @param pageCount - Number of pages in the PDF
 * @returns Average characters per page
 */
export function getAverageCharsPerPage(
  textContent: string,
  pageCount: number
): number {
  if (pageCount <= 0) return 0
  const charCount = textContent.replace(/\s/g, '').length
  return Math.round(charCount / pageCount)
}
