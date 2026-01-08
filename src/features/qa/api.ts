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

// Q&A API Functions

/**
 * Ask a question about a PDF with streaming response
 */
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

  // Parse SSE stream
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

/**
 * Get Q&A history for a file
 */
export async function getQAHistory(fileId: string): Promise<{ items: QAInteraction[] }> {
  const result = await get<{ items: QAInteraction[] }>(
    `/api/ai/qa?fileId=${fileId}`
  )

  if (isApiError(result)) {
    throw new Error(result.error.message)
  }

  return result.data
}

// Summary API Functions

/**
 * Generate or retrieve a document summary
 */
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

  // Check if it's a cached response (non-streaming)
  const contentType = response.headers.get('Content-Type')
  if (contentType?.includes('application/json')) {
    const data = await response.json()
    if (data.data?.cached) {
      return data.data as SummaryResponse
    }
  }

  // Handle streaming response
  const summaryId = response.headers.get('X-Summary-Id')
  const summaryType = response.headers.get('X-Summary-Type') as 'document' | 'section'
  let fullContent = ''

  for await (const chunk of parseSSEStream(response)) {
    if (chunk.error) {
      throw new Error(chunk.error)
    }
    if (chunk.content) {
      fullContent += chunk.content
      onChunk?.(chunk.content)
    }
    if (chunk.done) {
      const summaryResponse: SummaryResponse = {
        id: summaryId || '',
        type: summaryType || 'document',
        content: fullContent,
        pageRangeStart: null,
        pageRangeEnd: null,
        cached: false,
        createdAt: new Date().toISOString(),
      }
      onComplete?.(summaryResponse)
      break
    }
  }
}

/**
 * Generate or retrieve a section summary
 */
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

  // Check if it's a cached response
  const contentType = response.headers.get('Content-Type')
  if (contentType?.includes('application/json')) {
    const data = await response.json()
    if (data.data?.cached) {
      return data.data as SummaryResponse
    }
  }

  // Handle streaming response
  const summaryId = response.headers.get('X-Summary-Id')
  const summaryType = response.headers.get('X-Summary-Type') as 'document' | 'section'
  let fullContent = ''

  for await (const chunk of parseSSEStream(response)) {
    if (chunk.error) {
      throw new Error(chunk.error)
    }
    if (chunk.content) {
      fullContent += chunk.content
      onChunk?.(chunk.content)
    }
    if (chunk.done) {
      const summaryResponse: SummaryResponse = {
        id: summaryId || '',
        type: summaryType || 'section',
        content: fullContent,
        pageRangeStart: params.startPage,
        pageRangeEnd: params.endPage,
        cached: false,
        createdAt: new Date().toISOString(),
      }
      onComplete?.(summaryResponse)
      break
    }
  }
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
