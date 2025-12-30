/**
 * Auth API Client
 * 
 * Client-side functions for calling auth endpoints.
 */

import { api } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  LogoutResponse,
  ResendConfirmationRequest,
  ResendConfirmationResponse,
} from "@/types/auth";

/**
 * Register a new user
 */
export async function registerUser(
  data: RegisterRequest
): Promise<ApiResponse<RegisterResponse>> {
  return api.post<RegisterResponse>("/api/auth/register", data);
}

/**
 * Log in with email and password
 */
export async function loginUser(
  data: LoginRequest
): Promise<ApiResponse<LoginResponse>> {
  return api.post<LoginResponse>("/api/auth/login", data);
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<ApiResponse<MeResponse>> {
  return api.get<MeResponse>("/api/auth/me");
}

/**
 * Log out the current user
 */
export async function logoutUser(): Promise<ApiResponse<LogoutResponse>> {
  return api.post<LogoutResponse>("/api/auth/logout");
}

/**
 * Resend email confirmation
 */
export async function resendConfirmation(
  data: ResendConfirmationRequest
): Promise<ApiResponse<ResendConfirmationResponse>> {
  return api.post<ResendConfirmationResponse>("/api/auth/resend-confirmation", data);
}

