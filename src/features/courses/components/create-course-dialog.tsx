'use client'

import { useState } from 'react'
import { useCreateCourse } from '../hooks/use-courses'

interface CreateCourseDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateCourseDialog({ isOpen, onClose }: CreateCourseDialogProps) {
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [term, setTerm] = useState('')

  const createCourse = useCreateCourse()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    createCourse.mutate(
      { name, school, term },
      {
        onSuccess: () => {
          setName('')
          setSchool('')
          setTerm('')
          onClose()
        },
      }
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">New course</h2>

        {createCourse.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {createCourse.error.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-secondary-700 mb-1"
            >
              Course name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g., Calculus I"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="school"
              className="block text-sm font-medium text-secondary-700 mb-1"
            >
              School
            </label>
            <input
              id="school"
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="input"
              placeholder="e.g., ABC University"
              required
            />
          </div>

          <div>
            <label
              htmlFor="term"
              className="block text-sm font-medium text-secondary-700 mb-1"
            >
              Term
            </label>
            <input
              id="term"
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="input"
              placeholder="e.g., Spring 2025"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={createCourse.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={createCourse.isPending}
            >
              {createCourse.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
