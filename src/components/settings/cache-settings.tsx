'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { pdfCacheService, type CacheStats } from '@/lib/pdf/cache-service'
import { cacheSyncService } from '@/lib/pdf/cache-sync'

/**
 * Cache settings component for the Settings > Usage tab.
 * Shows cache statistics and provides a button to clear the cache.
 */
export function CacheSettings() {
  const t = useTranslations('pdf.cache')
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isAvailable, setIsAvailable] = useState(true)

  // Fetch cache statistics
  const fetchStats = useCallback(async () => {
    if (!pdfCacheService.available) {
      setIsAvailable(false)
      return
    }

    try {
      const cacheStats = await pdfCacheService.getStats()
      setStats(cacheStats)
    } catch (error) {
      console.warn('[CacheSettings] Failed to fetch stats:', error)
    }
  }, [])

  // Initial fetch and subscribe to cache events
  useEffect(() => {
    fetchStats()

    // Re-fetch stats when cache is updated by other tabs
    const unsubscribe = cacheSyncService.subscribe((event) => {
      if (event.type === 'pdf_cache_updated' || event.type === 'pdf_cache_cleared') {
        fetchStats()
      }
    })

    return unsubscribe
  }, [fetchStats])

  // Handle clear cache
  const handleClear = useCallback(async () => {
    setIsClearing(true)
    try {
      await pdfCacheService.clear()
      cacheSyncService.notifyCacheCleared()
      setStats({ count: 0, totalSize: 0, oldestEntry: null, newestEntry: null })
      setShowConfirm(false)
    } catch (error) {
      console.error('[CacheSettings] Failed to clear cache:', error)
    } finally {
      setIsClearing(false)
    }
  }, [])

  // Format size in MB
  const formatSize = (bytes: number): string => {
    return (bytes / 1024 / 1024).toFixed(1)
  }

  // If IndexedDB is not available, don't show the component
  if (!isAvailable) {
    return null
  }

  return (
    <div className="bg-white rounded-lg border border-secondary-200 p-4">
      <h3 className="text-sm font-medium text-secondary-900 mb-3">{t('title')}</h3>

      <div className="space-y-3">
        {/* Cache statistics */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-secondary-600">
            {stats ? t('size', { size: formatSize(stats.totalSize) }) : '--'}
          </span>
          <span className="text-secondary-500">
            {stats ? t('fileCount', { count: stats.count }) : '--'}
          </span>
        </div>

        {/* Progress bar (visual indicator of cache usage - 500MB max) */}
        {stats && (
          <div className="h-2 bg-secondary-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{
                width: `${Math.min(100, (stats.totalSize / (500 * 1024 * 1024)) * 100)}%`,
              }}
            />
          </div>
        )}

        {/* Clear button */}
        {showConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary-600 flex-1">
              {t('clearConfirm')}
            </span>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 text-sm text-secondary-600 hover:text-secondary-800"
              disabled={isClearing}
            >
              Cancel
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Confirm'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full px-4 py-2 text-sm text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors disabled:opacity-50"
            disabled={!stats || stats.count === 0}
          >
            {t('clearButton')}
          </button>
        )}
      </div>
    </div>
  )
}
