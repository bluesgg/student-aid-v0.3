/**
 * API client for making authenticated requests to backend routes.
 * All requests include credentials for httpOnly cookie authentication.
 */

export interface ApiResponse<T> {
  ok: true
  data: T
}

export interface ApiErrorData {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface ApiError {
  ok: false
  error: ApiErrorData
}

/**
 * Custom error class for API errors with code property
 */
export class ApiClientError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(error: ApiErrorData) {
    super(error.message)
    this.name = 'ApiClientError'
    this.code = error.code
    this.details = error.details
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiError

/**
 * Fetch wrapper with credentials and JSON handling
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()
  return data as ApiResult<T>
}

/**
 * Helper to check if response is an error
 */
export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return !result.ok
}

/**
 * Helper to extract data from successful response
 */
export function getApiData<T>(result: ApiResult<T>): T {
  if (isApiError(result)) {
    throw new Error(result.error.message)
  }
  return result.data
}

/**
 * POST request helper
 */
export function post<T, B extends object = Record<string, unknown>>(
  endpoint: string,
  body: B
): Promise<ApiResult<T>> {
  return apiClient<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * GET request helper
 */
export function get<T>(endpoint: string): Promise<ApiResult<T>> {
  return apiClient<T>(endpoint, {
    method: 'GET',
  })
}

/**
 * PATCH request helper
 */
export function patch<T, B extends object = Record<string, unknown>>(
  endpoint: string,
  body: B
): Promise<ApiResult<T>> {
  return apiClient<T>(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/**
 * DELETE request helper
 */
export function del<T>(endpoint: string): Promise<ApiResult<T>> {
  return apiClient<T>(endpoint, {
    method: 'DELETE',
  })
}
