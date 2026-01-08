'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

// Custom components for markdown rendering
// All children props are optional to match react-markdown's Components type
const components = {
  // Headers
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-semibold mb-2 mt-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-semibold mb-2 mt-2 first:mt-0">{children}</h3>
  ),

  // Paragraphs
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),

  // Lists
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),

  // Code blocks
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 bg-gray-100 rounded text-sm font-mono text-gray-800"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className={`block p-3 bg-gray-900 text-gray-100 rounded-lg text-sm font-mono overflow-x-auto ${className}`}
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto">{children}</pre>
  ),

  // Blockquotes
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-blue-300 pl-4 italic text-gray-600 my-2">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline"
    >
      {children}
    </a>
  ),

  // Tables
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-2">
      <table className="min-w-full border-collapse border border-gray-300">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-gray-50">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-gray-300 px-3 py-2">{children}</td>
  ),

  // Strong and emphasis
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),

  // Horizontal rule
  hr: () => <hr className="my-4 border-gray-200" />,
}

function MarkdownRendererComponent({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, strict: false }],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export const MarkdownRenderer = memo(MarkdownRendererComponent)
