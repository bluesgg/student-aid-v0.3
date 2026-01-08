/**
 * Auth API client functions.
 */

import { post, get, type ApiResult } from '@/lib/api-client'

export interface User {
  id: string
  email: string
  createdAt?: string
}

export interface RegisterResponse {
  user: { id: string; email: string }
  needsEmailConfirmation: boolean
}

export interface LoginResponse {
  user: User
}

export interface MeResponse extends User {}

export interface ResendConfirmationResponse {
  message: string
}

/**
 * Register a new user
 */
export function register(
  email: string,
  password: string
): Promise<ApiResult<RegisterResponse>> {
  return post<RegisterResponse>('/api/auth/register', { email, password })
}

/**
 * Login with email and password
 */
export function login(
  email: string,
  password: string
): Promise<ApiResult<LoginResponse>> {
  return post<LoginResponse>('/api/auth/login', { email, password })
}

/**
 * Logout current user
 */
export function logout(): Promise<ApiResult<{ message: string }>> {
  return post<{ message: string }>('/api/auth/logout', {})
}

/**
 * Get current user
 */
export function getMe(): Promise<ApiResult<MeResponse>> {
  return get<MeResponse>('/api/auth/me')
}

/**
 * Resend confirmation email
 */
export function resendConfirmation(
  email: string
): Promise<ApiResult<ResendConfirmationResponse>> {
  return post<ResendConfirmationResponse>('/api/auth/resend-confirmation', {
    email,
  })
}
