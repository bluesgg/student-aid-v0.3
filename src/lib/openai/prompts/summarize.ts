/**
 * Summary prompt engineering for PDF document and section summaries.
 */

export interface DocumentSummaryParams {
  documentText: string
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  fileName: string
  totalPages: number
}

export interface SectionSummaryParams {
  sectionText: string
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  fileName: string
  startPage: number
  endPage: number
}

/**
 * Build a prompt for summarizing an entire document.
 */
export function buildDocumentSummaryPrompt(params: DocumentSummaryParams): string {
  const { documentText, pdfType, fileName, totalPages } = params

  return `You are an expert educational AI tutor creating a comprehensive summary of a ${pdfType.toLowerCase()} document.

DOCUMENT INFORMATION:
- File: ${fileName}
- Type: ${pdfType}
- Total Pages: ${totalPages}

DOCUMENT CONTENT:
${documentText}

---

INSTRUCTIONS:
Create a comprehensive but concise summary of this document. Your summary should:

1. **Overview**: Start with a 2-3 sentence high-level overview of the document's main topic and purpose

2. **Key Concepts**: List and briefly explain the main concepts, theories, or topics covered (use bullet points)

3. **Important Details**: Highlight critical formulas, definitions, dates, or facts that students should remember

4. **Structure**: If the document has clear sections or chapters, organize the summary accordingly

5. **Study Focus**: End with 3-5 key takeaways or points that would be important for exams

FORMATTING:
- Use Markdown with clear headers (##, ###)
- Use bullet points and numbered lists for clarity
- For mathematical content, use LaTeX: $inline$ or $$block$$
- Keep the total summary under 800 words
- Include page references where helpful (e.g., "see page 5")

Provide the summary:`
}

/**
 * Build a prompt for summarizing a section of pages.
 */
export function buildSectionSummaryPrompt(params: SectionSummaryParams): string {
  const { sectionText, pdfType, fileName, startPage, endPage } = params

  const pageRange = startPage === endPage
    ? `page ${startPage}`
    : `pages ${startPage}-${endPage}`

  return `You are an expert educational AI tutor creating a focused summary of a section from a ${pdfType.toLowerCase()} document.

SECTION INFORMATION:
- File: ${fileName}
- Type: ${pdfType}
- Section: ${pageRange}

SECTION CONTENT:
${sectionText}

---

INSTRUCTIONS:
Create a focused summary of this section. Your summary should:

1. **Main Topic**: Identify the main topic or theme of this section

2. **Key Points**: Summarize the most important concepts, facts, or arguments presented

3. **Details**: Note any important formulas, definitions, examples, or diagrams discussed

4. **Connections**: If applicable, mention how this section relates to broader topics

FORMATTING:
- Use Markdown with clear structure
- Use bullet points for key information
- For mathematical content, use LaTeX: $inline$ or $$block$$
- Keep the summary concise (200-400 words)
- Reference specific page numbers when relevant

Provide the section summary:`
}

/**
 * Determine the summary type based on parameters.
 */
export function getSummaryType(
  startPage?: number,
  endPage?: number,
  totalPages?: number
): 'document' | 'section' {
  // If no page range specified, or range covers entire document, it's a document summary
  if (!startPage || !endPage) {
    return 'document'
  }

  if (totalPages && startPage === 1 && endPage >= totalPages) {
    return 'document'
  }

  return 'section'
}
