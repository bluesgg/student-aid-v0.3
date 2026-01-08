/**
 * Q&A prompt engineering for PDF-based question answering.
 */

export interface QAPromptParams {
  question: string
  documentText: string
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  fileName: string
  totalPages: number
}

/**
 * Build a prompt for Q&A about a PDF document.
 * The prompt instructs the model to reference page numbers.
 */
export function buildQAPrompt(params: QAPromptParams): string {
  const { question, documentText, pdfType, fileName, totalPages } = params

  return `You are an expert educational AI tutor helping a student understand a ${pdfType.toLowerCase()} document.

DOCUMENT INFORMATION:
- File: ${fileName}
- Type: ${pdfType}
- Total Pages: ${totalPages}

DOCUMENT CONTENT:
${documentText}

---

STUDENT QUESTION:
${question}

---

INSTRUCTIONS:
1. Answer the student's question based ONLY on the document content provided above
2. If the answer is found in specific pages, ALWAYS include page references like "As shown on page 3..." or "(see page 5)"
3. If the question cannot be answered from the document content, say so clearly
4. Use clear, educational language appropriate for a university student
5. Structure your answer with headers if it covers multiple points
6. Use Markdown formatting for clarity
7. For mathematical content, use LaTeX notation: $inline$ for inline math, $$block$$ for block equations
8. Be thorough but concise - aim for helpful, actionable explanations

Provide your answer:`
}

/**
 * Extract page references from AI response.
 * Returns an array of page numbers mentioned in the response.
 */
export function extractPageReferences(response: string): number[] {
  const pagePatterns = [
    /page\s*(\d+)/gi,
    /pages?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi,
    /\(p\.?\s*(\d+)\)/gi,
    /\(pp\.?\s*(\d+)[-–](\d+)\)/gi,
  ]

  const pages = new Set<number>()

  for (const pattern of pagePatterns) {
    let match
    while ((match = pattern.exec(response)) !== null) {
      const startPage = parseInt(match[1], 10)
      if (!isNaN(startPage)) {
        pages.add(startPage)
      }
      if (match[2]) {
        const endPage = parseInt(match[2], 10)
        if (!isNaN(endPage)) {
          for (let i = startPage; i <= endPage; i++) {
            pages.add(i)
          }
        }
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b)
}
