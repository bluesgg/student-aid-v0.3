'use client'

import { memo } from 'react'

interface GenerateOutlineButtonProps {
  onGenerate: (regenerate?: boolean) => void
  isGenerating: boolean
  hasExisting: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

function GenerateOutlineButtonComponent({
  onGenerate,
  isGenerating,
  hasExisting,
  disabled = false,
  variant = 'primary',
}: GenerateOutlineButtonProps) {
  const isPrimary = variant === 'primary'

  if (hasExisting) {
    return (
      <button
        onClick={() => onGenerate(true)}
        disabled={disabled || isGenerating}
        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isPrimary
            ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <span>Regenerating...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Regenerate Outline</span>
          </>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={() => onGenerate(false)}
      disabled={disabled || isGenerating}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isPrimary
          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
          : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
      }`}
    >
      {isGenerating ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Generating Outline...</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          <span>Generate Course Outline</span>
        </>
      )}
    </button>
  )
}

export const GenerateOutlineButton = memo(GenerateOutlineButtonComponent)
