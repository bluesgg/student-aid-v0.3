'use client'

import { memo } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'

interface StreamingStickerProps {
  selectedText: string
  content: string
  isLoading: boolean
}

function StreamingStickerComponent({
  selectedText,
  content,
  isLoading,
}: StreamingStickerProps) {
  return (
    <div className="rounded-lg border border-purple-300 bg-white animate-in fade-in slide-in-from-top-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border-b border-purple-200">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
          New
        </span>
        <span className="text-xs text-gray-500 truncate">{selectedText}</span>
        {isLoading && (
          <div className="ml-auto w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2 min-h-[60px]">
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        {/* Streaming cursor */}
        {isLoading && content && (
          <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  )
}

export const StreamingSticker = memo(StreamingStickerComponent)
