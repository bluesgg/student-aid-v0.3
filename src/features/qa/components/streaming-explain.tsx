'use client'

import { memo } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'

interface StreamingExplainProps {
  selectedText: string
  content: string
  isLoading: boolean
  sourcePage: number
}

function StreamingExplainComponent({
  selectedText,
  content,
  isLoading,
  sourcePage,
}: StreamingExplainProps) {
  return (
    <div className="rounded-lg border border-amber-300 bg-white animate-in fade-in slide-in-from-top-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
          Explain
        </span>
        <span className="text-xs text-gray-500 truncate flex-1">{selectedText}</span>
        <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
          p.{sourcePage}
        </span>
        {isLoading && (
          <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2 min-h-[60px]">
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        {/* Streaming cursor */}
        {isLoading && content && (
          <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  )
}

export const StreamingExplain = memo(StreamingExplainComponent)
