'use client'

import { useState } from 'react'
import { useCourses } from '../hooks/use-courses'
import { CourseCard } from './course-card'
import { CreateCourseDialog } from './create-course-dialog'
import { DeleteCourseDialog } from './delete-course-dialog'
import type { Course } from '../api'

const MAX_COURSES = 6

export function CourseList() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null)

  const { data: courses, isLoading, error } = useCourses()

  const canCreateCourse = courses && courses.length < MAX_COURSES

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load courses. Please try again.</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-secondary-900">My Courses</h1>
        <button
          onClick={() => setShowCreateDialog(true)}
          disabled={!canCreateCourse}
          className="btn-primary"
          title={
            canCreateCourse
              ? 'Create new course'
              : `For this experiment, you can create up to ${MAX_COURSES} courses.`
          }
        >
          New course
        </button>
      </div>

      {courses?.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-secondary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <p className="text-secondary-600 mb-4">
            You don&apos;t have any courses yet.
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="btn-primary"
          >
            Create your first course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses?.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onDelete={setCourseToDelete}
            />
          ))}
        </div>
      )}

      <CreateCourseDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />

      <DeleteCourseDialog
        course={courseToDelete}
        onClose={() => setCourseToDelete(null)}
      />
    </>
  )
}
