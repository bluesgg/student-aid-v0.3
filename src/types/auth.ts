/**
 * Auth Types
 * 
 * Types for authentication-related API requests and responses.
 */

import { z } from "zod";

// --- Validation Schemas ---

export const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const resendConfirmationSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// --- Request Types ---

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type ResendConfirmationRequest = z.infer<typeof resendConfirmationSchema>;

// --- Response Types ---

/**
 * User data returned by auth endpoints
 */
export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

/**
 * Response for POST /api/auth/register
 */
export interface RegisterResponse {
  user: AuthUser;
  needsEmailConfirmation: boolean;
}

/**
 * Response for POST /api/auth/login
 */
export interface LoginResponse {
  user: AuthUser;
}

/**
 * Response for GET /api/auth/me
 */
export interface MeResponse extends AuthUser {}

/**
 * Response for POST /api/auth/logout
 * Returns empty on success
 */
export type LogoutResponse = Record<string, never>;

/**
 * Response for POST /api/auth/resend-confirmation
 * Always returns success to avoid leaking email existence
 */
export type ResendConfirmationResponse = Record<string, never>;


