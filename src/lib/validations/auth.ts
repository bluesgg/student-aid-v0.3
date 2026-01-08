/**
 * Validation schemas for auth endpoints using Zod.
 */

import { z } from 'zod'

export const registerSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be less than 72 characters'),
})

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const resendConfirmationSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ResendConfirmationInput = z.infer<typeof resendConfirmationSchema>
