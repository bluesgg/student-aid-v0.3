# Design: PDF Loading Optimization

## Overview
This document details the technical design for optimizing PDF loading performance in the StudentAid application.

## Current Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ StudyPage    │────▶│ useFile()   │────▶│ API Route    │────▶│ Supabase    │
│ (page.tsx)   │     │ hook        │     │ /files/:id   │     │ Storage     │
└──────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
       │                                        │
       │                                        │ signedUrl
       ▼                                        ▼
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ PdfViewer    │────▶│ react-pdf   │────▶│ pdfjs-dist   │
│ component    │     │ Document    │     │ getDocument  │
└──────────────┘     └─────────────┘     └──────────────┘
```

### Current Flow
1. `StudyPage` mounts → `useFile()` fetches file metadata + signed URL
2. `PdfViewer` receives `fileUrl` (signed URL) → passes to `<Document>`
3. `react-pdf` calls `pdfjs.getDocument(fileUrl)` → downloads entire PDF
4. After full download → `onDocumentLoadSuccess` → pages can render

### Pain Points
- Step 3 blocks all rendering until complete
- No caching between page navigations
- Signed URL regenerated each visit

## Proposed Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│ StudyPage    │────▶│ useCachedFile() │────▶│ PdfCache    │
│              │     │ hook            │     │ Service     │
└──────────────┘     └─────────────────┘     └─────────────┘
       │                     │                      │
       │                     │ cache hit?           │ cache miss
       ▼                     ▼                      ▼
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│ PdfViewer    │────▶│ Progressive     │────▶│ API /files  │
│              │     │ PDF Loader      │     │ + Supabase  │
└──────────────┘     └─────────────────┘     └─────────────┘
```

## Component Design

### 1. PdfCacheService

Responsible for caching PDF binary data in IndexedDB.

```typescript
// src/lib/pdf/cache-service.ts

interface CachedPdf {
  fileId: string
  contentHash: string       // SHA-256 of PDF content
  data: ArrayBuffer         // PDF binary data
  cachedAt: number          // timestamp
  accessedAt: number        // for LRU eviction
  size: number              // bytes
}

interface PdfCacheService {
  // Core operations
  get(fileId: string, contentHash?: string): Promise<ArrayBuffer | null>
  set(fileId: string, data: ArrayBuffer, contentHash: string): Promise<void>

  // Maintenance
  evictLRU(targetSizeBytes: number): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<{ count: number; totalSize: number }>
}

// Configuration
const MAX_CACHE_SIZE = 500 * 1024 * 1024  // 500MB
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000  // 7 days
```

### 2. SignedUrlCache

Cache signed URLs to avoid redundant API calls.

```typescript
// src/lib/pdf/url-cache.ts

interface CachedUrl {
  url: string
  expiresAt: number  // timestamp
  fileId: string
}

// Use sessionStorage (cleared on tab close)
// TTL: 50 minutes (leave 10min buffer before 1hr expiry)
```

### 3. ProgressivePdfLoader

Wrapper that enables progressive loading with progress feedback.

```typescript
// src/lib/pdf/progressive-loader.ts

interface LoadingProgress {
  loaded: number      // bytes loaded
  total: number       // total bytes (if known)
  firstPageReady: boolean
  numPagesLoaded: number
  totalPages: number
}

interface ProgressivePdfLoaderOptions {
  fileId: string
  url: string
  onProgress?: (progress: LoadingProgress) => void
  onFirstPageReady?: () => void
  useCache?: boolean
}

// Returns a modified document source that react-pdf can use
function createProgressiveSource(options: ProgressivePdfLoaderOptions): {
  source: PDFDocumentLoadingTask | string | ArrayBuffer
  cleanup: () => void
}
```

### 4. useCachedFile Hook

Enhanced file hook with caching integration.

```typescript
// src/features/files/hooks/use-cached-file.ts

interface UseCachedFileOptions {
  courseId: string
  fileId: string
  prefetch?: boolean  // start loading before needed
}

interface UseCachedFileReturn {
  // Existing fields
  data: FileData | null
  isLoading: boolean
  error: Error | null

  // New fields
  pdfSource: ArrayBuffer | string | null  // cached data or URL
  loadingProgress: LoadingProgress | null
  isCached: boolean
  cacheStatus: 'hit' | 'miss' | 'stale' | 'loading'
}
```

### 5. Enhanced PdfViewer Props

```typescript
interface PdfViewerProps {
  // Existing props...

  // New props for progressive loading
  pdfSource?: ArrayBuffer | string  // prefer over fileUrl if cached
  loadingProgress?: LoadingProgress
  onFirstPageReady?: () => void
}
```

## Implementation Details

### Progressive Loading with pdfjs-dist

```typescript
// pdfjs-dist supports streaming via onProgress callback
const loadingTask = pdfjs.getDocument({
  url: signedUrl,
  // OR
  data: cachedArrayBuffer,

  // Enable range requests for large files
  rangeChunkSize: 65536,  // 64KB chunks
  disableAutoFetch: false,
  disableStream: false,
});

loadingTask.onProgress = ({ loaded, total }) => {
  setProgress({ loaded, total, percentage: (loaded / total) * 100 })
}

// Get first page as soon as metadata loaded
const pdf = await loadingTask.promise
const firstPage = await pdf.getPage(1)
// Render first page immediately
```

### IndexedDB Schema

```
Database: studentaid-pdf-cache
├── Store: pdf-data
│   ├── Key: fileId (string)
│   └── Value: { contentHash, data, cachedAt, accessedAt, size }
└── Store: metadata
    ├── Key: 'stats'
    └── Value: { totalSize, lastEviction }
```

### Lazy Layer Rendering

```typescript
// In PdfPage component
<Page
  pageNumber={pageNumber}
  scale={scale}
  // Defer non-essential layers
  renderTextLayer={isStable}      // after 500ms idle
  renderAnnotationLayer={isStable}
  // Always render canvas immediately
  onRenderSuccess={handleRenderSuccess}
/>
```

### Cache Eviction Strategy

```
1. On cache write:
   - If totalSize > MAX_CACHE_SIZE * 0.9:
     - Evict entries older than MAX_CACHE_AGE
     - If still over, evict LRU entries until under 80%

2. LRU ordering:
   - Sort by accessedAt ascending
   - Remove oldest until target size reached

3. Cache invalidation:
   - contentHash mismatch = stale, re-fetch
   - File deleted = remove from cache on 404
   - BroadcastChannel event received = mark as stale
```

### Multi-Tab Synchronization

Use BroadcastChannel API to keep caches consistent across browser tabs.

```typescript
// src/lib/pdf/cache-sync.ts

const CHANNEL_NAME = 'studentaid-pdf-cache'

type CacheEvent =
  | { type: 'pdf_cache_updated'; fileId: string }
  | { type: 'pdf_cache_invalidated'; fileId: string }
  | { type: 'pdf_cache_cleared' }

interface CacheSyncService {
  // Broadcast cache change to other tabs
  broadcast(event: CacheEvent): void

  // Subscribe to cache events from other tabs
  subscribe(handler: (event: CacheEvent) => void): () => void

  // Close channel on cleanup
  close(): void
}

// Usage in useCachedFile hook:
// 1. On successful cache write → broadcast({ type: 'pdf_cache_updated', fileId })
// 2. On receiving event → mark cache stale, trigger revalidate
// 3. On tab focus → lightweight revalidate for current file
```

**Event Flow**:
```
Tab A: User downloads PDF
  ├─> Store in IndexedDB
  ├─> Broadcast 'pdf_cache_updated' { fileId: 'xxx' }
  └─> Update React state

Tab B: Receives broadcast
  ├─> Mark local cache for fileId as 'stale'
  └─> On next access: revalidate from DB (not re-download PDF)

Tab B: Gets focus (visibilitychange)
  └─> If current file is stale → trigger lightweight revalidate
```

**React Integration**:
```typescript
// In useCachedFile hook
useEffect(() => {
  const unsubscribe = cacheSyncService.subscribe((event) => {
    if (event.type === 'pdf_cache_invalidated' && event.fileId === fileId) {
      // Mark as stale, will revalidate on next access
      setCacheStatus('stale')
    }
    if (event.type === 'pdf_cache_cleared') {
      // Clear local state
      setCacheStatus('miss')
    }
  })
  return unsubscribe
}, [fileId])

// Revalidate on tab focus
useEffect(() => {
  const handleFocus = () => {
    if (cacheStatus === 'stale') {
      refetch()
    }
  }
  window.addEventListener('focus', handleFocus)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') handleFocus()
  })
  return () => {
    window.removeEventListener('focus', handleFocus)
    // ... cleanup visibilitychange
  }
}, [cacheStatus, refetch])
```

### Scroll Mode Caching Strategy

PDF caching works identically in both Page mode and Scroll (continuous) mode.

**Cache Behavior by Mode**:

| Aspect | Page Mode | Scroll Mode |
|--------|-----------|-------------|
| Cache granularity | Entire PDF binary | Entire PDF binary (same) |
| Cache key | fileId + contentHash | fileId + contentHash (same) |
| Progressive loading | First page priority | Viewport pages priority |
| Memory management | Single page rendered | Virtual window (react-window) |

**Scroll Mode Specifics**:
```typescript
// In scroll mode, prioritize loading pages near current viewport
interface ScrollModeLoadingPriority {
  // Visible pages: highest priority (load immediately)
  visiblePages: number[]

  // Buffer pages: medium priority (preload ±3 pages)
  bufferPages: number[]

  // Remaining pages: low priority (background load)
  remainingPages: number[]
}

// When user scrolls, update priority queue
function updateLoadingPriority(viewportTop: number, viewportHeight: number, pageCount: number) {
  const visibleRange = calculateVisiblePages(viewportTop, viewportHeight)
  const bufferRange = expandRange(visibleRange, 3) // ±3 pages buffer
  // Remaining pages load in background
}
```

**Cache + Scroll Mode Integration**:
1. Cache stores entire PDF binary (same as page mode)
2. On cache hit: PDF loads from IndexedDB → react-pdf handles virtual rendering
3. On cache miss: Progressive download with scroll-aware prioritization
4. No mode-specific cache entries (avoids cache duplication)

## Data Flow

### First Visit (Cache Miss)
```
1. useCachedFile(fileId) → check IndexedDB → miss
2. Fetch signed URL from API
3. Start progressive download with onProgress
4. Store in IndexedDB when complete
5. Render pages as they become available
```

### Return Visit (Cache Hit)
```
1. useCachedFile(fileId) → check IndexedDB → hit
2. Verify contentHash with API (background)
3. Immediately return cached ArrayBuffer
4. PdfViewer renders instantly from memory
5. If hash mismatch, invalidate and re-fetch
```

### Stale Cache
```
1. useCachedFile(fileId) → check IndexedDB → hit
2. API returns different contentHash
3. Show cached version immediately
4. Background re-fetch new version
5. Prompt user or auto-update on next visit
```

## API Changes

### GET /api/courses/:courseId/files/:fileId

Expose existing `content_hash` column in response for cache validation:

```json
{
  "id": "...",
  "downloadUrl": "...",
  "contentHash": "abc123...",  // Expose existing files.content_hash
  // ... existing fields
}
```

**Note**: `content_hash` is already computed and stored during file upload (see `src/app/api/courses/[courseId]/files/route.ts:214`). No DB changes needed.

## Migration Path

1. **Phase 1**: Add progress indicator (no breaking changes)
2. **Phase 2**: Add caching layer (opt-in via feature flag)
3. **Phase 3**: Enable by default after validation

## Performance Targets

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| First page visible | ~3-5s | <1s | Progressive loading |
| Full doc loaded | ~5-10s | ~4-8s | Parallel loading |
| Cache hit load | N/A | <200ms | IndexedDB |
| Return visit | ~3-5s | <500ms | Cache + lazy layers |

## Testing Strategy

1. **Unit tests**: Cache service, URL cache, progress calculation
2. **Integration tests**: Full load flow with mock PDF
3. **Performance tests**: Measure load times with various PDF sizes
4. **E2E tests**: Verify user experience improvements

## Performance Metrics Integration

Follow existing pattern from `src/lib/metrics/sticker-metrics.ts` and `src/lib/context/metrics.ts`.

**Target table**: New `pdf_load_metrics` table (not existing sticker_latency_samples).

```typescript
// src/lib/pdf/performance-metrics.ts

export type PdfLoadMetricField =
  | 'pdf_load_started'
  | 'pdf_load_completed'
  | 'pdf_cache_hits'
  | 'pdf_cache_misses'
  | 'first_page_renders'

export interface PdfLoadMetrics {
  fileId: string
  loadTimeMs: number
  firstPageTimeMs: number
  totalPages: number
  fileSizeBytes: number
  cacheHit: boolean
  timestamp: string
}

// Record to new pdf_load_metrics table
export async function recordPdfLoadMetric(metric: PdfLoadMetrics): Promise<void>
```

**Database schema** (new table):
```sql
CREATE TABLE pdf_load_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  load_time_ms INTEGER NOT NULL,
  first_page_time_ms INTEGER,
  total_pages INTEGER,
  file_size_bytes BIGINT,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdf_load_metrics_file ON pdf_load_metrics(file_id);
CREATE INDEX idx_pdf_load_metrics_created ON pdf_load_metrics(created_at);
```

Metrics to track:
- **First Page Time**: Time from mount to first page visible
- **Full Load Time**: Time from mount to all pages ready
- **Cache Hit Rate**: Percentage of loads from cache
- **Download Speed**: Bytes per second for network loads

## Loading Messages i18n

All user-facing loading messages must use the i18n system (next-intl).

**Translation Keys** (`/src/i18n/messages/{locale}.json`):

```json
// en.json
{
  "pdf": {
    "loading": {
      "downloading": "Downloading...",
      "downloadingPercent": "Downloading... {percent}%",
      "downloadingSize": "Downloading... {size} MB",
      "loadingPage": "Loading page {current} of {total}",
      "loadingFromCache": "Loading from cache...",
      "preparingDocument": "Preparing document..."
    },
    "cache": {
      "title": "PDF Cache",
      "size": "{size} MB used",
      "fileCount": "{count} PDFs cached",
      "clearButton": "Clear PDF Cache",
      "clearConfirm": "Are you sure you want to clear all cached PDFs?",
      "clearSuccess": "PDF cache cleared"
    },
    "error": {
      "loadFailed": "Failed to load PDF",
      "cacheFailed": "Failed to cache PDF (continuing without cache)"
    }
  }
}

// zh.json
{
  "pdf": {
    "loading": {
      "downloading": "下载中...",
      "downloadingPercent": "下载中... {percent}%",
      "downloadingSize": "下载中... {size} MB",
      "loadingPage": "正在加载第 {current} 页，共 {total} 页",
      "loadingFromCache": "正在从缓存加载...",
      "preparingDocument": "正在准备文档..."
    },
    "cache": {
      "title": "PDF 缓存",
      "size": "已使用 {size} MB",
      "fileCount": "已缓存 {count} 个 PDF",
      "clearButton": "清除 PDF 缓存",
      "clearConfirm": "确定要清除所有缓存的 PDF 吗？",
      "clearSuccess": "PDF 缓存已清除"
    },
    "error": {
      "loadFailed": "PDF 加载失败",
      "cacheFailed": "PDF 缓存失败（继续无缓存加载）"
    }
  }
}
```

**Component Usage**:
```typescript
// src/features/reader/components/pdf-loading-progress.tsx
import { useTranslations } from 'next-intl'

function PdfLoadingProgress({ progress, isCached }: Props) {
  const t = useTranslations('pdf.loading')

  if (isCached) {
    return <div>{t('loadingFromCache')}</div>
  }

  if (progress.total > 0) {
    const percent = Math.round((progress.loaded / progress.total) * 100)
    return <div>{t('downloadingPercent', { percent })}</div>
  }

  const sizeMB = (progress.loaded / 1024 / 1024).toFixed(1)
  return <div>{t('downloadingSize', { size: sizeMB })}</div>
}
```

## Browser Compatibility Matrix

| Browser | IndexedDB | BroadcastChannel | Progressive Loading | Notes |
|---------|-----------|------------------|---------------------|-------|
| Chrome 90+ | ✅ | ✅ | ✅ | Full support |
| Edge 90+ | ✅ | ✅ | ✅ | Full support |
| Firefox 90+ | ✅ | ✅ | ✅ | Full support |
| Safari 15.4+ | ✅ | ✅ | ✅ | Full support |
| Safari (Private) | ⚠️ | ✅ | ✅ | IndexedDB limited, fallback to network |

**Fallback Strategy**:
```typescript
// Feature detection
const hasIndexedDB = typeof indexedDB !== 'undefined'
const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined'

// Graceful degradation
if (!hasIndexedDB) {
  console.warn('[PdfCache] IndexedDB unavailable, using network-only mode')
  // Skip caching, load directly from URL
}

if (!hasBroadcastChannel) {
  console.warn('[PdfCache] BroadcastChannel unavailable, multi-tab sync disabled')
  // Use focus-based revalidation only
}
```

## Account Lifecycle Handling

### User Logout
When user logs out, clear session-scoped caches:

```typescript
// In logout handler (src/features/auth/api.ts or similar)
async function handleLogout() {
  // Clear signed URL cache (sessionStorage)
  sessionStorage.removeItem('pdf-url-cache')

  // Note: IndexedDB PDF cache is NOT cleared on logout
  // - PDFs are user-owned data, safe to keep for re-login
  // - Avoids unnecessary re-downloads
  // - Cache is keyed by fileId, invalid after account delete anyway
}
```

### Account Deletion
When user deletes account (DELETE /api/account), clear ALL local caches:

```typescript
// In account deletion handler
async function handleAccountDeletion() {
  // 1. Clear sessionStorage
  sessionStorage.clear()

  // 2. Clear IndexedDB PDF cache
  await pdfCacheService.clear()

  // 3. Broadcast to other tabs
  cacheSyncService.broadcast({ type: 'pdf_cache_cleared' })

  // 4. Clear any other local storage
  localStorage.removeItem('pdf-viewer-preferences')
}
```

**Integration Point**: Add cache cleanup call in existing account deletion flow at `src/app/api/account/route.ts` (client-side cleanup triggered after successful API response).

## Storage Limits Clarification

| Limit Type | Value | Scope | Purpose |
|------------|-------|-------|---------|
| **Server Storage** | 5 GB/user | Supabase Storage | User's uploaded PDF files (01_PRD §4.3.2) |
| **Client PDF Cache** | 500 MB | Browser IndexedDB | Local cache for faster repeat access |
| **Server File Size** | 100 MB/file | Supabase Storage | Max single PDF upload size |
| **Client Cache Age** | 7 days | Browser IndexedDB | Max retention before auto-eviction |

**Key Distinction**: The 500MB IndexedDB cache is a **client-side performance optimization** that does NOT count against the user's 5GB server storage quota. Users can upload 5GB of PDFs to the server regardless of their local cache size.

## Rollback Plan

1. All new code behind feature flag `ENABLE_PDF_CACHE`
2. Original `useFile` hook preserved
3. `PdfViewer` accepts both old `fileUrl` and new `pdfSource` props
4. If issues detected, disable flag → instant rollback
