'use client'

import { useDeleteCourse } from '../hooks/use-courses'
import type { Course } from '../api'

interface DeleteCourseDialogProps {
  course: Course | null
  onClose: () => void
}

export function DeleteCourseDialog({ course, onClose }: DeleteCourseDialogProps) {
  const deleteCourse = useDeleteCourse()

  const handleDelete = () => {
    if (!course) return
    deleteCourse.mutate(course.id, {
      onSuccess: onClose,
    })
  }

  if (!course) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-2">Delete course?</h2>
        <p className="text-secondary-600 mb-4">
          Are you sure you want to delete <strong>{course.name}</strong>? This
          will also delete all uploaded materials and AI-generated content.
        </p>

        {deleteCourse.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {deleteCourse.error.message}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1"
            disabled={deleteCourse.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="btn bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 flex-1"
            disabled={deleteCourse.isPending}
          >
            {deleteCourse.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
