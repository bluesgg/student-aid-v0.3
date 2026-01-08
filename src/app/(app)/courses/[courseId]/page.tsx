'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { useCourse } from '@/features/courses/hooks/use-courses'
import { FileList } from '@/features/files/components/file-list'
import { FileUpload } from '@/features/files/components/file-upload'
import { QuotaBadge } from '@/features/usage/components/quota-badge'

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.courseId as string

  const { data: course, isLoading, error } = useCourse(courseId)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        </main>
      </div>
    )
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">Course not found or has been deleted.</p>
            <Link href="/courses" className="btn-primary">
              Back to courses
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-secondary-500">
            <li>
              <Link href="/courses" className="hover:text-secondary-700">
                Courses
              </Link>
            </li>
            <li>/</li>
            <li className="text-secondary-900">{course.name}</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">{course.name}</h1>
            <p className="text-secondary-600 mt-1">
              {course.school} &middot; {course.term}
            </p>
            <p className="text-sm text-secondary-500 mt-2">
              {course.fileCount} {course.fileCount === 1 ? 'file' : 'files'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/courses/${courseId}/outline`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
              <span>Course Outline</span>
            </Link>
            <QuotaBadge />
          </div>
        </div>

        {/* Upload Section */}
        <FileUpload courseId={courseId} />

        {/* File List */}
        <FileList courseId={courseId} />
      </main>
    </div>
  )
}
