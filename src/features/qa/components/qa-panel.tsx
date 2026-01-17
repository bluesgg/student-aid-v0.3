'use client'

import { memo, useState, useEffect } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { useQA } from '../hooks/use-qa'
import { useQAHistory } from '../hooks/use-qa-history'
import { useSummarize, useSummaries } from '../hooks/use-summarize'
import { QAInput } from './qa-input'
import { QAHistory } from './qa-history'
import { SummaryButtons } from './summary-buttons'
import { SummaryCard } from './summary-card'
import { StreamingExplain } from './streaming-explain'
import type { PdfType } from '../api'

export interface ExplainRequest {
  selectedText: string
  page: number
  parentContext?: string
}

interface QAPanelProps {
  courseId: string
  fileId: string
  pdfType: PdfType
  isScanned: boolean
  totalPages: number
  currentPage?: number
  onPageClick?: (page: number) => void
  explainRequest?: ExplainRequest | null
  onExplainComplete?: () => void
  locale?: string
}

type TabType = 'qa' | 'summary'

interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function QAPanelComponent({
  courseId,
  fileId,
  pdfType,
  isScanned,
  totalPages,
  currentPage = 1,
  onPageClick,
  explainRequest,
  onExplainComplete,
  locale,
}: QAPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('qa')

  // Q&A hooks
  const {
    askQuestion,
    explainSelection,
    isLoading: qaLoading,
    streamingContent: qaStreaming,
    streamingType,
    streamingMeta,
    error: qaError,
    reset: resetQA,
  } = useQA({ courseId, fileId, pdfType })

  const { data: historyData, isLoading: historyLoading } = useQAHistory(fileId)

  // Summary hooks
  const {
    generateDocumentSummary,
    generateSectionSummary,
    isLoading: summaryLoading,
    streamingContent: summaryStreaming,
    error: summaryError,
    reset: resetSummary,
  } = useSummarize({ courseId, fileId, pdfType })

  const { data: summariesData } = useSummaries(fileId)

  // Handle external explain requests
  useEffect(() => {
    if (explainRequest && !qaLoading) {
      // Switch to Q&A tab
      setActiveTab('qa')

      // Reset and start explain
      resetQA()
      explainSelection({
        selectedText: explainRequest.selectedText,
        page: explainRequest.page,
        parentContext: explainRequest.parentContext,
        locale,
      }).then(() => {
        onExplainComplete?.()
      }).catch(() => {
        onExplainComplete?.()
      })
    }
  }, [explainRequest, qaLoading, explainSelection, resetQA, onExplainComplete, locale])

  const handleAskQuestion = (question: string) => {
    resetQA()
    askQuestion(question)
  }

  const handleDocumentSummary = () => {
    resetSummary()
    generateDocumentSummary()
  }

  const handleSectionSummary = (startPage: number, endPage: number) => {
    resetSummary()
    generateSectionSummary(startPage, endPage)
  }

  // Disabled state for scanned PDFs
  const isDisabled = isScanned

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header with tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-4 py-3">
          <h2 className="font-semibold text-gray-900">Q&A & Summaries</h2>
          <p className="text-xs text-gray-500">
            {isScanned
              ? 'AI features unavailable for scanned PDFs'
              : 'Ask questions and generate summaries'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex px-4 -mb-px">
          <TabButton active={activeTab === 'qa'} onClick={() => setActiveTab('qa')}>
            Q&A
          </TabButton>
          <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')}>
            Summary
          </TabButton>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'qa' ? (
          <div className="space-y-4">
            {/* Streaming response - different UI for question vs explain */}
            {(qaLoading || qaStreaming) && streamingType === 'explain' && streamingMeta && (
              <StreamingExplain
                selectedText={streamingMeta.selectedText}
                content={qaStreaming}
                isLoading={qaLoading}
                sourcePage={streamingMeta.page}
              />
            )}

            {(qaLoading || qaStreaming) && streamingType === 'question' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      {qaLoading && !qaStreaming ? (
                        <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                      ) : (
                        <svg
                          className="w-4 h-4 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {qaStreaming ? (
                      <>
                        <MarkdownRenderer content={qaStreaming} />
                        {qaLoading && (
                          <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-500">
                        <span className="text-sm">Thinking...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {qaError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-600">{qaError}</p>
              </div>
            )}

            {/* Q&A History */}
            <QAHistory
              history={historyData?.items || []}
              isLoading={historyLoading}
              onPageClick={onPageClick}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary buttons */}
            <SummaryButtons
              onDocumentSummary={handleDocumentSummary}
              onSectionSummary={handleSectionSummary}
              isLoading={summaryLoading}
              disabled={isDisabled}
              totalPages={totalPages}
              currentPage={currentPage}
            />

            {/* Streaming summary */}
            {(summaryLoading || summaryStreaming) && (
              <SummaryCard
                summary={{
                  id: '',
                  type: 'document',
                  content: summaryStreaming,
                  pageRangeStart: null,
                  pageRangeEnd: null,
                  cached: false,
                  createdAt: new Date().toISOString(),
                }}
                isStreaming={summaryLoading}
              />
            )}

            {/* Error message */}
            {summaryError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-600">{summaryError}</p>
              </div>
            )}

            {/* Existing summaries */}
            {summariesData?.items && summariesData.items.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Previous Summaries</h3>
                {summariesData.items.map((summary) => (
                  <SummaryCard key={summary.id} summary={summary} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!summaryLoading &&
              !summaryStreaming &&
              (!summariesData?.items || summariesData.items.length === 0) && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="rounded-full bg-gray-100 p-3 mb-3">
                    <svg
                      className="w-6 h-6 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-700">No summaries yet</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Generate a document or section summary to get started
                  </p>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Footer with input (only for Q&A tab) */}
      {activeTab === 'qa' && (
        <div className="border-t border-gray-200 p-4 bg-white">
          <QAInput
            onSubmit={handleAskQuestion}
            isLoading={qaLoading}
            disabled={isDisabled}
            placeholder={
              isDisabled
                ? 'Q&A unavailable for scanned PDFs'
                : 'Ask a question about this document...'
            }
          />
          {!isDisabled && (
            <p className="mt-2 text-xs text-gray-400 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export const QAPanel = memo(QAPanelComponent)
