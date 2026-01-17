/**
 * PDF Type Detection Module
 * Identifies whether a PDF is presentation-style (PPT) or text-heavy.
 * Used to optimize sticker generation strategy.
 */

import { countWords } from './page-metadata'
import { createAdminClient } from '@/lib/supabase/server'

// pdf-parse for text extraction
const pdf = require('pdf-parse') as (
  buffer: Buffer,
  options?: {
    pagerender?: (pageData: PageData) => Promise<string>
  }
) => Promise<PdfParseResult>

interface PageData {
  getTextContent: () => Promise<TextContent>
  getOperatorList?: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>
}

interface TextContent {
  items: Array<{
    str: string
    transform?: number[]
    width?: number
    height?: number
  }>
}

interface PdfParseResult {
  numpages: number
  text: string
  info?: {
    Creator?: string
    Producer?: string
    Title?: string
  }
  metadata?: {
    _metadata?: Record<string, string>
  }
}

/**
 * PDF type: presentation-style or text-heavy
 */
export type PdfType = 'ppt' | 'text'

/**
 * Score breakdown for debugging/analysis
 */
export interface TypeScoreBreakdown {
  imageAreaScore: number // 0-0.4
  textDensityScore: number // 0-0.3
  layoutScore: number // 0-0.2
  metadataScore: number // 0-0.1
  totalScore: number // 0-1.0
  type: PdfType
}

/**
 * Per-page analysis result
 */
interface PageAnalysis {
  pageNumber: number
  wordCount: number
  textDensity: number // words per page (estimate)
  hasBulletPoints: boolean
  hasCenteredText: boolean
  hasShortLines: boolean
  estimatedImageRatio: number
}

// PPT creation tools commonly found in PDF metadata
const PPT_CREATORS = [
  'powerpoint',
  'keynote',
  'prezi',
  'google slides',
  'libreoffice impress',
  'impress',
  'canva',
  'slideshare',
  'beautiful.ai',
]

// Standard page dimensions for A4/Letter (approximate)
const STANDARD_PAGE_WORDS = 500 // Rough estimate for dense text page

/**
 * Analyze a single page for type detection signals
 */
async function analyzePage(
  buffer: Buffer,
  pageNumber: number
): Promise<PageAnalysis | null> {
  try {
    let pageText = ''
    let textItems: Array<{ str: string; transform?: number[] }> = []
    let currentPage = 0

    const options = {
      pagerender: function (pageData: PageData) {
        currentPage++
        if (currentPage === pageNumber) {
          return pageData.getTextContent().then(function (textContent) {
            textItems = textContent.items
            pageText = textContent.items.map((item) => item.str).join(' ')
            return pageText
          })
        }
        return Promise.resolve('')
      },
    }

    await pdf(buffer, options)

    const wordCount = countWords(pageText)

    // Text density: ratio of words to expected full-page word count
    const textDensity = wordCount / STANDARD_PAGE_WORDS

    // Detect bullet points (common PPT pattern)
    const bulletPatterns = [
      /^\s*[•·●○▪▸►◆◇→➤✓✔☑]/m,
      /^\s*[-*]\s+/m,
      /^\s*\d+\.\s+/m,
      /^\s*[a-zA-Z]\)\s+/m,
    ]
    const hasBulletPoints = bulletPatterns.some((pattern) =>
      pattern.test(pageText)
    )

    // Detect centered text (common in PPT titles)
    // Heuristic: many short lines relative to word count
    const lines = pageText.split(/\n/).filter((l) => l.trim().length > 0)
    const avgLineLength =
      lines.length > 0
        ? lines.reduce((sum, l) => sum + l.trim().length, 0) / lines.length
        : 0
    const hasCenteredText = avgLineLength < 40 && lines.length > 2

    // Detect short lines pattern (PPT typically has shorter lines)
    const shortLineThreshold = 50
    const shortLines = lines.filter((l) => l.trim().length < shortLineThreshold)
    const hasShortLines = lines.length > 0 && shortLines.length / lines.length > 0.6

    // Estimate image ratio based on text sparsity
    // Very rough heuristic: low word count often indicates images
    const estimatedImageRatio = wordCount < 50 ? 0.7 : wordCount < 150 ? 0.3 : 0.1

    return {
      pageNumber,
      wordCount,
      textDensity,
      hasBulletPoints,
      hasCenteredText,
      hasShortLines,
      estimatedImageRatio,
    }
  } catch (error) {
    console.error(`Error analyzing page ${pageNumber}:`, error)
    return null
  }
}

/**
 * Get PDF metadata (Creator, Producer fields)
 */
async function getPdfMetadata(
  buffer: Buffer
): Promise<{ creator?: string; producer?: string }> {
  try {
    const data = await pdf(buffer)
    return {
      creator: data.info?.Creator?.toLowerCase(),
      producer: data.info?.Producer?.toLowerCase(),
    }
  } catch {
    return {}
  }
}

/**
 * Calculate image area score (40% weight)
 * Based on text sparsity across sample pages
 */
function calculateImageAreaScore(pageAnalyses: PageAnalysis[]): number {
  if (pageAnalyses.length === 0) return 0

  const avgImageRatio =
    pageAnalyses.reduce((sum, p) => sum + p.estimatedImageRatio, 0) /
    pageAnalyses.length

  // Score: 0-0.4 based on image ratio
  // avgImageRatio > 0.5 => 0.4 (max score)
  // avgImageRatio = 0 => 0
  return Math.min(0.4, avgImageRatio * 0.8)
}

/**
 * Calculate text density score (30% weight)
 * Low text density suggests PPT-style
 */
function calculateTextDensityScore(pageAnalyses: PageAnalysis[]): number {
  if (pageAnalyses.length === 0) return 0

  const avgDensity =
    pageAnalyses.reduce((sum, p) => sum + p.textDensity, 0) / pageAnalyses.length

  // Score: 0-0.3 based on inverse of text density
  // Low density (< 0.2) => high score (PPT)
  // High density (> 0.8) => low score (text)
  if (avgDensity < 0.2) return 0.3
  if (avgDensity < 0.4) return 0.2
  if (avgDensity < 0.6) return 0.1
  return 0
}

/**
 * Calculate layout score (20% weight)
 * Based on bullet points, centered text, short lines
 */
function calculateLayoutScore(pageAnalyses: PageAnalysis[]): number {
  if (pageAnalyses.length === 0) return 0

  let score = 0

  // Bullet points are common in PPT
  const bulletRatio =
    pageAnalyses.filter((p) => p.hasBulletPoints).length / pageAnalyses.length
  score += bulletRatio * 0.07

  // Centered text is common in PPT titles
  const centeredRatio =
    pageAnalyses.filter((p) => p.hasCenteredText).length / pageAnalyses.length
  score += centeredRatio * 0.07

  // Short lines are common in PPT
  const shortLineRatio =
    pageAnalyses.filter((p) => p.hasShortLines).length / pageAnalyses.length
  score += shortLineRatio * 0.06

  return Math.min(0.2, score)
}

/**
 * Calculate metadata score (10% weight)
 * Based on PDF creator field
 */
function calculateMetadataScore(metadata: {
  creator?: string
  producer?: string
}): number {
  const creatorText = `${metadata.creator || ''} ${metadata.producer || ''}`

  for (const tool of PPT_CREATORS) {
    if (creatorText.includes(tool)) {
      return 0.1
    }
  }

  return 0
}

/**
 * Identify PDF type by analyzing sample pages.
 * Uses multi-dimensional scoring:
 * - Image/text ratio (40%)
 * - Text density (30%)
 * - Layout patterns (20%)
 * - PDF metadata (10%)
 *
 * @param buffer - PDF file as Buffer
 * @param samplePages - Number of pages to sample (default: 5)
 * @returns PDF type and optional score breakdown
 */
export async function identifyPdfType(
  buffer: Buffer,
  samplePages: number = 5
): Promise<{ type: PdfType; breakdown?: TypeScoreBreakdown }> {
  try {
    // Get page count
    const data = await pdf(buffer)
    const totalPages = data.numpages

    if (totalPages === 0) {
      return { type: 'text' }
    }

    // Sample pages evenly distributed
    const pagesToSample = Math.min(samplePages, totalPages)
    const sampleIndices: number[] = []

    if (pagesToSample === totalPages) {
      // Sample all pages
      for (let i = 1; i <= totalPages; i++) {
        sampleIndices.push(i)
      }
    } else {
      // Evenly distribute samples
      const step = Math.floor(totalPages / pagesToSample)
      for (let i = 0; i < pagesToSample; i++) {
        sampleIndices.push(Math.min(1 + i * step, totalPages))
      }
    }

    // Analyze sample pages
    const pageAnalyses: PageAnalysis[] = []
    for (const pageNum of sampleIndices) {
      const analysis = await analyzePage(buffer, pageNum)
      if (analysis) {
        pageAnalyses.push(analysis)
      }
    }

    // Get metadata
    const metadata = await getPdfMetadata(buffer)

    // Calculate scores
    const imageAreaScore = calculateImageAreaScore(pageAnalyses)
    const textDensityScore = calculateTextDensityScore(pageAnalyses)
    const layoutScore = calculateLayoutScore(pageAnalyses)
    const metadataScore = calculateMetadataScore(metadata)

    const totalScore =
      imageAreaScore + textDensityScore + layoutScore + metadataScore

    // Threshold: >0.6 is PPT, <=0.6 is text
    const type: PdfType = totalScore > 0.6 ? 'ppt' : 'text'

    return {
      type,
      breakdown: {
        imageAreaScore,
        textDensityScore,
        layoutScore,
        metadataScore,
        totalScore,
        type,
      },
    }
  } catch (error) {
    console.error('Error identifying PDF type:', error)
    // Default to text on error
    return { type: 'text' }
  }
}

/**
 * Get or detect PDF type with caching.
 * Checks files table first, then detects and caches.
 *
 * @param fileId - File ID in database
 * @param pdfBuffer - PDF buffer for detection if not cached
 * @returns PDF type
 */
export async function getOrDetectPdfType(
  fileId: string,
  pdfBuffer?: Buffer
): Promise<PdfType> {
  const supabase = createAdminClient()

  // Check cache in files table
  const { data: file } = await supabase
    .from('files')
    .select('pdf_type_detected')
    .eq('id', fileId)
    .single()

  if (file?.pdf_type_detected) {
    return file.pdf_type_detected as PdfType
  }

  // If no buffer provided, default to text
  if (!pdfBuffer) {
    return 'text'
  }

  // Detect type
  const { type } = await identifyPdfType(pdfBuffer)

  // Cache result
  await supabase
    .from('files')
    .update({ pdf_type_detected: type })
    .eq('id', fileId)

  return type
}

/**
 * Export individual scoring functions for testing
 */
export const _testing = {
  analyzePage,
  getPdfMetadata,
  calculateImageAreaScore,
  calculateTextDensityScore,
  calculateLayoutScore,
  calculateMetadataScore,
}
