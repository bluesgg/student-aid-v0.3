/**
 * Signed URL Cache
 *
 * SessionStorage-based cache for signed URLs to avoid redundant API calls.
 * URLs are cached for 50 minutes (leaving 10-minute buffer before 1-hour expiry).
 */

import { debugLog } from '@/lib/debug'

/**
 * Cached URL entry structure
 */
export interface CachedUrl {
  /** Signed URL */
  url: string
  /** Expiration timestamp (ms) */
  expiresAt: number
  /** File ID */
  fileId: string
  /** Content hash (for validation) */
  contentHash?: string
}

/** Storage key prefix */
const STORAGE_KEY_PREFIX = 'studentaid-url-cache:'

/** TTL for cached URLs (50 minutes = 3,000,000ms) */
const URL_CACHE_TTL_MS = 50 * 60 * 1000

/**
 * Check if sessionStorage is available
 */
export function isSessionStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof sessionStorage === 'undefined') return false

  try {
    const testKey = '__test__'
    sessionStorage.setItem(testKey, testKey)
    sessionStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * Signed URL Cache class
 */
class SignedUrlCacheImpl {
  private isAvailable: boolean

  constructor() {
    this.isAvailable = isSessionStorageAvailable()
  }

  /**
   * Get a cached signed URL
   *
   * @param fileId - File ID to look up
   * @returns Cached URL or null if not found/expired
   */
  get(fileId: string): CachedUrl | null {
    if (!this.isAvailable) return null

    try {
      const key = STORAGE_KEY_PREFIX + fileId
      const raw = sessionStorage.getItem(key)

      if (!raw) {
        debugLog('[UrlCache] Cache miss for:', fileId)
        return null
      }

      const entry = JSON.parse(raw) as CachedUrl

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        debugLog('[UrlCache] URL expired for:', fileId)
        sessionStorage.removeItem(key)
        return null
      }

      debugLog('[UrlCache] Cache hit for:', fileId)
      return entry
    } catch (error) {
      console.warn('[UrlCache] Get error:', error)
      return null
    }
  }

  /**
   * Store a signed URL
   *
   * @param fileId - File ID as cache key
   * @param url - Signed URL to cache
   * @param contentHash - Optional content hash for validation
   */
  set(fileId: string, url: string, contentHash?: string): void {
    if (!this.isAvailable) return

    try {
      const key = STORAGE_KEY_PREFIX + fileId
      const entry: CachedUrl = {
        url,
        fileId,
        contentHash,
        expiresAt: Date.now() + URL_CACHE_TTL_MS,
      }

      sessionStorage.setItem(key, JSON.stringify(entry))
      debugLog('[UrlCache] Cached URL for:', fileId)
    } catch (error) {
      // sessionStorage might be full
      console.warn('[UrlCache] Set error:', error)
      // Try to clear old entries and retry
      this.cleanup()
      try {
        const key = STORAGE_KEY_PREFIX + fileId
        const entry: CachedUrl = {
          url,
          fileId,
          contentHash,
          expiresAt: Date.now() + URL_CACHE_TTL_MS,
        }
        sessionStorage.setItem(key, JSON.stringify(entry))
      } catch {
        // Give up if still failing
      }
    }
  }

  /**
   * Remove a cached URL
   */
  delete(fileId: string): void {
    if (!this.isAvailable) return

    try {
      const key = STORAGE_KEY_PREFIX + fileId
      sessionStorage.removeItem(key)
      debugLog('[UrlCache] Deleted URL for:', fileId)
    } catch {
      // Ignore
    }
  }

  /**
   * Check if a URL is cached
   */
  has(fileId: string): boolean {
    return this.get(fileId) !== null
  }

  /**
   * Clear all cached URLs
   */
  clear(): void {
    if (!this.isAvailable) return

    try {
      const keysToRemove: string[] = []

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach((key) => sessionStorage.removeItem(key))
      debugLog('[UrlCache] Cleared', keysToRemove.length, 'entries')
    } catch {
      // Ignore
    }
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    if (!this.isAvailable) return

    try {
      const keysToRemove: string[] = []
      const now = Date.now()

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          try {
            const raw = sessionStorage.getItem(key)
            if (raw) {
              const entry = JSON.parse(raw) as CachedUrl
              if (now > entry.expiresAt) {
                keysToRemove.push(key)
              }
            }
          } catch {
            // Invalid entry, remove it
            keysToRemove.push(key)
          }
        }
      }

      keysToRemove.forEach((key) => sessionStorage.removeItem(key))
      if (keysToRemove.length > 0) {
        debugLog('[UrlCache] Cleaned up', keysToRemove.length, 'expired entries')
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { count: number } {
    if (!this.isAvailable) return { count: 0 }

    try {
      let count = 0
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          count++
        }
      }
      return { count }
    } catch {
      return { count: 0 }
    }
  }

  /**
   * Check if sessionStorage is available
   */
  get available(): boolean {
    return this.isAvailable
  }
}

// Singleton instance
let instance: SignedUrlCacheImpl | null = null

/**
 * Get the signed URL cache instance
 */
export function getSignedUrlCache(): SignedUrlCacheImpl {
  if (!instance) {
    instance = new SignedUrlCacheImpl()
  }
  return instance
}

// Named export for convenience
export const signedUrlCache = {
  get: (fileId: string) => getSignedUrlCache().get(fileId),
  set: (fileId: string, url: string, contentHash?: string) => getSignedUrlCache().set(fileId, url, contentHash),
  delete: (fileId: string) => getSignedUrlCache().delete(fileId),
  has: (fileId: string) => getSignedUrlCache().has(fileId),
  clear: () => getSignedUrlCache().clear(),
  cleanup: () => getSignedUrlCache().cleanup(),
  getStats: () => getSignedUrlCache().getStats(),
  get available() { return getSignedUrlCache().available },
}
