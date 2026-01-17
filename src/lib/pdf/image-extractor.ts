/**
 * PDF Image Extraction Module
 * Extracts image positions from PDF pages using PDF.js operator list parsing.
 * Images are detected via OPS.paintImageXObject operator.
 *
 * Uses pdfjs-dist directly instead of pdf-parse to avoid browser API issues
 * (Image, document not defined in Node.js environment).
 */

// Use require for Node.js compatibility with pdfjs-dist
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

// Disable worker for Node.js environment
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

// PDF.js OPS enum values for image operations
const OPS = {
  paintImageXObject: 85,
  paintImageXObjectRepeat: 86,
  paintInlineImageXObject: 87,
  paintInlineImageXObjectGroup: 88,
}

interface OperatorList {
  fnArray: number[]
  argsArray: unknown[][]
}

/**
 * Detected image with normalized coordinates (0-1)
 */
export interface DetectedImageRect {
  x: number       // Left edge, 0-1
  y: number       // Top edge, 0-1
  width: number   // Width, 0-1
  height: number  // Height, 0-1
}

/**
 * Image detection result for a single page
 */
export interface PageImageResult {
  page: number
  images: DetectedImageRect[]
  pdfType: 'ppt' | 'textbook' | null
}

/**
 * Filtering configuration based on PDF type
 */
interface FilterConfig {
  minAreaRatio: number       // Minimum image area as ratio of page area
  headerFooterZone: number   // Top/bottom zone to filter (0-1)
  maxBannerWidth: number     // Max width for header/footer banners (0-1)
  filterPageSized: boolean   // Filter page-sized background images
}

const PPT_FILTER: FilterConfig = {
  minAreaRatio: 0.03,        // 3% of page
  headerFooterZone: 0.05,    // Top/bottom 5%
  maxBannerWidth: 0.80,      // 80% width
  filterPageSized: true,     // Skip page-sized backgrounds
}

const TEXTBOOK_FILTER: FilterConfig = {
  minAreaRatio: 0.02,        // 2% of page
  headerFooterZone: 0.08,    // Top/bottom 8%
  maxBannerWidth: 0.60,      // 60% width
  filterPageSized: false,
}

/**
 * Load PDF document from buffer using pdfjs-dist
 */
async function loadPdfDocument(buffer: Buffer): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  })
  return loadingTask.promise
}

/**
 * Detect PDF type based on text density and layout.
 * Simple heuristic: low word count per page suggests PPT.
 */
async function detectPdfTypeSimple(
  pdfDoc: PDFDocumentProxy,
  samplePages: number = 3
): Promise<'ppt' | 'textbook'> {
  let totalWords = 0
  const pagesToAnalyze = Math.min(samplePages, pdfDoc.numPages)

  for (let i = 1; i <= pagesToAnalyze; i++) {
    try {
      const page = await pdfDoc.getPage(i)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      const words = text.split(/\s+/).filter((w) => w.length > 0).length
      totalWords += words
    } catch {
      // Ignore errors
    }
  }

  if (pagesToAnalyze === 0) return 'textbook'

  const avgWords = totalWords / pagesToAnalyze
  // PPT typically has < 100 words per slide, textbooks have > 200
  return avgWords < 150 ? 'ppt' : 'textbook'
}

/**
 * Apply filtering rules based on PDF type.
 * Returns true if image should be kept.
 */
function shouldKeepImage(
  rect: DetectedImageRect,
  config: FilterConfig
): boolean {
  const area = rect.width * rect.height

  // Filter by minimum area
  if (area < config.minAreaRatio) {
    return false
  }

  // Filter page-sized backgrounds (PPT only)
  if (config.filterPageSized && area > 0.9) {
    return false
  }

  // Filter header/footer banners
  const isInHeader = rect.y < config.headerFooterZone
  const isInFooter = (rect.y + rect.height) > (1 - config.headerFooterZone)
  const isWideBanner = rect.width > config.maxBannerWidth

  if ((isInHeader || isInFooter) && isWideBanner) {
    return false
  }

  return true
}

/**
 * Extract image positions from a single PDF page.
 * Uses PDF.js operator list to find paintImageXObject operations.
 */
async function extractImagesFromPage(
  page: PDFPageProxy,
  pageNumber: number,
  pdfType: 'ppt' | 'textbook'
): Promise<DetectedImageRect[]> {
  try {
    const operatorList = await page.getOperatorList()

    if (!operatorList || !operatorList.fnArray) {
      console.warn('[ImageExtract] No operator list for page', pageNumber)
      return []
    }

    const viewport = page.getViewport({ scale: 1 })
    const { width: pageWidth, height: pageHeight } = viewport

    const images: DetectedImageRect[] = []
    const filterConfig = pdfType === 'ppt' ? PPT_FILTER : TEXTBOOK_FILTER

    // Count image operations for debugging
    let imageOpsFound = 0

    // Current transformation matrix (CTM) - tracks coordinate transforms
    // PDF uses bottom-left origin, we normalize to top-left 0-1
    const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]] // [a, b, c, d, e, f]

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i]
      const args = operatorList.argsArray[i]

      // Handle transformation operations
      if (op === 10) { // OPS.save
        ctmStack.push([...ctmStack[ctmStack.length - 1]])
      } else if (op === 11) { // OPS.restore
        if (ctmStack.length > 1) ctmStack.pop()
      } else if (op === 12) { // OPS.transform
        // Compose transform with current CTM
        const [a, b, c, d, e, f] = args as number[]
        const current = ctmStack[ctmStack.length - 1]
        ctmStack[ctmStack.length - 1] = [
          current[0] * a + current[2] * b,
          current[1] * a + current[3] * b,
          current[0] * c + current[2] * d,
          current[1] * c + current[3] * d,
          current[0] * e + current[2] * f + current[4],
          current[1] * e + current[3] * f + current[5],
        ]
      }

      // Detect image painting operations
      if (
        op === OPS.paintImageXObject ||
        op === OPS.paintImageXObjectRepeat ||
        op === OPS.paintInlineImageXObject ||
        op === OPS.paintInlineImageXObjectGroup
      ) {
        imageOpsFound++
        const ctm = ctmStack[ctmStack.length - 1]

        // Image dimensions come from the transform
        // In PDF, images are 1x1 unit, scaled by CTM
        const imgWidth = Math.abs(ctm[0])
        const imgHeight = Math.abs(ctm[3])
        const imgX = ctm[4]
        const imgY = ctm[5]

        // Normalize to 0-1 coordinates (convert from bottom-left to top-left)
        const rect: DetectedImageRect = {
          x: Math.max(0, Math.min(1, imgX / pageWidth)),
          y: Math.max(0, Math.min(1, 1 - (imgY + imgHeight) / pageHeight)),
          width: Math.max(0, Math.min(1, imgWidth / pageWidth)),
          height: Math.max(0, Math.min(1, imgHeight / pageHeight)),
        }

        // Apply filtering
        if (shouldKeepImage(rect, filterConfig)) {
          images.push(rect)
        }
      }
    }

    console.log('[ImageExtract] Page', pageNumber, 'results:', {
      imageOpsFound,
      imagesKept: images.length,
      pdfType,
    })

    return images
  } catch (error) {
    console.error('Error extracting images from page:', error)
    return []
  }
}

/**
 * Extract images from a PDF file.
 *
 * @param buffer - PDF file buffer
 * @param options - Extraction options
 * @returns Array of page results with detected images
 */
export async function extractPdfImages(
  buffer: Buffer,
  options: {
    maxPages?: number      // Maximum pages to process (default: all)
    startPage?: number     // Start page (1-indexed, default: 1)
    detectType?: boolean   // Auto-detect PDF type (default: true)
    pdfType?: 'ppt' | 'textbook' // Override PDF type detection
  } = {}
): Promise<{
  results: PageImageResult[]
  totalPages: number
  pdfType: 'ppt' | 'textbook'
  pagesProcessed: number
}> {
  const {
    maxPages,
    startPage = 1,
    detectType = true,
    pdfType: forcedType,
  } = options

  const pdfDoc = await loadPdfDocument(buffer)
  const totalPages = pdfDoc.numPages

  // Detect PDF type if not forced
  const pdfType = forcedType ?? (detectType ? await detectPdfTypeSimple(pdfDoc) : 'textbook')

  const results: PageImageResult[] = []
  let pagesProcessed = 0

  const endPage = maxPages ? Math.min(startPage + maxPages - 1, totalPages) : totalPages

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const images = await extractImagesFromPage(page, pageNum, pdfType)

    results.push({
      page: pageNum,
      images,
      pdfType,
    })

    pagesProcessed++
  }

  // Clean up
  await pdfDoc.destroy()

  return {
    results,
    totalPages,
    pdfType,
    pagesProcessed,
  }
}

/**
 * Extract images from a single page of a PDF.
 * Used for lazy extraction of pages >50.
 *
 * @param buffer - PDF file buffer
 * @param pageNumber - Page number (1-indexed)
 * @param pdfType - PDF type for filtering
 * @param skipFiltering - If true, return all images without applying filter rules
 */
export async function extractSinglePageImages(
  buffer: Buffer,
  pageNumber: number,
  pdfType: 'ppt' | 'textbook',
  skipFiltering: boolean = false
): Promise<PageImageResult> {
  const pdfDoc = await loadPdfDocument(buffer)

  try {
    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
      return {
        page: pageNumber,
        images: [],
        pdfType,
      }
    }

    const page = await pdfDoc.getPage(pageNumber)
    const images = skipFiltering
      ? await extractImagesFromPageUnfiltered(page, pageNumber)
      : await extractImagesFromPage(page, pageNumber, pdfType)

    return {
      page: pageNumber,
      images,
      pdfType,
    }
  } finally {
    await pdfDoc.destroy()
  }
}

/**
 * Extract all images from a page WITHOUT applying filter rules.
 * Used for mark mode detection where user clicks on potentially filtered images.
 */
async function extractImagesFromPageUnfiltered(
  page: PDFPageProxy,
  pageNumber: number
): Promise<DetectedImageRect[]> {
  try {
    const operatorList = await page.getOperatorList()

    if (!operatorList || !operatorList.fnArray) {
      console.warn('[ImageExtract] No operator list for page', pageNumber)
      return []
    }

    const viewport = page.getViewport({ scale: 1 })
    const { width: pageWidth, height: pageHeight } = viewport

    const images: DetectedImageRect[] = []

    // Current transformation matrix (CTM) - tracks coordinate transforms
    const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]]

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i]
      const args = operatorList.argsArray[i]

      // Handle transformation operations
      if (op === 10) { // OPS.save
        ctmStack.push([...ctmStack[ctmStack.length - 1]])
      } else if (op === 11) { // OPS.restore
        if (ctmStack.length > 1) ctmStack.pop()
      } else if (op === 12) { // OPS.transform
        const [a, b, c, d, e, f] = args as number[]
        const current = ctmStack[ctmStack.length - 1]
        ctmStack[ctmStack.length - 1] = [
          current[0] * a + current[2] * b,
          current[1] * a + current[3] * b,
          current[0] * c + current[2] * d,
          current[1] * c + current[3] * d,
          current[0] * e + current[2] * f + current[4],
          current[1] * e + current[3] * f + current[5],
        ]
      }

      // Detect image painting operations (same as filtered version)
      if (
        op === OPS.paintImageXObject ||
        op === OPS.paintImageXObjectRepeat ||
        op === OPS.paintInlineImageXObject ||
        op === OPS.paintInlineImageXObjectGroup
      ) {
        const ctm = ctmStack[ctmStack.length - 1]

        const imgWidth = Math.abs(ctm[0])
        const imgHeight = Math.abs(ctm[3])
        const imgX = ctm[4]
        const imgY = ctm[5]

        // Normalize to 0-1 coordinates
        const rect: DetectedImageRect = {
          x: Math.max(0, Math.min(1, imgX / pageWidth)),
          y: Math.max(0, Math.min(1, 1 - (imgY + imgHeight) / pageHeight)),
          width: Math.max(0, Math.min(1, imgWidth / pageWidth)),
          height: Math.max(0, Math.min(1, imgHeight / pageHeight)),
        }

        // NO filtering - add all images
        images.push(rect)
      }
    }

    console.log('[ImageExtract] Page', pageNumber, 'unfiltered results:', {
      imagesFound: images.length,
    })

    return images
  } catch (error) {
    console.error('Error extracting images from page (unfiltered):', error)
    return []
  }
}

/**
 * Get total page count from a PDF.
 */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfDoc = await loadPdfDocument(buffer)
  const numPages = pdfDoc.numPages
  await pdfDoc.destroy()
  return numPages
}
