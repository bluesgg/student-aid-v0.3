/**
 * Prompts for auto-explain page feature.
 * Generates 2-6 stickers explaining key concepts on a page.
 */

export interface ExplainPageContext {
  pageText: string
  pageNumber: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  totalPages: number
}

export function buildExplainPagePrompt(context: ExplainPageContext): string {
  const typeContext = {
    Lecture: 'lecture notes or slides',
    Homework: 'homework or assignment',
    Exam: 'exam or quiz',
    Other: 'educational document',
  }[context.pdfType]

  return `You are an expert educational AI tutor. Analyze the following page from ${typeContext} and identify 2-6 key concepts, terms, or ideas that a student might need explained.

For each concept, provide a clear, helpful explanation that:
1. Defines the concept in simple terms
2. Explains its significance or context
3. Uses examples where helpful
4. Includes relevant mathematical formulas in LaTeX when applicable

PAGE ${context.pageNumber} OF ${context.totalPages}:
---
${context.pageText}
---

Respond in JSON format with an array of explanations:
{
  "explanations": [
    {
      "anchorText": "the exact text phrase from the page being explained (max 100 chars)",
      "explanation": "your explanation in Markdown format with LaTeX math ($...$ for inline, $$...$$ for block)"
    }
  ]
}

Guidelines:
- Focus on concepts that are central to understanding the page
- Keep explanations concise but thorough (100-300 words each)
- Use proper Markdown formatting (headers, lists, bold/italic)
- Use LaTeX for all mathematical expressions
- If this is a homework/exam page, explain the problem-solving approach rather than giving answers
- Return between 2 and 6 explanations based on content density`
}

export interface ExplainPageResponse {
  explanations: Array<{
    anchorText: string
    explanation: string
  }>
}

export function parseExplainPageResponse(content: string): ExplainPageResponse {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.explanations)) {
      throw new Error('Invalid response format: explanations must be an array')
    }

    return {
      explanations: parsed.explanations.slice(0, 6).map((e: { anchorText?: string; explanation?: string }) => ({
        anchorText: String(e.anchorText || '').slice(0, 100),
        explanation: String(e.explanation || ''),
      })),
    }
  } catch (error) {
    console.error('Failed to parse explain-page response:', error)
    // Return a fallback response
    return {
      explanations: [{
        anchorText: 'Page content',
        explanation: content,
      }],
    }
  }
}
