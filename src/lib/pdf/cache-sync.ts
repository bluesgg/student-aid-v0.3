/**
 * PDF Cache Synchronization Service
 *
 * Uses BroadcastChannel API to keep PDF caches consistent across browser tabs.
 * Provides graceful degradation when BroadcastChannel is unavailable.
 */

import { debugLog } from '@/lib/debug'

/** Channel name for cache synchronization */
const CHANNEL_NAME = 'studentaid-pdf-cache'

/**
 * Cache event types
 */
export type CacheEventType =
  | 'pdf_cache_updated'
  | 'pdf_cache_invalidated'
  | 'pdf_cache_cleared'

/**
 * Cache event payload
 */
export interface CacheEvent {
  /** Event type */
  type: CacheEventType
  /** File ID (optional, required for update/invalidate) */
  fileId?: string
  /** Timestamp of the event */
  timestamp: number
  /** Tab ID that sent the event (for debugging) */
  sourceTabId?: string
}

/**
 * Event handler type
 */
export type CacheEventHandler = (event: CacheEvent) => void

/**
 * Check if BroadcastChannel is available
 */
export function isBroadcastChannelAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return typeof BroadcastChannel !== 'undefined'
}

/**
 * Generate a unique tab ID for debugging
 */
function generateTabId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Cache Sync Service class
 */
class CacheSyncServiceImpl {
  private channel: BroadcastChannel | null = null
  private handlers: Set<CacheEventHandler> = new Set()
  private isAvailable: boolean
  private tabId: string

  constructor() {
    this.isAvailable = isBroadcastChannelAvailable()
    this.tabId = generateTabId()

    if (this.isAvailable) {
      this.initChannel()
    } else {
      debugLog('[CacheSync] BroadcastChannel unavailable')
    }
  }

  /**
   * Initialize the BroadcastChannel
   */
  private initChannel(): void {
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME)

      this.channel.onmessage = (event: MessageEvent<CacheEvent>) => {
        const cacheEvent = event.data
        debugLog('[CacheSync] Received event:', cacheEvent.type, 'from:', cacheEvent.sourceTabId)

        // Skip events from this tab
        if (cacheEvent.sourceTabId === this.tabId) {
          return
        }

        // Notify all handlers
        this.handlers.forEach((handler) => {
          try {
            handler(cacheEvent)
          } catch (error) {
            console.warn('[CacheSync] Handler error:', error)
          }
        })
      }

      this.channel.onmessageerror = () => {
        console.warn('[CacheSync] Message error')
      }

      debugLog('[CacheSync] Channel initialized, tabId:', this.tabId)
    } catch (error) {
      console.warn('[CacheSync] Failed to initialize channel:', error)
      this.isAvailable = false
    }
  }

  /**
   * Broadcast a cache event to other tabs
   */
  broadcast(type: CacheEventType, fileId?: string): void {
    if (!this.isAvailable || !this.channel) {
      debugLog('[CacheSync] Cannot broadcast, channel unavailable')
      return
    }

    const event: CacheEvent = {
      type,
      fileId,
      timestamp: Date.now(),
      sourceTabId: this.tabId,
    }

    try {
      this.channel.postMessage(event)
      debugLog('[CacheSync] Broadcasted:', type, fileId || '')
    } catch (error) {
      console.warn('[CacheSync] Broadcast error:', error)
    }
  }

  /**
   * Convenience method: Broadcast cache updated event
   */
  notifyCacheUpdated(fileId: string): void {
    this.broadcast('pdf_cache_updated', fileId)
  }

  /**
   * Convenience method: Broadcast cache invalidated event
   */
  notifyCacheInvalidated(fileId: string): void {
    this.broadcast('pdf_cache_invalidated', fileId)
  }

  /**
   * Convenience method: Broadcast cache cleared event
   */
  notifyCacheCleared(): void {
    this.broadcast('pdf_cache_cleared')
  }

  /**
   * Subscribe to cache events from other tabs
   *
   * @param handler - Function to call when an event is received
   * @returns Unsubscribe function
   */
  subscribe(handler: CacheEventHandler): () => void {
    this.handlers.add(handler)
    debugLog('[CacheSync] Subscribed, total handlers:', this.handlers.size)

    return () => {
      this.handlers.delete(handler)
      debugLog('[CacheSync] Unsubscribed, total handlers:', this.handlers.size)
    }
  }

  /**
   * Close the channel and cleanup
   */
  close(): void {
    if (this.channel) {
      this.channel.close()
      this.channel = null
      debugLog('[CacheSync] Channel closed')
    }
    this.handlers.clear()
  }

  /**
   * Check if service is available
   */
  get available(): boolean {
    return this.isAvailable
  }

  /**
   * Get current tab ID
   */
  get currentTabId(): string {
    return this.tabId
  }
}

// Singleton instance
let instance: CacheSyncServiceImpl | null = null

/**
 * Get the cache sync service instance
 */
export function getCacheSyncService(): CacheSyncServiceImpl {
  if (!instance) {
    instance = new CacheSyncServiceImpl()
  }
  return instance
}

// Named export for convenience
export const cacheSyncService = {
  broadcast: (type: CacheEventType, fileId?: string) => getCacheSyncService().broadcast(type, fileId),
  notifyCacheUpdated: (fileId: string) => getCacheSyncService().notifyCacheUpdated(fileId),
  notifyCacheInvalidated: (fileId: string) => getCacheSyncService().notifyCacheInvalidated(fileId),
  notifyCacheCleared: () => getCacheSyncService().notifyCacheCleared(),
  subscribe: (handler: CacheEventHandler) => getCacheSyncService().subscribe(handler),
  close: () => getCacheSyncService().close(),
  get available() { return getCacheSyncService().available },
  get currentTabId() { return getCacheSyncService().currentTabId },
}
