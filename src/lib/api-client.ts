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

  return response.json() as Promise<ApiResult<T>>
}

export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return !result.ok
}

export function getApiData<T>(result: ApiResult<T>): T {
  if (isApiError(result)) {
    throw new Error(result.error.message)
  }
  return result.data
}

function withBody<T, B extends object>(method: string) {
  return (endpoint: string, body: B): Promise<ApiResult<T>> =>
    apiClient<T>(endpoint, { method, body: JSON.stringify(body) })
}

export function post<T, B extends object = Record<string, unknown>>(
  endpoint: string,
  body: B
): Promise<ApiResult<T>> {
  return withBody<T, B>('POST')(endpoint, body)
}

export function patch<T, B extends object = Record<string, unknown>>(
  endpoint: string,
  body: B
): Promise<ApiResult<T>> {
  return withBody<T, B>('PATCH')(endpoint, body)
}

export function get<T>(endpoint: string): Promise<ApiResult<T>> {
  return apiClient<T>(endpoint, { method: 'GET' })
}

export function del<T>(endpoint: string): Promise<ApiResult<T>> {
  return apiClient<T>(endpoint, { method: 'DELETE' })
}
