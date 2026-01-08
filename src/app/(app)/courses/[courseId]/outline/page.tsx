'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCourse } from '@/features/courses/hooks/use-courses'
import { useOutline, useGenerateOutline } from '@/features/outline/hooks/use-outline'
import { OutlineTree } from '@/features/outline/components/outline-tree'
import { GenerateOutlineButton } from '@/features/outline/components/generate-outline-button'

export default function OutlinePage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.courseId as string

  const { data: course, isLoading: courseLoading, error: courseError } = useCourse(courseId)
  const { data: outlineData, isLoading: outlineLoading } = useOutline(courseId)
  const { generate, isGenerating, error: generateError, reset } = useGenerateOutline(courseId)

  const isLoading = courseLoading || outlineLoading

  const handleGenerate = useCallback(
    async (regenerate: boolean = false) => {
      reset()
      try {
        await generate(regenerate)
      } catch {
        // Error is handled by the hook
      }
    },
    [generate, reset]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            <span className="text-gray-500">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (courseError || !course) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex h-screen flex-col items-center justify-center">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Course not found</h2>
            <p className="mt-2 text-gray-600">
              The course you&apos;re looking for doesn&apos;t exist.
            </p>
            <button
              onClick={() => router.push('/courses')}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            >
              Back to courses
            </button>
          </div>
        </div>
      </div>
    )
  }

  const hasOutline = outlineData?.exists && outlineData?.outline

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/courses/${courseId}`}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                title="Back to course"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </Link>
              <div>
                <nav className="flex items-center gap-1 text-sm text-gray-500">
                  <Link href="/courses" className="hover:text-gray-700">
                    Courses
                  </Link>
                  <span>/</span>
                  <Link href={`/courses/${courseId}`} className="hover:text-gray-700">
                    {course.name}
                  </Link>
                  <span>/</span>
                  <span className="text-gray-900">Outline</span>
                </nav>
                <h1 className="text-lg font-semibold text-gray-900">Course Outline</h1>
              </div>
            </div>

            {hasOutline && (
              <GenerateOutlineButton
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                hasExisting={true}
                variant="secondary"
              />
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Error message */}
        {generateError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h3 className="font-medium text-red-800">Failed to generate outline</h3>
                <p className="mt-1 text-sm text-red-700">{generateError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Generating state */}
        {isGenerating && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-8 text-center">
            <div className="mx-auto w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <h3 className="mt-4 font-semibold text-indigo-900">Generating Course Outline</h3>
            <p className="mt-2 text-sm text-indigo-700">
              Analyzing all course materials to create a comprehensive study outline...
            </p>
            <p className="mt-1 text-xs text-indigo-600">This may take a minute or two.</p>
          </div>
        )}

        {/* Outline content */}
        {!isGenerating && hasOutline && (
          <OutlineTree
            outline={outlineData.outline!}
            courseId={courseId}
            createdAt={outlineData.createdAt}
          />
        )}

        {/* Empty state - no outline yet */}
        {!isGenerating && !hasOutline && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No Course Outline Yet</h2>
            <p className="mt-2 text-gray-600 max-w-md mx-auto">
              Generate a comprehensive study outline from all your course materials. The AI will
              analyze your PDFs and create a hierarchical structure of topics and concepts.
            </p>
            <div className="mt-6">
              <GenerateOutlineButton
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                hasExisting={false}
              />
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Uses 1 of your 15 monthly course outline generations
            </p>
          </div>
        )}

        {/* Info card */}
        {!isGenerating && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-gray-600">
                <p>
                  <strong className="text-gray-900">How it works:</strong> The AI analyzes all
                  non-scanned PDFs in your course to identify key topics, concepts, and their
                  relationships. Click on page references to jump directly to the relevant section
                  in your study materials.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
