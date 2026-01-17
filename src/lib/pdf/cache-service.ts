/**
 * PDF Cache Service
 *
 * IndexedDB-based cache for storing PDF binary data locally.
 * Provides LRU eviction, storage limits, and graceful degradation.
 */

import { debugLog } from '@/lib/debug'

/**
 * Cached PDF entry structure
 */
export interface CachedPdf {
  /** File ID (primary key) */
  fileId: string
  /** Content hash for cache validation */
  contentHash: string
  /** PDF binary data */
  data: ArrayBuffer
  /** Timestamp when cached */
  cachedAt: number
  /** Timestamp of last access (for LRU) */
  accessedAt: number
  /** Size in bytes */
  size: number
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of cached PDFs */
  count: number
  /** Total size in bytes */
  totalSize: number
  /** Oldest entry timestamp */
  oldestEntry: number | null
  /** Newest entry timestamp */
  newestEntry: number | null
}

/** Maximum cache size (500MB) */
const MAX_CACHE_SIZE = 500 * 1024 * 1024

/** Maximum cache age (7 days) */
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000

/** Database name */
const DB_NAME = 'studentaid-pdf-cache'

/** Database version */
const DB_VERSION = 1

/** PDF data store name */
const PDF_STORE = 'pdf-data'

/** Metadata store name */
const META_STORE = 'metadata'

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof indexedDB === 'undefined') return false

  // Check for private browsing restrictions
  try {
    // Some browsers throw on indexedDB.open in private mode
    const testRequest = indexedDB.open('__test__')
    testRequest.onerror = () => {}
    testRequest.onsuccess = () => {
      indexedDB.deleteDatabase('__test__')
    }
    return true
  } catch {
    return false
  }
}

/**
 * PDF Cache Service class
 */
class PdfCacheServiceImpl {
  private db: IDBDatabase | null = null
  private dbPromise: Promise<IDBDatabase | null> | null = null
  private isAvailable: boolean

  constructor() {
    this.isAvailable = isIndexedDBAvailable()
  }

  /**
   * Initialize and get the database connection
   */
  private async getDb(): Promise<IDBDatabase | null> {
    if (!this.isAvailable) {
      debugLog('[PdfCache] IndexedDB unavailable')
      return null
    }

    if (this.db) return this.db

    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.warn('[PdfCache] Failed to open database:', request.error)
        this.isAvailable = false
        resolve(null)
      }

      request.onsuccess = () => {
        this.db = request.result
        debugLog('[PdfCache] Database opened successfully')
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create PDF data store
        if (!db.objectStoreNames.contains(PDF_STORE)) {
          const pdfStore = db.createObjectStore(PDF_STORE, { keyPath: 'fileId' })
          pdfStore.createIndex('accessedAt', 'accessedAt', { unique: false })
          pdfStore.createIndex('cachedAt', 'cachedAt', { unique: false })
          debugLog('[PdfCache] Created pdf-data store')
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' })
          debugLog('[PdfCache] Created metadata store')
        }
      }
    })

    return this.dbPromise
  }

  /**
   * Get cached PDF data by file ID
   *
   * @param fileId - File ID to look up
   * @param contentHash - Optional hash to validate (returns null if mismatch)
   * @returns PDF ArrayBuffer or null if not found/stale
   */
  async get(fileId: string, contentHash?: string): Promise<ArrayBuffer | null> {
    const db = await this.getDb()
    if (!db) return null

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(PDF_STORE, 'readwrite')
        const store = transaction.objectStore(PDF_STORE)
        const request = store.get(fileId)

        request.onerror = () => {
          console.warn('[PdfCache] Get error:', request.error)
          resolve(null)
        }

        request.onsuccess = () => {
          const entry = request.result as CachedPdf | undefined

          if (!entry) {
            debugLog('[PdfCache] Cache miss for:', fileId)
            resolve(null)
            return
          }

          // Check if cache is too old
          const age = Date.now() - entry.cachedAt
          if (age > MAX_CACHE_AGE) {
            debugLog('[PdfCache] Cache expired for:', fileId)
            // Remove stale entry
            store.delete(fileId)
            resolve(null)
            return
          }

          // Check content hash if provided
          if (contentHash && entry.contentHash !== contentHash) {
            debugLog('[PdfCache] Hash mismatch for:', fileId)
            // Remove stale entry
            store.delete(fileId)
            resolve(null)
            return
          }

          // Update access time
          entry.accessedAt = Date.now()
          store.put(entry)

          debugLog('[PdfCache] Cache hit for:', fileId, 'size:', entry.size)
          resolve(entry.data)
        }
      } catch (error) {
        console.warn('[PdfCache] Get exception:', error)
        resolve(null)
      }
    })
  }

  /**
   * Store PDF data in cache
   *
   * @param fileId - File ID as cache key
   * @param data - PDF binary data
   * @param contentHash - Content hash for validation
   */
  async set(fileId: string, data: ArrayBuffer, contentHash: string): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    const size = data.byteLength

    // Check if this single file is too large (>100MB)
    if (size > 100 * 1024 * 1024) {
      debugLog('[PdfCache] File too large to cache:', size, 'bytes')
      return
    }

    // Evict if necessary before storing
    await this.ensureSpace(size)

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(PDF_STORE, 'readwrite')
        const store = transaction.objectStore(PDF_STORE)

        const entry: CachedPdf = {
          fileId,
          contentHash,
          data,
          cachedAt: Date.now(),
          accessedAt: Date.now(),
          size,
        }

        const request = store.put(entry)

        request.onerror = () => {
          console.warn('[PdfCache] Set error:', request.error)
          resolve() // Don't reject, caching is best-effort
        }

        request.onsuccess = () => {
          debugLog('[PdfCache] Cached:', fileId, 'size:', size)
          resolve()
        }
      } catch (error) {
        console.warn('[PdfCache] Set exception:', error)
        resolve() // Don't reject
      }
    })
  }

  /**
   * Remove a cached PDF
   */
  async delete(fileId: string): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(PDF_STORE, 'readwrite')
        const store = transaction.objectStore(PDF_STORE)
        const request = store.delete(fileId)

        request.onerror = () => resolve()
        request.onsuccess = () => {
          debugLog('[PdfCache] Deleted:', fileId)
          resolve()
        }
      } catch {
        resolve()
      }
    })
  }

  /**
   * Ensure there's enough space for a new entry
   */
  private async ensureSpace(neededBytes: number): Promise<void> {
    const stats = await this.getStats()
    const targetSize = MAX_CACHE_SIZE * 0.8 // Keep 20% buffer

    if (stats.totalSize + neededBytes <= MAX_CACHE_SIZE) {
      return // Enough space
    }

    debugLog('[PdfCache] Evicting to make space, current:', stats.totalSize, 'needed:', neededBytes)
    await this.evictLRU(targetSize - neededBytes)
  }

  /**
   * Evict least recently used entries until target size is reached
   */
  async evictLRU(targetSizeBytes: number): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(PDF_STORE, 'readwrite')
        const store = transaction.objectStore(PDF_STORE)
        const index = store.index('accessedAt')

        // Get all entries sorted by accessedAt (oldest first)
        const request = index.openCursor()
        let totalSize = 0
        let evictedCount = 0

        // First pass: calculate total size
        const getAllRequest = store.getAll()
        getAllRequest.onsuccess = () => {
          const entries = getAllRequest.result as CachedPdf[]
          totalSize = entries.reduce((sum, e) => sum + e.size, 0)

          if (totalSize <= targetSizeBytes) {
            debugLog('[PdfCache] No eviction needed')
            resolve()
            return
          }

          // Second pass: evict oldest entries
          const cursorRequest = index.openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor || totalSize <= targetSizeBytes) {
              debugLog('[PdfCache] Evicted', evictedCount, 'entries')
              resolve()
              return
            }

            const entry = cursor.value as CachedPdf
            totalSize -= entry.size
            evictedCount++
            cursor.delete()
            cursor.continue()
          }

          cursorRequest.onerror = () => resolve()
        }

        getAllRequest.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  /**
   * Clear all cached PDFs
   */
  async clear(): Promise<void> {
    const db = await this.getDb()
    if (!db) return

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(PDF_STORE, 'readwrite')
        const store = transaction.objectStore(PDF_STORE)
        const request = store.clear()

        request.onerror = () => resolve()
        request.onsuccess = () => {
          debugLog('[PdfCache] Cache cleared')
          resolve()
        }
      } catch {
        resolve()
      }
    })
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const db = await this.getDb()
    if (!db) {
      return { count: 0, totalSize: 0, oldestEntry: null, newestEntry: null }
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(PDF_STORE, 'readonly')
        const store = transaction.objectStore(PDF_STORE)
        const request = store.getAll()

        request.onerror = () => {
          resolve({ count: 0, totalSize: 0, oldestEntry: null, newestEntry: null })
        }

        request.onsuccess = () => {
          const entries = request.result as CachedPdf[]

          if (entries.length === 0) {
            resolve({ count: 0, totalSize: 0, oldestEntry: null, newestEntry: null })
            return
          }

          const totalSize = entries.reduce((sum, e) => sum + e.size, 0)
          const timestamps = entries.map((e) => e.cachedAt)
          const oldestEntry = Math.min(...timestamps)
          const newestEntry = Math.max(...timestamps)

          resolve({
            count: entries.length,
            totalSize,
            oldestEntry,
            newestEntry,
          })
        }
      } catch {
        resolve({ count: 0, totalSize: 0, oldestEntry: null, newestEntry: null })
      }
    })
  }

  /**
   * Check if a file is cached
   */
  async has(fileId: string): Promise<boolean> {
    const db = await this.getDb()
    if (!db) return false

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(PDF_STORE, 'readonly')
        const store = transaction.objectStore(PDF_STORE)
        const request = store.count(fileId)

        request.onerror = () => resolve(false)
        request.onsuccess = () => resolve(request.result > 0)
      } catch {
        resolve(false)
      }
    })
  }

  /**
   * Check if IndexedDB is available
   */
  get available(): boolean {
    return this.isAvailable
  }
}

// Singleton instance
let instance: PdfCacheServiceImpl | null = null

/**
 * Get the PDF cache service instance
 */
export function getPdfCacheService(): PdfCacheServiceImpl {
  if (!instance) {
    instance = new PdfCacheServiceImpl()
  }
  return instance
}

// Named export for convenience
export const pdfCacheService = {
  get: (fileId: string, contentHash?: string) => getPdfCacheService().get(fileId, contentHash),
  set: (fileId: string, data: ArrayBuffer, contentHash: string) => getPdfCacheService().set(fileId, data, contentHash),
  delete: (fileId: string) => getPdfCacheService().delete(fileId),
  clear: () => getPdfCacheService().clear(),
  getStats: () => getPdfCacheService().getStats(),
  has: (fileId: string) => getPdfCacheService().has(fileId),
  get available() { return getPdfCacheService().available },
}
