/**
 * @deprecated This component has been replaced by auto-explain functionality in sticker panel.
 * Kept for reference only. Do not use in new code.
 * See: openspec/changes/relocate-auto-explain-button/proposal.md
 */
'use client'

import { memo } from 'react'

interface ExplainPageButtonProps {
  onClick: () => void
  isLoading: boolean
  disabled?: boolean
  hasExistingStickers?: boolean
}

function ExplainPageButtonComponent({
  onClick,
  isLoading,
  disabled = false,
  hasExistingStickers = false,
}: ExplainPageButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
        disabled || isLoading
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
      }`}
    >
      {isLoading ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Analyzing page...</span>
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span>{hasExistingStickers ? 'View Page Explanations' : 'Explain This Page'}</span>
        </>
      )}
    </button>
  )
}

export const ExplainPageButton = memo(ExplainPageButtonComponent)
