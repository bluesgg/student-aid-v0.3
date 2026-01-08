/**
 * Validation schemas for course endpoints using Zod.
 */

import { z } from 'zod'

export const createCourseSchema = z.object({
  name: z
    .string()
    .min(1, 'Course name is required')
    .max(100, 'Course name must be less than 100 characters'),
  school: z
    .string()
    .min(1, 'School name is required')
    .max(100, 'School name must be less than 100 characters'),
  term: z
    .string()
    .min(1, 'Term is required')
    .max(50, 'Term must be less than 50 characters'),
})

export const updateCourseSchema = z.object({
  name: z
    .string()
    .min(1, 'Course name is required')
    .max(100, 'Course name must be less than 100 characters')
    .optional(),
  school: z
    .string()
    .min(1, 'School name is required')
    .max(100, 'School name must be less than 100 characters')
    .optional(),
  term: z
    .string()
    .min(1, 'Term is required')
    .max(50, 'Term must be less than 50 characters')
    .optional(),
})

export type CreateCourseInput = z.infer<typeof createCourseSchema>
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>

// File type enum matching database
export const fileTypeSchema = z.enum(['Lecture', 'Homework', 'Exam', 'Other'])
export type FileType = z.infer<typeof fileTypeSchema>

export const uploadFileSchema = z.object({
  name: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name must be less than 255 characters'),
  type: fileTypeSchema,
})

export type UploadFileInput = z.infer<typeof uploadFileSchema>
