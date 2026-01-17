'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import type { Course } from '../api'

interface CourseCardProps {
  course: Course
  onDelete?: (course: Course) => void
}

export function CourseCard({ course, onDelete }: CourseCardProps) {
  const t = useTranslations('courses')
  const locale = useLocale()

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('neverVisited')
    return new Date(dateString).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="card group hover:shadow-md transition-shadow">
      <Link href={`/courses/${course.id}`} className="block">
        <h3 className="text-lg font-semibold text-secondary-900 group-hover:text-primary-600 transition-colors">
          {course.name}
        </h3>
        <p className="text-sm text-secondary-600 mt-1">
          {course.school} &middot; {course.term}
        </p>
        <div className="flex items-center justify-between mt-4 text-sm text-secondary-500">
          <span>
            {course.fileCount} {course.fileCount === 1 ? t('file') : t('filesCount')}
          </span>
          <span>{formatDate(course.lastVisitedAt)}</span>
        </div>
      </Link>
      {onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault()
            onDelete(course)
          }}
          className="absolute top-3 right-3 p-1 text-secondary-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title={t('deleteCourse')}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
