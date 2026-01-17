# pdf-viewer-interaction Specification Delta

## Purpose
Extends pdf-viewer-interaction capability with PDF loading performance optimizations including progressive rendering, browser caching, and loading feedback.

## ADDED Requirements

### Requirement: Debug Logging Control
The system SHALL provide environment variable control for debug logging in PDF viewer components.

#### Scenario: Debug logging disabled in production
- **GIVEN** `NEXT_PUBLIC_DEBUG_PDF_VIEWER` is not set or set to `false`
- **WHEN** PDF viewer components execute
- **THEN** no debug console.log statements are executed
- **AND** console remains clean of PDF viewer debug output
- **AND** JavaScript execution is not slowed by logging

#### Scenario: Debug logging enabled for development
- **GIVEN** `NEXT_PUBLIC_DEBUG_PDF_VIEWER` is set to `true`
- **WHEN** PDF viewer components execute
- **THEN** debug console.log statements are executed
- **AND** developer can see component lifecycle and state changes
- **AND** log messages include component name prefix (e.g., `[PdfViewer DEBUG]`)

#### Scenario: Conditional logging utility
- **GIVEN** debug logging is controlled by environment variable
- **WHEN** component needs to log debug information
- **THEN** component uses shared `debugLog` utility function
- **AND** utility checks `NEXT_PUBLIC_DEBUG_PDF_VIEWER` before logging
- **AND** logging call has zero cost when disabled (no string interpolation)

### Requirement: File API Response Caching
The system SHALL cache file API responses to reduce redundant network requests.

#### Scenario: useFile hook caches response
- **GIVEN** user opens a PDF file
- **WHEN** useFile hook fetches file metadata
- **THEN** response is cached for 30 minutes (staleTime)
- **AND** subsequent renders use cached data
- **AND** no duplicate API calls within staleTime window

#### Scenario: Cache invalidated on file update
- **GIVEN** file metadata is cached
- **WHEN** file is updated (e.g., last read page changes)
- **THEN** cache is invalidated for that specific file
- **AND** next access fetches fresh data from API

### Requirement: Deferred Image Detection
The system SHALL defer image detection API calls until PDF first page is rendered.

#### Scenario: Image detection waits for first render
- **GIVEN** user opens a PDF file
- **WHEN** PDF viewer starts loading
- **THEN** image detection API is NOT called immediately
- **AND** first PDF page renders without waiting for image detection
- **AND** image detection API is called after first page is visible

#### Scenario: Image detection does not block PDF loading
- **GIVEN** PDF is loading
- **WHEN** image detection API is slow or fails
- **THEN** PDF loading and rendering is unaffected
- **AND** user can navigate and read PDF normally
- **AND** image overlays appear when detection completes (or not at all on failure)

### Requirement: Progressive PDF Loading
The system SHALL render PDF pages progressively as they become available, rather than waiting for the entire document to load.

#### Scenario: First page renders before full download
- **GIVEN** user opens a PDF file
- **WHEN** PDF metadata and first page data are received
- **THEN** first page renders immediately
- **AND** loading indicator shows for remaining pages
- **AND** remaining pages load in background without blocking UI

#### Scenario: Page navigation during loading
- **GIVEN** PDF is partially loaded (pages 1-10 of 50 available)
- **WHEN** user navigates to page 15 (not yet loaded)
- **THEN** page 15 area shows loading spinner
- **AND** page 15 is prioritized in loading queue
- **AND** page 15 renders as soon as available

#### Scenario: Progress feedback during download
- **GIVEN** PDF download is in progress
- **WHEN** progress data is available
- **THEN** system displays download progress (percentage or bytes)
- **AND** progress updates smoothly without flicker
- **AND** user can estimate remaining wait time

### Requirement: PDF Binary Caching
The system SHALL cache PDF binary data in browser storage for faster subsequent loads.

#### Scenario: Cache PDF after first download
- **GIVEN** user opens a PDF for the first time
- **WHEN** PDF download completes successfully
- **THEN** PDF binary data is stored in IndexedDB
- **AND** cache entry includes fileId, contentHash, timestamp
- **AND** cache does not exceed 500MB total

#### Scenario: Load from cache on repeat visit
- **GIVEN** user previously opened a PDF that is cached
- **AND** cache entry is valid (hash matches, not expired)
- **WHEN** user opens the same PDF again
- **THEN** PDF loads from IndexedDB cache
- **AND** no network request is made for PDF data
- **AND** load time is under 500ms

#### Scenario: Cache invalidation on content change
- **GIVEN** cached PDF with contentHash "abc123"
- **WHEN** API returns different contentHash "def456"
- **THEN** cached version is shown immediately (stale-while-revalidate)
- **AND** new version is downloaded in background
- **AND** cache is updated with new version

#### Scenario: Cache eviction when storage limit reached
- **GIVEN** PDF cache has 490MB of data
- **WHEN** new 50MB PDF is cached
- **THEN** system evicts oldest accessed entries
- **AND** total cache size stays under 500MB
- **AND** most recently accessed PDFs are preserved

#### Scenario: Graceful degradation without IndexedDB
- **GIVEN** IndexedDB is unavailable (private mode, quota exceeded)
- **WHEN** user opens a PDF
- **THEN** PDF loads via network as fallback
- **AND** no error is shown to user
- **AND** warning is logged to console

### Requirement: Signed URL Caching
The system SHALL cache signed download URLs to reduce API calls.

#### Scenario: Cache signed URL on first fetch
- **GIVEN** user opens a PDF file
- **WHEN** API returns signed URL valid for 1 hour
- **THEN** URL is cached in sessionStorage with 50-minute TTL
- **AND** cache key is fileId

#### Scenario: Reuse cached URL within validity period
- **GIVEN** signed URL was cached 30 minutes ago
- **WHEN** user opens the same PDF again
- **THEN** cached URL is used without API call
- **AND** PDF loads normally

#### Scenario: Refresh expired URL
- **GIVEN** signed URL was cached 55 minutes ago (expired)
- **WHEN** user opens the same PDF
- **THEN** new signed URL is fetched from API
- **AND** new URL replaces old cache entry

### Requirement: Lazy Layer Rendering
The system SHALL defer non-essential PDF layers to improve initial render time.

#### Scenario: Canvas renders before text layer
- **GIVEN** user navigates to a PDF page
- **WHEN** page starts rendering
- **THEN** canvas (visual content) renders first
- **AND** text layer renders after 500ms idle
- **AND** user can see page content immediately

#### Scenario: Text selection available after delay
- **GIVEN** page canvas has rendered
- **AND** text layer has not yet rendered
- **WHEN** user attempts to select text
- **THEN** text layer renders immediately
- **AND** selection works once layer is ready

#### Scenario: Annotation layer on interaction
- **GIVEN** page canvas has rendered
- **WHEN** page contains clickable links
- **THEN** annotation layer renders on first mouse move over page
- **AND** links become clickable

### Requirement: Loading Progress UI
The system SHALL display meaningful loading progress to users.

#### Scenario: Show download progress
- **GIVEN** PDF download is in progress
- **WHEN** Content-Length header is available
- **THEN** progress bar shows percentage complete
- **AND** shows "Downloading... X%" text

#### Scenario: Show indeterminate progress
- **GIVEN** PDF download is in progress
- **WHEN** Content-Length header is not available
- **THEN** progress indicator animates without percentage
- **AND** shows "Downloading... X MB" (bytes loaded)

#### Scenario: Show page loading progress
- **GIVEN** PDF metadata is loaded (50 pages total)
- **WHEN** pages are rendering
- **THEN** shows "Loading page X of 50"
- **AND** updates as each page becomes ready

#### Scenario: Cache status indicator
- **GIVEN** PDF is loading from cache
- **WHEN** user opens cached PDF
- **THEN** brief indicator shows "Loading from cache..."
- **AND** indicator disappears within 500ms

### Requirement: Content Hash Verification
The system SHALL use content hashes to verify cache validity.

#### Scenario: Expose hash in file API
- **GIVEN** file was uploaded with content_hash computed
- **WHEN** user requests file details via GET /files/:id
- **THEN** response includes `contentHash` field
- **AND** contentHash is the SHA-256 hash stored in files.content_hash

#### Scenario: Verify hash on cache hit
- **GIVEN** cached PDF with stored contentHash
- **WHEN** user opens the file
- **THEN** API request fetches file metadata
- **AND** client compares cached hash with API response hash
- **AND** uses cache if match, re-fetches if mismatch

#### Scenario: Handle missing hash for legacy files
- **GIVEN** file was uploaded before hash feature (content_hash is null)
- **WHEN** user opens the file
- **THEN** caching is disabled for this file
- **AND** PDF loads via network each time
- **AND** no error occurs during load

### Requirement: Cache Management
The system SHALL provide user controls for managing PDF cache.

#### Scenario: View cache statistics
- **GIVEN** user navigates to Settings page
- **WHEN** cache section is visible
- **THEN** shows total cache size (e.g., "245 MB used")
- **AND** shows number of cached files (e.g., "12 PDFs cached")
- **AND** all text is displayed in user's locale (en/zh)

#### Scenario: Clear all cached PDFs
- **GIVEN** user is on Settings page
- **WHEN** user clicks "Clear PDF Cache" button
- **THEN** confirmation dialog appears (in user's locale)
- **AND** on confirm, all cached PDFs are deleted
- **AND** success toast is shown (in user's locale)
- **AND** cache statistics update to show 0 MB
- **AND** `pdf_cache_cleared` event is broadcast to other tabs

### Requirement: Multi-Tab Cache Synchronization
The system SHALL keep PDF caches consistent across browser tabs using BroadcastChannel API.

#### Scenario: Broadcast cache update to other tabs
- **GIVEN** user has PDF open in Tab A
- **AND** Tab B is also open with the same PDF
- **WHEN** Tab A downloads and caches the PDF
- **THEN** Tab A broadcasts `pdf_cache_updated` event with fileId
- **AND** Tab B receives the event within 100ms
- **AND** Tab B marks its cache status as 'fresh'

#### Scenario: Receive cache invalidation event
- **GIVEN** Tab A has cached PDF with fileId "xyz"
- **WHEN** Tab B broadcasts `pdf_cache_invalidated` for fileId "xyz"
- **THEN** Tab A marks cache for fileId "xyz" as 'stale'
- **AND** Tab A does NOT immediately re-fetch
- **AND** Tab A will revalidate on next access or focus

#### Scenario: Revalidate stale cache on tab focus
- **GIVEN** Tab A has stale cache for current PDF
- **AND** Tab A is in background
- **WHEN** user switches back to Tab A (focus event)
- **THEN** Tab A triggers lightweight revalidation
- **AND** if hash differs, fresh data is fetched
- **AND** loading indicator shown during revalidation

#### Scenario: Clear cache broadcasts to all tabs
- **GIVEN** user has multiple tabs open
- **WHEN** user clears PDF cache in Settings (any tab)
- **THEN** `pdf_cache_cleared` event is broadcast
- **AND** all tabs clear their local cache state
- **AND** all tabs show cache status as empty

#### Scenario: BroadcastChannel unavailable
- **GIVEN** browser does not support BroadcastChannel
- **WHEN** cache operations occur
- **THEN** system logs warning to console
- **AND** caching continues to work within single tab
- **AND** revalidation on tab focus still works (using visibilitychange)

### Requirement: Scroll Mode Caching
The system SHALL cache PDFs identically in both Page mode and Scroll mode.

#### Scenario: Cache behavior in Scroll mode
- **GIVEN** user opens PDF in Scroll (continuous) mode
- **WHEN** PDF is downloaded
- **THEN** entire PDF binary is cached (same as Page mode)
- **AND** cache key is fileId + contentHash (same as Page mode)
- **AND** no mode-specific cache entries are created

#### Scenario: Scroll mode loading prioritization
- **GIVEN** PDF is partially downloaded in Scroll mode
- **AND** pages 1-10 are available, pages 11-50 are loading
- **WHEN** user scrolls to page 30
- **THEN** pages 27-33 (viewport + buffer) are prioritized in loading queue
- **AND** page 30 renders as soon as available
- **AND** other pages continue loading in background

#### Scenario: Switch mode preserves cache
- **GIVEN** user opened PDF in Page mode (PDF is cached)
- **WHEN** user switches to Scroll mode
- **THEN** PDF loads from cache immediately
- **AND** no network request is made
- **AND** all pages are available for scrolling

### Requirement: Loading Messages Internationalization
The system SHALL display loading messages in the user's selected locale.

#### Scenario: Loading messages in English
- **GIVEN** user's UI locale is set to "en"
- **WHEN** PDF is loading
- **THEN** loading messages display in English
- **AND** "Downloading... 45%" format is used
- **AND** "Loading page 5 of 50" format is used

#### Scenario: Loading messages in Chinese
- **GIVEN** user's UI locale is set to "zh"
- **WHEN** PDF is loading
- **THEN** loading messages display in Chinese
- **AND** "下载中... 45%" format is used
- **AND** "正在加载第 5 页，共 50 页" format is used

#### Scenario: Cache status message localized
- **GIVEN** user's UI locale is set to any supported locale
- **WHEN** PDF loads from cache
- **THEN** "Loading from cache..." message displays in user's locale
- **AND** message disappears within 500ms

### Requirement: Account Lifecycle Cache Handling
The system SHALL properly handle local caches during account lifecycle events.

#### Scenario: Clear session cache on logout
- **GIVEN** user is logged in with cached signed URLs in sessionStorage
- **WHEN** user logs out
- **THEN** signed URL cache in sessionStorage is cleared
- **AND** IndexedDB PDF cache is NOT cleared (user-owned data, safe to keep)
- **AND** user can log back in and benefit from cached PDFs

#### Scenario: Clear all caches on account deletion
- **GIVEN** user has PDF data cached in IndexedDB
- **AND** user has signed URLs cached in sessionStorage
- **WHEN** user deletes their account (DELETE /api/account)
- **THEN** IndexedDB PDF cache is completely cleared
- **AND** sessionStorage is completely cleared
- **AND** localStorage preferences are cleared
- **AND** `pdf_cache_cleared` event is broadcast to other tabs
- **AND** all tabs clear their local cache state

#### Scenario: Other tabs respond to account deletion
- **GIVEN** user has multiple tabs open
- **WHEN** user deletes account in one tab
- **THEN** other tabs receive `pdf_cache_cleared` broadcast
- **AND** other tabs clear their IndexedDB cache
- **AND** other tabs are redirected to login page (existing behavior)

### Requirement: Scanned PDF Caching
The system SHALL cache scanned PDFs the same as regular PDFs.

#### Scenario: Scanned PDF is cached normally
- **GIVEN** user opens a scanned PDF (isScanned = true)
- **WHEN** PDF binary is downloaded
- **THEN** PDF is cached in IndexedDB (same as non-scanned)
- **AND** cache key uses fileId + contentHash (same as non-scanned)
- **AND** AI features remain disabled per existing behavior (01_PRD §2.4)
- **AND** user can read the PDF normally

#### Scenario: Scanned PDF loads from cache
- **GIVEN** scanned PDF was previously cached
- **WHEN** user opens the same scanned PDF again
- **THEN** PDF loads from IndexedDB cache
- **AND** load time is under 500ms
- **AND** AI features remain disabled (caching does not affect AI availability)

### Requirement: PDF Load Metrics
The system SHALL record PDF loading performance metrics.

#### Scenario: Record load metrics
- **GIVEN** user opens a PDF file
- **WHEN** PDF loading completes (first page visible)
- **THEN** system records metric to `pdf_load_metrics` table
- **AND** metric includes: fileId, loadTimeMs, firstPageTimeMs, cacheHit

#### Scenario: Cache hit tracking
- **GIVEN** PDF loads from IndexedDB cache
- **WHEN** loading completes
- **THEN** metric.cacheHit is set to true
- **AND** loadTimeMs reflects cache load time (<500ms typical)

---

## MODIFIED Requirements

### Requirement: PDF Document Loading
The system SHALL load PDF documents with optimized performance.

#### Scenario: Initial document load (MODIFIED)
- **GIVEN** user opens a PDF file
- **WHEN** PdfViewer component mounts
- **THEN** system checks cache for existing PDF data
- **AND** if cached and valid, loads from cache
- **AND** if not cached, fetches via signed URL
- **AND** shows progressive loading UI during fetch
- **AND** caches downloaded data for future use

---
