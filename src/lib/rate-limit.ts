/**
 * Rate limiting helper using Vercel KV (Redis).
 * Implements sliding window rate limiting.
 */

import { kv } from '@vercel/kv'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSeconds: number
}

interface RateLimitConfig {
  /** Unique identifier for the rate limit (e.g., email, IP) */
  identifier: string
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
  /** Key prefix for Redis */
  prefix: string
}

/**
 * Check and update rate limit for an identifier.
 * Uses sliding window counter pattern.
 */
export async function checkRateLimit(
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { identifier, limit, windowSeconds, prefix } = config
  const key = `${prefix}:${identifier}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - windowSeconds

  try {
    // Get current count and clean up old entries
    const pipeline = kv.pipeline()

    // Remove entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart)

    // Count entries in current window
    pipeline.zcard(key)

    // Add current request with timestamp as score
    pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })

    // Set expiry on the key
    pipeline.expire(key, windowSeconds)

    const results = await pipeline.exec()
    const currentCount = (results[1] as number) || 0

    if (currentCount >= limit) {
      // Get the oldest entry to calculate reset time
      const oldest = await kv.zrange(key, 0, 0, { withScores: true }) as Array<{ score: number; member: string }>
      const oldestTime = oldest.length > 0 ? oldest[0].score : now
      const resetInSeconds = Math.max(0, oldestTime + windowSeconds - now)

      return {
        allowed: false,
        remaining: 0,
        resetInSeconds,
      }
    }

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      resetInSeconds: windowSeconds,
    }
  } catch (error) {
    // If KV is unavailable, allow the request (fail open)
    // Log the error for monitoring
    console.error('Rate limit check failed:', error)
    return {
      allowed: true,
      remaining: limit,
      resetInSeconds: windowSeconds,
    }
  }
}

/**
 * Rate limit configurations for different endpoints
 */
export const rateLimitConfigs = {
  resendEmailByEmail: (email: string) => ({
    identifier: email.toLowerCase(),
    limit: 5,
    windowSeconds: 15 * 60, // 15 minutes
    prefix: 'rl:resend:email',
  }),

  resendEmailByIP: (ip: string) => ({
    identifier: ip,
    limit: 10,
    windowSeconds: 60 * 60, // 1 hour
    prefix: 'rl:resend:ip',
  }),
}

/**
 * Get client IP from request headers
 */
export function getClientIP(headers: Headers): string {
  // Check common headers for real IP
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take the first IP in the chain
    return forwardedFor.split(',')[0].trim()
  }

  const realIP = headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // Fallback to a default (should rarely happen in production)
  return '127.0.0.1'
}
