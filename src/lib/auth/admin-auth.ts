/**
 * Admin authentication utilities
 * Used to verify admin access for protected endpoints and pages
 */

import { NextRequest } from 'next/server'
import { errors } from '@/lib/api-response'

/**
 * Verify admin authentication via header
 * @param request - The incoming request
 * @returns true if authenticated, false otherwise
 */
export function verifyAdminAuth(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminSecret) {
    console.warn('ADMIN_SECRET not configured')
    return false
  }

  const authHeader = request.headers.get('x-admin-secret')
  return authHeader === adminSecret
}

/**
 * Return unauthorized error for admin endpoints
 */
export function adminUnauthorizedError() {
  return errors.custom('ADMIN_UNAUTHORIZED', 'Invalid or missing admin credentials', 401)
}

/**
 * Check if admin authentication is configured
 */
export function isAdminAuthConfigured(): boolean {
  return !!process.env.ADMIN_SECRET
}
