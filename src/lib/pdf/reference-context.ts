/**
 * Reference context derivation for image region explanations.
 * 
 * Algorithm:
 * 1. Extract label from image page text (e.g., "Figure 7", "表3")
 * 2. Search corpus for references to that label
 * 3. Return matched paragraph + preceding context
 * 4. Fallback to image page local context if no reference found
 */

// ==================== Label Patterns ====================

/**
 * Label extraction patterns for different languages.
 * MVP patterns cover ~85% of academic cases (numbers and decimals only).
 */
const LABEL_PATTERNS = {
  // English: Figure/Fig./Table/Equation/Eq./Algorithm/Alg. + number
  en: /(?:Figure|Fig\.?|Table|Equation|Eq\.?|Algorithm|Alg\.?)\s*[:#]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/gi,
  // Chinese: 图/表/公式/算法 + number
  zh: /(?:图|表|公式|算法)\s*[:：]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/g,
  // Chinese ordinal: 第X图/表/式/公式 (common in textbooks)
  zh_ord: /第\s*(\d+(?:\.\d+)?)\s*(?:图|表|式|公式)/g,
}

/**
 * Reference search patterns for finding where labels are mentioned.
 * These patterns match text that references a figure/table/etc.
 */
const REFERENCE_PATTERNS = {
  // English patterns
  en: [
    /(?:see|shown\s+in|illustrated\s+in|depicted\s+in|presented\s+in|as\s+in|refer\s+to)\s+(?:Figure|Fig\.?)\s*(\d+(?:\.\d+)?)/gi,
    /(?:Figure|Fig\.?)\s*(\d+(?:\.\d+)?)\s+(?:shows|illustrates|depicts|presents|demonstrates)/gi,
    /(?:Table|Tab\.?)\s*(\d+(?:\.\d+)?)\s+(?:shows|lists|summarizes|presents|contains)/gi,
    /(?:see|in)\s+(?:Table|Tab\.?)\s*(\d+(?:\.\d+)?)/gi,
    /(?:Equation|Eq\.?)\s*[\(]?(\d+(?:\.\d+)?)[\)]?\s+(?:defines|represents|gives|shows)/gi,
  ],
  // Chinese patterns  
  zh: [
    /如(?:图|表)\s*(\d+(?:\.\d+)?)\s*所示/g,
    /见(?:图|表)\s*(\d+(?:\.\d+)?)/g,
    /(?:图|表)\s*(\d+(?:\.\d+)?)\s*(?:展示|显示|列出|给出)/g,
    /由(?:公式|式)\s*[\(（]?(\d+(?:\.\d+)?)[\)）]?\s*(?:可得|定义|表示)/g,
    /根据(?:图|表|公式)\s*(\d+(?:\.\d+)?)/g,
  ],
}

// ==================== Types ====================

export type LabelType = 'figure' | 'table' | 'equation' | 'algorithm' | 'unknown'

export interface ExtractedLabel {
  type: LabelType
  value: string  // e.g., "7" or "3.2"
  fullMatch: string  // e.g., "Figure 7" or "图3.2"
}

export interface ReferenceMatch {
  page: number
  paragraph: string
  previousParagraph?: string
  matchPosition: number
}

export interface ReferenceContextResult {
  context: string
  /** Telemetry data for monitoring */
  telemetry: {
    label_extracted: boolean
    ref_match_found: boolean
    label_type?: LabelType
    label_value?: string
    fallback_used: boolean
    source_page?: number
  }
}

// ==================== Label Extraction ====================

/**
 * Determine the label type from the matched string.
 */
function determineLabelType(match: string): LabelType {
  const lower = match.toLowerCase()
  if (/figure|fig\.?|图/.test(lower)) return 'figure'
  if (/table|tab\.?|表/.test(lower)) return 'table'
  if (/equation|eq\.?|公式|式/.test(lower)) return 'equation'
  if (/algorithm|alg\.?|算法/.test(lower)) return 'algorithm'
  return 'unknown'
}

/**
 * Extract labels from page text (e.g., "Figure 7", "表3").
 * Returns the first valid label found.
 * 
 * @param text - Page text to search
 * @returns Extracted label or null
 */
export function extractLabel(text: string): ExtractedLabel | null {
  // Try each pattern
  const allPatterns = [
    LABEL_PATTERNS.en,
    LABEL_PATTERNS.zh,
    LABEL_PATTERNS.zh_ord,
  ]

  for (const pattern of allPatterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match) {
      return {
        type: determineLabelType(match[0]),
        value: match[1],
        fullMatch: match[0].trim(),
      }
    }
  }

  return null
}

// ==================== Reference Search ====================

/**
 * Split text into paragraphs.
 * Handles various newline patterns.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

/**
 * Search for references to a label in page text.
 * 
 * @param pageTexts - Map of page number to page text
 * @param label - Label to search for
 * @returns Best reference match or null
 */
export function searchForReference(
  pageTexts: Map<number, string>,
  label: ExtractedLabel
): ReferenceMatch | null {
  const targetValue = label.value
  let bestMatch: ReferenceMatch | null = null
  let bestScore = 0

  // Search all pages
  for (const [page, text] of Array.from(pageTexts)) {
    const paragraphs = splitParagraphs(text)
    
    // Try English patterns
    for (const pattern of REFERENCE_PATTERNS.en) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        if (match[1] === targetValue) {
          // Found a match - get surrounding context
          const matchPos = match.index
          
          // Find the paragraph containing this match
          let currentPos = 0
          for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i]
            const paraStart = text.indexOf(para, currentPos)
            const paraEnd = paraStart + para.length
            
            if (matchPos >= paraStart && matchPos < paraEnd) {
              // This is the paragraph
              const score = computeMatchScore(para, page, label)
              if (score > bestScore) {
                bestScore = score
                bestMatch = {
                  page,
                  paragraph: para,
                  previousParagraph: i > 0 ? paragraphs[i - 1] : undefined,
                  matchPosition: matchPos,
                }
              }
              break
            }
            currentPos = paraEnd
          }
        }
      }
    }

    // Try Chinese patterns
    for (const pattern of REFERENCE_PATTERNS.zh) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        if (match[1] === targetValue) {
          const matchPos = match.index
          
          let currentPos = 0
          for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i]
            const paraStart = text.indexOf(para, currentPos)
            const paraEnd = paraStart + para.length
            
            if (matchPos >= paraStart && matchPos < paraEnd) {
              const score = computeMatchScore(para, page, label)
              if (score > bestScore) {
                bestScore = score
                bestMatch = {
                  page,
                  paragraph: para,
                  previousParagraph: i > 0 ? paragraphs[i - 1] : undefined,
                  matchPosition: matchPos,
                }
              }
              break
            }
            currentPos = paraEnd
          }
        }
      }
    }
  }

  return bestMatch
}

/**
 * Compute a score for a reference match.
 * Higher scores indicate better matches.
 */
function computeMatchScore(
  paragraph: string,
  _page: number,
  _label: ExtractedLabel
): number {
  let score = 100

  // Prefer longer paragraphs (more context)
  score += Math.min(paragraph.length / 10, 50)

  // Penalize very short paragraphs (likely headers/footers)
  if (paragraph.length < 50) {
    score -= 30
  }

  // Prefer paragraphs that look like body text (have multiple sentences)
  const sentenceCount = (paragraph.match(/[.。!?！？]/g) || []).length
  score += sentenceCount * 5

  return score
}

// ==================== Context Truncation ====================

/**
 * Truncate reference context to fit within character limit.
 * 
 * Strategy:
 * - Prioritize the matched paragraph over previous paragraph
 * - Don't cut mid-sentence if possible
 * 
 * @param text - Text to truncate
 * @param maxChars - Maximum character count (default 8000 ≈ 2000 tokens)
 * @returns Truncated text
 */
export function truncateReferenceContext(text: string, maxChars: number = 8000): string {
  if (text.length <= maxChars) return text

  // Find a good cut point (end of sentence)
  const truncated = text.substring(0, maxChars)
  
  // Try to find last sentence boundary
  const lastPeriod = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？')
  )

  // Only use sentence boundary if it's not too early in the text
  if (lastPeriod > maxChars * 0.7) {
    return truncated.substring(0, lastPeriod + 1)
  }

  return truncated
}

// ==================== Main API ====================

/**
 * Derive reference context for selected image regions.
 * 
 * Algorithm:
 * 1. Extract label from image page text
 * 2. Search all pages for references to that label
 * 3. Return matched paragraph + previous paragraph as context
 * 4. Fallback to image page local context if no reference found
 * 
 * @param imagePageText - Text from the page containing the image
 * @param imagePage - Page number where the image is located
 * @param allPageTexts - Map of all page texts for reference search
 * @param maxChars - Maximum context length
 * @returns Reference context and telemetry
 * 
 * @example
 * ```typescript
 * const result = deriveReferenceContext(
 *   "Figure 7: Network architecture diagram",
 *   13,
 *   new Map([[12, "As shown in Figure 7, the network..."], [13, "Figure 7: ..."]])
 * )
 * // result.context = "As shown in Figure 7, the network..."
 * ```
 */
export function deriveReferenceContext(
  imagePageText: string,
  imagePage: number,
  allPageTexts: Map<number, string>,
  maxChars: number = 8000
): ReferenceContextResult {
  // Step 1: Extract label from image page
  const label = extractLabel(imagePageText)

  if (!label) {
    // No label found - use image page context as fallback
    return {
      context: truncateReferenceContext(imagePageText, maxChars),
      telemetry: {
        label_extracted: false,
        ref_match_found: false,
        fallback_used: true,
        source_page: imagePage,
      },
    }
  }

  // Step 2: Search for references
  const reference = searchForReference(allPageTexts, label)

  if (!reference) {
    // No reference found - use image page context as fallback
    return {
      context: truncateReferenceContext(imagePageText, maxChars),
      telemetry: {
        label_extracted: true,
        ref_match_found: false,
        label_type: label.type,
        label_value: label.value,
        fallback_used: true,
        source_page: imagePage,
      },
    }
  }

  // Step 3: Build context from reference
  let context = ''
  if (reference.previousParagraph) {
    context += reference.previousParagraph + '\n\n'
  }
  context += reference.paragraph

  // Truncate if needed
  context = truncateReferenceContext(context, maxChars)

  return {
    context,
    telemetry: {
      label_extracted: true,
      ref_match_found: true,
      label_type: label.type,
      label_value: label.value,
      fallback_used: false,
      source_page: reference.page,
    },
  }
}

/**
 * Build reference context for multiple selected regions.
 * Combines context from all unique image pages.
 * 
 * @param regions - Selected image regions with page numbers
 * @param allPageTexts - Map of all page texts
 * @param maxChars - Maximum total context length
 * @returns Combined reference context and telemetry
 */
export function deriveMultiRegionReferenceContext(
  regions: Array<{ page: number }>,
  allPageTexts: Map<number, string>,
  maxChars: number = 8000
): ReferenceContextResult {
  // Get unique pages where images are located
  const uniquePages = Array.from(new Set(regions.map(r => r.page)))
  
  const contextParts: string[] = []
  const telemetryResults: Array<ReferenceContextResult['telemetry']> = []

  for (const page of uniquePages) {
    const pageText = allPageTexts.get(page) || ''
    const result = deriveReferenceContext(pageText, page, allPageTexts, maxChars / uniquePages.length)
    contextParts.push(result.context)
    telemetryResults.push(result.telemetry)
  }

  // Combine contexts
  const combinedContext = truncateReferenceContext(contextParts.join('\n\n---\n\n'), maxChars)

  // Aggregate telemetry
  const labelExtracted = telemetryResults.some(t => t.label_extracted)
  const refMatchFound = telemetryResults.some(t => t.ref_match_found)
  const fallbackUsed = telemetryResults.some(t => t.fallback_used)
  const firstWithLabel = telemetryResults.find(t => t.label_extracted)

  return {
    context: combinedContext,
    telemetry: {
      label_extracted: labelExtracted,
      ref_match_found: refMatchFound,
      label_type: firstWithLabel?.label_type,
      label_value: firstWithLabel?.label_value,
      fallback_used: fallbackUsed,
      source_page: telemetryResults[0]?.source_page,
    },
  }
}
