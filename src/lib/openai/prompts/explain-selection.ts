/**
 * Prompts for manual selection explain feature.
 * Explains a user-selected text snippet.
 */

export interface ExplainSelectionContext {
  selectedText: string
  pageText: string
  pageNumber: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  parentContent?: string // For follow-up questions
  depth: number
}

export function buildExplainSelectionPrompt(context: ExplainSelectionContext): string {
  const typeContext = {
    Lecture: 'lecture notes',
    Homework: 'homework assignment',
    Exam: 'exam',
    Other: 'educational document',
  }[context.pdfType]

  // Follow-up question context
  const followUpContext = context.parentContent
    ? `\n\nThis is a follow-up question (depth ${context.depth}/10). The previous explanation was:\n---\n${context.parentContent}\n---\n\nThe student wants more detail about a specific part of the previous explanation.`
    : ''

  return `You are an expert educational AI tutor helping a student understand ${typeContext}.

The student has selected the following text and wants it explained:

SELECTED TEXT:
"${context.selectedText}"

SURROUNDING CONTEXT (Page ${context.pageNumber}):
---
${context.pageText.slice(0, 2000)}
---${followUpContext}

Provide a clear, helpful explanation that:
1. Directly addresses what the selected text means
2. Provides context for why it matters
3. Uses examples where helpful
4. Includes relevant mathematical formulas in LaTeX when applicable

Format your response in Markdown:
- Use headers (##, ###) to organize if the explanation has multiple parts
- Use bullet points for lists
- Use **bold** for key terms
- Use LaTeX for math: $inline$ or $$block$$
- Keep the explanation concise but thorough (150-400 words)

${context.depth > 0 ? 'Since this is a follow-up question, focus specifically on clarifying the selected portion rather than repeating previous explanations.' : ''}`
}

export function buildFollowUpPrompt(context: ExplainSelectionContext): string {
  return `You are an expert educational AI tutor. A student is asking a follow-up question about a previous explanation.

PREVIOUS EXPLANATION:
---
${context.parentContent}
---

STUDENT'S FOLLOW-UP QUESTION/SELECTION:
"${context.selectedText}"

Current follow-up depth: ${context.depth}/10

Provide a focused explanation that:
1. Directly addresses the student's specific question
2. Builds on the previous explanation without unnecessary repetition
3. Goes deeper into the specific concept being asked about
4. Uses examples and analogies where helpful

Format in Markdown with LaTeX for any mathematical expressions.
Keep the response focused and concise (100-300 words).`
}
