/**
 * Course API client functions.
 */

import { get, post, patch, del, type ApiResult } from '@/lib/api-client'

export interface Course {
  id: string
  name: string
  school: string
  term: string
  fileCount: number
  lastVisitedAt: string | null
  createdAt: string
}

export interface CreateCourseInput {
  name: string
  school: string
  term: string
}

export interface UpdateCourseInput {
  name?: string
  school?: string
  term?: string
}

/**
 * Get all courses for the current user
 */
export function getCourses(): Promise<ApiResult<{ items: Course[] }>> {
  return get<{ items: Course[] }>('/api/courses')
}

/**
 * Get a single course by ID
 */
export function getCourse(courseId: string): Promise<ApiResult<Course>> {
  return get<Course>(`/api/courses/${courseId}`)
}

/**
 * Create a new course
 */
export function createCourse(
  input: CreateCourseInput
): Promise<ApiResult<Course>> {
  return post<Course, CreateCourseInput>('/api/courses', input)
}

/**
 * Update a course
 */
export function updateCourse(
  courseId: string,
  input: UpdateCourseInput
): Promise<ApiResult<Course>> {
  return patch<Course, UpdateCourseInput>(`/api/courses/${courseId}`, input)
}

/**
 * Delete a course
 */
export function deleteCourse(
  courseId: string
): Promise<ApiResult<{ message: string }>> {
  return del<{ message: string }>(`/api/courses/${courseId}`)
}
