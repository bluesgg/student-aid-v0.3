'use client'

import { memo } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'

interface StreamingStickerProps {
  selectedText: string
  content: string
  isLoading: boolean
  /** Color variant: 'manual' (purple) or 'auto' (blue) */
  variant?: 'manual' | 'auto'
}

const variantStyles = {
  manual: {
    border: 'border-purple-300',
    headerBg: 'bg-purple-50',
    headerBorder: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
    badgeText: 'New',
    spinner: 'border-purple-300 border-t-purple-600',
    dots: 'bg-purple-400',
    cursor: 'bg-purple-500',
  },
  auto: {
    border: 'border-blue-300',
    headerBg: 'bg-blue-50',
    headerBorder: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    badgeText: 'Auto',
    spinner: 'border-blue-300 border-t-blue-600',
    dots: 'bg-blue-400',
    cursor: 'bg-blue-500',
  },
}

function StreamingStickerComponent({
  selectedText,
  content,
  isLoading,
  variant = 'manual',
}: StreamingStickerProps) {
  const styles = variantStyles[variant]

  return (
    <div className={`rounded-lg border ${styles.border} bg-white animate-in fade-in slide-in-from-top-2`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${styles.headerBg} border-b ${styles.headerBorder}`}>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles.badge}`}>
          {styles.badgeText}
        </span>
        <span className="text-xs text-gray-500 truncate">{selectedText}</span>
        {isLoading && (
          <div className={`ml-auto w-4 h-4 border-2 ${styles.spinner} rounded-full animate-spin`} />
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2 min-h-[60px]">
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="flex gap-1">
              <div className={`w-2 h-2 ${styles.dots} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }} />
              <div className={`w-2 h-2 ${styles.dots} rounded-full animate-bounce`} style={{ animationDelay: '150ms' }} />
              <div className={`w-2 h-2 ${styles.dots} rounded-full animate-bounce`} style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        {/* Streaming cursor */}
        {isLoading && content && (
          <span className={`inline-block w-2 h-4 ${styles.cursor} animate-pulse ml-0.5`} />
        )}
      </div>
    </div>
  )
}

export const StreamingSticker = memo(StreamingStickerComponent)
