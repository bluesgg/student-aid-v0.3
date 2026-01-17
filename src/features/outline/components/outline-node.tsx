'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import type { OutlineNode as OutlineNodeType } from '../api'

const ICON_CONFIG = {
  chapter: {
    className: 'w-5 h-5 text-indigo-500',
    path: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  section: {
    className: 'w-4 h-4 text-teal-500',
    path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  concept: {
    className: 'w-3.5 h-3.5 text-amber-500',
    path: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
} as const

const TITLE_CLASSES: Record<string, string> = {
  chapter: 'text-base text-gray-900',
  section: 'text-sm text-gray-800',
  concept: 'text-sm text-gray-700',
}

interface OutlineNodeProps {
  node: OutlineNodeType
  courseId: string
  level: number
  defaultExpanded?: boolean
}

function OutlineNodeComponent({
  node,
  courseId,
  level,
  defaultExpanded = true,
}: OutlineNodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const hasChildren = node.children && node.children.length > 0

  const iconConfig = ICON_CONFIG[node.type]
  const titleClass = TITLE_CLASSES[node.type] || TITLE_CLASSES.section

  const paddingLeft = level * 20

  return (
    <div className="select-none">
      {/* Node header */}
      <div
        className={`flex items-start gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors ${
          hasChildren ? 'cursor-pointer' : ''
        }`}
        style={{ paddingLeft: `${paddingLeft + 12}px` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button className="flex-shrink-0 p-0.5 mt-0.5 text-gray-400 hover:text-gray-600">
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        {/* Type icon */}
        <span className="flex-shrink-0 mt-0.5">
          <svg className={iconConfig.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={iconConfig.path}
            />
          </svg>
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium ${titleClass}`}>
            {node.title}
          </h4>
          {node.description && (
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{node.description}</p>
          )}

          {/* Page references */}
          {node.references && node.references.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {node.references.slice(0, 5).map((ref, index) => (
                <Link
                  key={index}
                  href={
                    ref.fileId
                      ? `/courses/${courseId}/files/${ref.fileId}?page=${ref.page}`
                      : '#'
                  }
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors ${
                    ref.fileId
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      : 'bg-gray-100 text-gray-500 cursor-default'
                  }`}
                  title={ref.fileName}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="truncate max-w-[100px]">{ref.fileName}</span>
                  <span>p.{ref.page}</span>
                </Link>
              ))}
              {node.references.length > 5 && (
                <span className="text-xs text-gray-400">
                  +{node.references.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="border-l-2 border-gray-100 ml-6">
          {node.children!.map((child) => (
            <OutlineNode
              key={child.id}
              node={child}
              courseId={courseId}
              level={level + 1}
              defaultExpanded={level < 1} // Auto-expand first two levels
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const OutlineNode = memo(OutlineNodeComponent)
