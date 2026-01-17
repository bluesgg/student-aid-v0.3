'use client'

import { get, isApiError } from '@/lib/api-client'
import { parseSSEStream } from '@/lib/openai/streaming'

// Types
export interface QAInteraction {
  id: string
  userId: string
  courseId: string
  fileId: string
  question: string
  answerMarkdown: string
  references: Array<{ page: number; type: string }>
  createdAt: string
  interactionType: 'question' | 'explain'
  sourcePage: number | null
  selectedText: string | null
}

export interface ExplainSelectionParams {
  courseId: string
  fileId: string
  page: number
  selectedText: string
  pdfType: PdfType
  locale?: string
  parentContext?: string
}

export interface Summary {
  id: string
  userId: string
  courseId: string
  fileId: string | null
  type: 'document' | 'section' | 'course'
  pageRangeStart: number | null
  pageRangeEnd: number | null
  contentMarkdown: string
  createdAt: string
}

export interface SummaryResponse {
  id: string
  type: 'document' | 'section'
  content: string
  pageRangeStart: number | null
  pageRangeEnd: number | null
  cached: boolean
  createdAt: string
}

export type PdfType = 'Lecture' | 'Homework' | 'Exam' | 'Other'

interface StreamingSummaryCallbacks {
  onChunk?: (chunk: string) => void
  onComplete?: (summary: SummaryResponse) => void
}

interface SummaryDefaults {
  type: 'document' | 'section'
  pageRangeStart: number | null
  pageRangeEnd: number | null
}

async function handleSummaryResponse(
  response: Response,
  callbacks: StreamingSummaryCallbacks,
  defaults: SummaryDefaults
): Promise<SummaryResponse | void> {
  const contentType = response.headers.get('Content-Type')
  if (contentType?.includes('application/json')) {
    const data = await response.json()
    if (data.data?.cached) {
      return data.data as SummaryResponse
    }
  }

  const summaryId = response.headers.get('X-Summary-Id')
  const summaryType = response.headers.get('X-Summary-Type') as 'document' | 'section'
  let fullContent = ''

  for await (const chunk of parseSSEStream(response)) {
    if (chunk.error) {
      throw new Error(chunk.error)
    }
    if (chunk.content) {
      fullContent += chunk.content
      callbacks.onChunk?.(chunk.content)
    }
    if (chunk.done) {
      const summaryResponse: SummaryResponse = {
        id: summaryId || '',
        type: summaryType || defaults.type,
        content: fullContent,
        pageRangeStart: defaults.pageRangeStart,
        pageRangeEnd: defaults.pageRangeEnd,
        cached: false,
        createdAt: new Date().toISOString(),
      }
      callbacks.onComplete?.(summaryResponse)
      break
    }
  }
}

// Q&A API Functions

export async function askQuestion(
  params: {
    courseId: string
    fileId: string
    question: string
    pdfType: PdfType
  },
  onChunk: (chunk: string) => void,
  onComplete: (qaId: string | null) => void
): Promise<void> {
  const response = await fetch('/api/ai/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to ask question')
  }

  const qaId = response.headers.get('X-QA-Id')

  for await (const chunk of parseSSEStream(response)) {
    if (chunk.error) {
      throw new Error(chunk.error)
    }
    if (chunk.content) {
      onChunk(chunk.content)
    }
    if (chunk.done) {
      onComplete(qaId)
      break
    }
  }
}

export async function getQAHistory(fileId: string): Promise<{ items: QAInteraction[] }> {
  const result = await get<{ items: QAInteraction[] }>(
    `/api/ai/qa?fileId=${fileId}`
  )

  if (isApiError(result)) {
    throw new Error(result.error.message)
  }

  return result.data
}

/**
 * Explain selected text and save to Q&A history
 */
export async function explainSelection(
  params: ExplainSelectionParams,
  onChunk: (chunk: string) => void,
  onComplete: (qaId: string | null) => void
): Promise<void> {
  const response = await fetch('/api/ai/qa-explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to explain selection')
  }

  const qaId = response.headers.get('X-QA-Id')

  for await (const chunk of parseSSEStream(response)) {
    if (chunk.error) {
      throw new Error(chunk.error)
    }
    if (chunk.content) {
      onChunk(chunk.content)
    }
    if (chunk.done) {
      onComplete(qaId)
      break
    }
  }
}

// Summary API Functions

export async function getDocumentSummary(
  params: {
    courseId: string
    fileId: string
    pdfType: PdfType
  },
  onChunk?: (chunk: string) => void,
  onComplete?: (summary: SummaryResponse) => void
): Promise<SummaryResponse | void> {
  const response = await fetch('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to generate summary')
  }

  return handleSummaryResponse(
    response,
    { onChunk, onComplete },
    { type: 'document', pageRangeStart: null, pageRangeEnd: null }
  )
}

export async function getSectionSummary(
  params: {
    courseId: string
    fileId: string
    pdfType: PdfType
    startPage: number
    endPage: number
  },
  onChunk?: (chunk: string) => void,
  onComplete?: (summary: SummaryResponse) => void
): Promise<SummaryResponse | void> {
  const response = await fetch('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to generate section summary')
  }

  return handleSummaryResponse(
    response,
    { onChunk, onComplete },
    { type: 'section', pageRangeStart: params.startPage, pageRangeEnd: params.endPage }
  )
}

/**
 * Get existing summaries for a file
 */
export async function getSummaries(
  fileId: string,
  type?: 'document' | 'section'
): Promise<{ items: Summary[] }> {
  let url = `/api/ai/summarize?fileId=${fileId}`
  if (type) {
    url += `&type=${type}`
  }

  const result = await get<{ items: Summary[] }>(url)

  if (isApiError(result)) {
    throw new Error(result.error.message)
  }

  return result.data
}
