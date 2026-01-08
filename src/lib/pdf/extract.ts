/**
 * PDF text extraction and page count utilities.
 * Uses pdf-parse for server-side PDF processing.
 */

const pdf = require('pdf-parse') as (
  buffer: Buffer,
  options?: {
    pagerender?: (pageData: {
      getTextContent: () => Promise<{ items: Array<{ str: string }> }>
    }) => Promise<string>
  }
) => Promise<{ numpages: number; text: string }>

export interface PdfInfo {
  pageCount: number
  textContent: string
}

export interface PageTextResult {
  pageNumber: number
  text: string
}

/**
 * Extract text content and page count from a PDF buffer.
 * @param buffer - PDF file as Buffer
 * @returns Object with pageCount and textContent
 */
export async function extractPdfInfo(buffer: Buffer): Promise<PdfInfo> {
  try {
    const data = await pdf(buffer)
    return {
      pageCount: data.numpages,
      textContent: data.text,
    }
  } catch (error) {
    console.error('Error extracting PDF info:', error)
    throw new Error('Failed to process PDF file')
  }
}

/**
 * Extract text from a specific page of a PDF.
 * Note: pdf-parse doesn't natively support page-specific extraction,
 * so we use a custom render function to capture per-page text.
 */
export async function extractPageText(
  buffer: Buffer,
  pageNumber: number
): Promise<PageTextResult> {
  try {
    let pageText = ''
    let currentPage = 0

    // Custom page renderer to capture text per page
    const options = {
      pagerender: function (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) {
        currentPage++
        if (currentPage === pageNumber) {
          return pageData.getTextContent().then(function (textContent) {
            pageText = textContent.items.map((item) => item.str).join(' ')
            return pageText
          })
        }
        return Promise.resolve('')
      },
    }

    await pdf(buffer, options)

    return {
      pageNumber,
      text: pageText.trim(),
    }
  } catch (error) {
    console.error('Error extracting page text:', error)
    throw new Error(`Failed to extract text from page ${pageNumber}`)
  }
}

/**
 * Extract text from multiple pages of a PDF.
 */
export async function extractPagesText(
  buffer: Buffer,
  startPage: number,
  endPage: number
): Promise<string> {
  try {
    const pageTexts: string[] = []
    let currentPage = 0

    const options = {
      pagerender: function (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) {
        currentPage++
        if (currentPage >= startPage && currentPage <= endPage) {
          return pageData.getTextContent().then(function (textContent) {
            const text = textContent.items.map((item) => item.str).join(' ')
            pageTexts.push(`[Page ${currentPage}]\n${text}`)
            return text
          })
        }
        return Promise.resolve('')
      },
    }

    await pdf(buffer, options)

    return pageTexts.join('\n\n')
  } catch (error) {
    console.error('Error extracting pages text:', error)
    throw new Error(`Failed to extract text from pages ${startPage}-${endPage}`)
  }
}
