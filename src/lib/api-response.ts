/**
 * Standardized API response helpers.
 * Ensures consistent response format across all API routes.
 */

import { NextResponse } from 'next/server'

/**
 * Success response wrapper
 */
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status })
}

/**
 * Error response wrapper
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, ...(details && { details }) },
    },
    { status }
  )
}

// Common error codes
export const ErrorCodes = {
  // Auth errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_CONFIRMED: 'EMAIL_NOT_CONFIRMED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVALID_INPUT: 'INVALID_INPUT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',

  // Course errors
  COURSE_LIMIT_REACHED: 'COURSE_LIMIT_REACHED',
  DUPLICATE_COURSE_NAME: 'DUPLICATE_COURSE_NAME',

  // Quota errors
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Storage limit errors
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  FILE_SIZE_EXCEEDED: 'FILE_SIZE_EXCEEDED',
  PAGE_COUNT_EXCEEDED: 'PAGE_COUNT_EXCEEDED',
  COURSE_FILE_LIMIT: 'COURSE_FILE_LIMIT',
  EXTRACTION_QUOTA_EXCEEDED: 'EXTRACTION_QUOTA_EXCEEDED',

  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

/**
 * Common error response helpers
 */
export const errors = {
  unauthorized: (message = 'Authentication required') =>
    errorResponse(ErrorCodes.UNAUTHORIZED, message, 401),

  invalidCredentials: () =>
    errorResponse(
      ErrorCodes.INVALID_CREDENTIALS,
      'Invalid email or password',
      401
    ),

  emailNotConfirmed: () =>
    errorResponse(
      ErrorCodes.EMAIL_NOT_CONFIRMED,
      'Please verify your email before logging in',
      403
    ),

  emailAlreadyExists: () =>
    errorResponse(
      ErrorCodes.EMAIL_ALREADY_EXISTS,
      'An account with this email already exists',
      409
    ),

  invalidInput: (message: string, details?: Record<string, unknown>) =>
    errorResponse(ErrorCodes.INVALID_INPUT, message, 400, details),

  rateLimitExceeded: (retryAfter: number, limitType: string) =>
    errorResponse(
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      `Too many requests. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      429,
      { retryAfter, limitType }
    ),

  notFound: (resource = 'Resource') =>
    errorResponse(ErrorCodes.NOT_FOUND, `${resource} not found`, 404),

  forbidden: (message = 'Access denied') =>
    errorResponse(ErrorCodes.FORBIDDEN, message, 403),

  internalError: (message = 'An unexpected error occurred') =>
    errorResponse(ErrorCodes.INTERNAL_ERROR, message, 500),

  custom: (code: string, message: string, status: number, details?: Record<string, unknown>) =>
    errorResponse(code, message, status, details),
}
