# Tasks: Optimize PDF Loading Performance

## Overview
Ordered list of tasks to implement PDF loading optimizations. Tasks are organized by phase and include dependencies.

---

## Phase 0: Quick Wins (No Risk, Immediate Impact)

### Task 0.1: Create Debug Logging Utility
**Status**: completed
**Depends on**: none
**Verification**: Debug logs only appear when env var is set

Create a shared debug logging utility controlled by environment variable:
- Add `NEXT_PUBLIC_DEBUG_PDF_VIEWER` to `.env.example`
- Create `debugLog` function that checks env before logging
- Zero runtime cost when disabled (early return, no string interpolation)

Files:
- `.env.example` (add new variable)
- `src/lib/debug.ts` (new utility)

Acceptance:
- [x] `NEXT_PUBLIC_DEBUG_PDF_VIEWER=false` (default) produces no console output
- [x] `NEXT_PUBLIC_DEBUG_PDF_VIEWER=true` enables all debug logs
- [x] Utility function is type-safe and accepts any log arguments

---

### Task 0.2: Replace Debug Console.logs with Utility
**Status**: completed
**Depends on**: 0.1
**Verification**: No debug console.log output in production build

Replace debug `console.log` calls in reader components with the debug utility.
**IMPORTANT**: Preserve `console.warn` and `console.error` calls - only replace debug `console.log`.

Target files:
- `src/features/reader/components/pdf-viewer.tsx` (~20 debug logs)
- `src/features/reader/hooks/use-image-detection.ts` (~1 debug log)
- `src/features/reader/hooks/use-rectangle-drawing.ts` (~9 debug logs)
- `src/features/reader/hooks/use-auto-explain-session.ts` (~2 debug logs)
- `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx` (~3 debug logs)

Files:
- `src/features/reader/components/pdf-viewer.tsx`
- `src/features/reader/hooks/use-image-detection.ts`
- `src/features/reader/hooks/use-rectangle-drawing.ts`
- `src/features/reader/hooks/use-auto-explain-session.ts`
- `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx`

Acceptance:
- [x] All `console.log('[...DEBUG]'` replaced with `debugLog()`
- [x] `console.warn` and `console.error` calls are PRESERVED (not replaced)
- [x] `pnpm build` produces no debug output in browser
- [x] Setting env var to `true` restores all debug output
- [x] No functional regression

---

### Task 0.3: Add staleTime to useFile Hook
**Status**: completed
**Depends on**: none
**Verification**: Network tab shows no duplicate file API calls

Add React Query caching configuration to useFile hook:
- Set `staleTime: 30 * 60 * 1000` (30 minutes)
- Signed URL is valid for 1 hour, so 30 minutes is safe

Files:
- `src/features/files/hooks/use-files.ts`

Acceptance:
- [x] Opening same file twice within 30 min uses cached data
- [x] Network tab shows single API call for repeated access
- [x] File updates still invalidate cache correctly

---

### Task 0.4: Defer Image Detection API Call
**Status**: completed
**Depends on**: none
**Verification**: Image detection fires after first page render

Defer image detection until PDF first page is visible:
- Add `isFirstPageRendered` state to PdfViewer
- Pass to useImageDetection as `enabled` condition
- Image detection fires only after first page canvas is ready

Files:
- `src/features/reader/components/pdf-viewer.tsx`
- `src/features/reader/hooks/use-image-detection.ts` (modify enabled logic)

Acceptance:
- [x] PDF first page renders before image detection API call
- [x] Image overlays still appear correctly after detection completes
- [x] No regression in image click-to-explain feature

---

## Phase 1: Immediate Improvements (Progressive Loading)

### Task 1.1: Add Loading Progress i18n Messages
**Status**: completed
**Depends on**: none
**Verification**: Loading messages display in correct locale

Add i18n translation keys for all PDF loading messages:
- Add `pdf.loading.*` and `pdf.cache.*` keys to en.json and zh.json
- Follow existing i18n patterns in the codebase

Files:
- `src/i18n/messages/en.json` (add pdf.loading.* keys)
- `src/i18n/messages/zh.json` (add pdf.loading.* keys)

Acceptance:
- [x] All loading messages have translation keys
- [x] Messages include interpolation for dynamic values (percent, size, page numbers)
- [x] Both en and zh translations provided
- [x] No hardcoded strings in components

---

### Task 1.2: Add Loading Progress Indicator
**Status**: completed
**Depends on**: 1.1
**Verification**: Visual loading progress shown during PDF load

Replace generic spinner with meaningful progress indicator showing:
- Download progress (bytes loaded / total)
- "Loading page X of Y" when available
- All text uses i18n translation keys

Files:
- `src/features/reader/components/pdf-viewer.tsx` (add progress state)
- `src/features/reader/components/pdf-loading-progress.tsx` (new component)
- `src/features/reader/hooks/use-pdf-document.ts` (expose progress)

Acceptance:
- [x] Progress bar visible during PDF load
- [x] Shows percentage when total size known
- [x] Shows bytes loaded when total unknown
- [x] All text uses useTranslations('pdf.loading')
- [x] Smooth animation, no flicker

---

### Task 1.3: Implement Progressive Page Rendering
**Status**: completed
**Depends on**: 1.2
**Verification**: First page visible before full document loads

Configure pdfjs-dist for progressive rendering:
- Enable streaming mode
- Show first page as soon as PDF metadata is loaded
- Load remaining pages in background
- In Scroll mode: prioritize viewport pages, preload ±3 buffer pages

Files:
- `src/lib/pdf/progressive-loader.ts` (new)
- `src/features/reader/hooks/use-pdf-document.ts` (integrate loader)
- `src/features/reader/components/pdf-viewer.tsx` (handle partial load)

Acceptance:
- [x] First page renders within 1s for <10MB PDFs (react-pdf handles this natively)
- [x] Remaining pages load without blocking UI (react-pdf handles this natively)
- [x] Page navigation works while loading (shows spinner for unloaded pages)
- [x] Scroll mode: viewport pages prioritized in loading queue (react-window overscan)
- [x] No regression in current functionality

---

### Task 1.4: Lazy Text and Annotation Layers
**Status**: completed
**Depends on**: 1.3
**Verification**: Canvas renders immediately, text layer deferred

Defer non-essential layers until page is stable:
- Render canvas immediately
- Wait 500ms idle (using requestIdleCallback or setTimeout fallback) before rendering text layer
- Wait until user interaction for annotation layer

Files:
- `src/features/reader/components/pdf-page.tsx`

Acceptance:
- [x] Canvas visible immediately after page load
- [x] Text selection works after brief delay (500ms TEXT_LAYER_DELAY_MS)
- [x] Links/annotations work after interaction (800ms ANNOTATION_LAYER_DELAY_MS)
- [x] No visible layout shift

---

## Phase 2: Caching Layer

### Task 2.1: Create PdfCacheService
**Status**: completed
**Depends on**: none
**Verification**: Unit tests pass for cache operations

Implement IndexedDB-based cache service:
- CRUD operations for PDF data
- LRU eviction logic
- Storage statistics

Files:
- `src/lib/pdf/cache-service.ts` (new)
- `src/lib/pdf/__tests__/cache-service.test.ts` (new)

Acceptance:
- [x] Can store and retrieve PDF ArrayBuffer by fileId
- [x] Evicts LRU entries when over 500MB
- [x] Handles IndexedDB errors gracefully
- [x] Works in private browsing (graceful degradation)

---

### Task 2.2: Create SignedUrlCache
**Status**: completed
**Depends on**: none
**Verification**: Unit tests pass, duplicate API calls eliminated

Implement sessionStorage-based signed URL cache:
- Store URL with expiry time
- 50-minute TTL (10min buffer before 1hr expiry)
- Automatic invalidation on expiry

Files:
- `src/lib/pdf/url-cache.ts` (new)
- `src/lib/pdf/__tests__/url-cache.test.ts` (new)

Acceptance:
- [x] Returns cached URL if not expired
- [x] Returns null if expired or missing
- [x] Handles sessionStorage errors
- [x] No memory leaks

---

### Task 2.3: Expose Content Hash in File API Response
**Status**: completed
**Depends on**: none
**Verification**: GET /files/:id returns contentHash field

Expose existing `content_hash` column in GET response (no DB changes needed):
- `content_hash` already computed and stored during upload
- Just add to API response

Files:
- `src/app/api/courses/[courseId]/files/[fileId]/route.ts` (add contentHash to response)

Acceptance:
- [x] GET endpoint returns `contentHash: string | null`
- [x] Existing files with hash return the hash
- [x] Pre-hash files return null (already handled by DB)

---

### Task 2.4: Create CacheSyncService (BroadcastChannel)
**Status**: completed
**Depends on**: 2.1
**Verification**: Unit tests pass for cross-tab communication

Implement BroadcastChannel-based cache synchronization:
- Broadcast cache events to other tabs
- Subscribe to events from other tabs
- Mark cache as stale on receiving invalidation event
- Graceful fallback when BroadcastChannel unavailable

Files:
- `src/lib/pdf/cache-sync.ts` (new)
- `src/lib/pdf/__tests__/cache-sync.test.ts` (new)

Acceptance:
- [x] Can broadcast pdf_cache_updated event
- [x] Can broadcast pdf_cache_invalidated event
- [x] Can broadcast pdf_cache_cleared event
- [x] Other tabs receive events within 100ms
- [x] Graceful no-op when BroadcastChannel unavailable
- [x] Cleanup on unmount (close channel)

---

### Task 2.5: Create useCachedFile Hook
**Status**: completed
**Depends on**: 2.1, 2.2, 2.3, 2.4
**Verification**: Integration test shows cache hit/miss behavior

Combine cache services into unified hook:
- Check cache first
- Fallback to API + download
- Store in cache after download
- Validate hash on cache hit
- Integrate BroadcastChannel for multi-tab sync
- Revalidate on tab focus if cache is stale

Files:
- `src/features/files/hooks/use-cached-file.ts` (new)
- `src/features/files/hooks/__tests__/use-cached-file.test.ts` (new)

Acceptance:
- [x] Cache miss: fetches and caches
- [x] Cache hit: returns immediately
- [x] Hash mismatch: re-fetches
- [x] Exposes isCached and cacheStatus
- [x] Broadcasts cache events to other tabs
- [x] Revalidates on receiving invalidation event
- [x] Revalidates stale cache on tab focus

---

### Task 2.6: Integrate Caching with PdfViewer
**Status**: completed
**Depends on**: 2.5, 1.3
**Verification**: E2E test shows faster repeat visits

Wire up cached file hook to PDF viewer:
- Accept ArrayBuffer or URL as source
- Prefer cached data when available
- Show cache status in debug mode

Files:
- `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx`
- `src/features/reader/components/pdf-viewer.tsx`

Acceptance:
- [x] Cached PDFs load in <500ms
- [x] Uncached PDFs show progress indicator
- [x] No regression in existing features
- [x] Feature flag controls cache usage (enableCache option in useCachedFile)

---

### Task 2.7: Add Cache Management UI
**Status**: completed
**Depends on**: 2.6
**Verification**: User can clear cache from settings

Add cache statistics and clear button to Settings page.

**UI Location**: Settings page > Usage tab (alongside quota overview)
- Rationale: Cache affects storage/usage, fits naturally with Usage tab content
- Alternative considered: Separate "Storage" tab - rejected as overkill for MVP

Features:
- Show total cache size (e.g., "245 MB used")
- Show number of cached files (e.g., "12 PDFs cached")
- Clear cache button with confirmation dialog
- All text uses i18n translation keys (pdf.cache.*)

Files:
- `src/app/(app)/settings/page.tsx` (add cache section to Usage tab)
- `src/components/settings/cache-settings.tsx` (new component)

Acceptance:
- [x] Cache statistics appear in Settings > Usage tab
- [x] Shows accurate cache size and file count
- [x] Clear button shows confirmation dialog
- [x] Clear removes all cached PDFs from IndexedDB
- [x] All text uses useTranslations('pdf.cache')
- [ ] Toast confirms successful clear (skipped - inline UI feedback used instead)
- [x] Page updates after clear
- [x] Broadcasts pdf_cache_cleared to other tabs

---

### Task 2.8: Add Account Lifecycle Cache Cleanup
**Status**: completed
**Depends on**: 2.1, 2.4
**Verification**: Cache cleared on account deletion, session cache cleared on logout

Implement cache cleanup for account lifecycle events:

**On Logout**:
- Clear sessionStorage (signed URL cache)
- Keep IndexedDB PDF cache (user-owned data, safe to keep for re-login)

**On Account Deletion**:
- Clear sessionStorage completely
- Clear IndexedDB PDF cache completely
- Broadcast `pdf_cache_cleared` to other tabs
- Clear localStorage preferences

Files:
- `src/features/auth/hooks/use-auth.ts` (add sessionStorage clear on logout)
- `src/app/(app)/settings/page.tsx` or account deletion handler (add full cache clear)
- `src/lib/pdf/cache-service.ts` (ensure clear() method exists)

Acceptance:
- [x] Logout clears sessionStorage signed URL cache
- [x] Logout does NOT clear IndexedDB PDF cache
- [ ] Account deletion clears ALL local caches (N/A - no account deletion feature yet)
- [ ] Account deletion broadcasts pdf_cache_cleared to other tabs (N/A)
- [x] Other tabs respond to broadcast by clearing their cache state
- [x] No errors if caches are already empty

---

## Phase 3: Measurement and Polish

### Task 3.1: Add Performance Metrics
**Status**: completed
**Depends on**: 2.5
**Verification**: Metrics recorded to pdf_load_metrics table

Track and log key performance metrics:
- Time to first page visible
- Time to full document loaded
- Cache hit rate
- Download speed

Files:
- `src/lib/supabase/migrations/008_pdf_load_metrics.sql` (new table)
- `src/lib/pdf/performance-metrics.ts` (new)
- `src/features/reader/hooks/use-pdf-load-metrics.ts` (new hook)
- `src/app/api/metrics/pdf-load/route.ts` (new API endpoint)
- `src/features/reader/components/pdf-viewer.tsx` (integrate)

Acceptance:
- [x] `pdf_load_metrics` table created with schema from design.md
- [x] Metrics recorded on each PDF load
- [x] Metrics logged to console in dev mode (via debugLog)
- [x] No performance impact from measurement (fire-and-forget API calls)

---

### Task 3.2: Prefetch Recently Accessed Files
**Status**: completed
**Depends on**: 2.4
**Verification**: Files prefetched when viewing file list

Prefetch PDFs user is likely to open:
- On file list view, prefetch first 3 files in background
- Low priority fetch (after page is interactive)
- Respect cache limits
- Force prefetch (no user opt-out for MVP)

Files:
- `src/features/files/hooks/use-prefetch-files.ts` (new)
- `src/features/files/components/file-list.tsx` (integrate)

Acceptance:
- [x] Prefetch starts after file list renders (2 second delay)
- [x] Does not block main thread (async with AbortController)
- [x] Respects cache size limits (uses existing PdfCacheService eviction)

---

### Task 3.3: Write Performance Test Suite
**Status**: completed
**Depends on**: 3.1
**Verification**: Automated performance tests in CI

Create performance tests to prevent regressions:
- Measure load times with various PDF sizes
- Compare against baselines
- Fail CI if significantly slower

Files:
- `tests/performance/pdf-loading.spec.ts` (new)
- `playwright.config.ts` (add performance project)

Acceptance:
- [x] Tests run in CI (via Playwright performance project)
- [x] Baseline metrics documented (thresholds in test file)
- [x] Alert on >20% regression (regressionTolerance in thresholds)

---

## Summary

| Phase | Tasks | Est. Complexity |
|-------|-------|-----------------|
| 0     | 4     | Very Low        |
| 1     | 4     | Low-Medium      |
| 2     | 8     | Medium          |
| 3     | 3     | Low             |

**Total Tasks**: 19

**Recommended order**:
- Phase 0: 0.1 → 0.2 (sequential), 0.3 || 0.4 (parallel with 0.1-0.2)
- Phase 1: 1.1 → 1.2 → 1.3 → 1.4
- Phase 2: 2.1 || 2.2 || 2.3 (parallel) → 2.4 → 2.5 → 2.6 → 2.7 || 2.8 (parallel after 2.4)
- Phase 3: 3.1 → 3.2 → 3.3

**Parallelization opportunities**:
- Tasks 0.3, 0.4 can be done in parallel with 0.1-0.2
- Tasks 2.1 (PdfCacheService), 2.2 (SignedUrlCache), 2.3 (Content Hash API) can be worked on in parallel
- Task 2.4 (BroadcastChannel) can start after 2.1 is complete
- Task 2.8 (Account Lifecycle) can be done in parallel with 2.7, after 2.1 and 2.4 are complete
