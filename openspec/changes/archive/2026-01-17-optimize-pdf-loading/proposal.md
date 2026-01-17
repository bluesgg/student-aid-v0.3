# Proposal: Optimize PDF Loading Performance

## Summary
Optimize the PDF loading experience to reduce perceived and actual load times. Currently, users experience noticeable delays when opening PDFs, especially larger documents.

## Problem Statement
Based on code analysis, the current PDF loading flow has several bottlenecks:

1. **Sequential Loading**: The entire PDF document must be fully loaded before the first page can be displayed
2. **No Browser Caching**: PDF data is re-downloaded on every page visit (signed URLs change)
3. **Signed URL Overhead**: Each file access requires a new API call to get a signed URL
4. **No Progressive Rendering**: Users see a loading spinner until the entire document is ready
5. **Text/Annotation Layers**: Both layers are rendered synchronously, adding to perceived load time
6. **Excessive Debug Logging**: 33+ console.log calls in reader components slow down JS execution and clutter console
7. **Blocking API Calls**: Image detection API fires immediately on page load, competing with PDF download
8. **No React Query Caching**: useFile hook lacks staleTime, causing unnecessary API refetches on re-render

## Current User Experience
- User opens a PDF file
- Sees "Loading..." spinner for several seconds (longer for large PDFs)
- Document appears all at once after full load
- Navigation to another page and back requires re-downloading the PDF

## Proposed Solution
Implement a multi-phase optimization strategy:

### Phase 0: Quick Wins (No Risk)
- **Debug Log Control**: Add `NEXT_PUBLIC_DEBUG_PDF_VIEWER` env var to disable debug logging in production
- **React Query Caching**: Add staleTime (30 minutes) to useFile hook to prevent redundant API calls
- **Deferred Image Detection**: Delay image detection API call until first PDF page is rendered

### Phase 1: Immediate Improvements (Low Risk)
- **Progressive Page Loading**: Display first page as soon as it's ready, load remaining pages in background
- **Loading Progress Indicator**: Show meaningful progress (e.g., "Loading page 1 of 50...")
- **Lazy Layer Rendering**: Defer text and annotation layers until user interacts or page is stable

### Phase 2: Caching Layer (Medium Risk)
- **PDF Data Caching**: Use IndexedDB to cache PDF binary data with content hash key
- **Signed URL Caching**: Cache signed URLs for their validity period (1 hour)
- **Multi-Tab Sync**: Use BroadcastChannel API for cross-tab cache invalidation
- **Prefetch Strategy**: Prefetch PDFs user is likely to open (e.g., recently accessed files)

### Phase 3: Advanced Optimizations (Higher Complexity)
- **Range Request Loading**: Load PDF in chunks, prioritizing visible pages
- **Thumbnail Preview**: Show low-resolution thumbnail while full page loads
- **Service Worker**: Implement SW for offline access and intelligent caching

## Scope
### In Scope
- Debug logging control via environment variable
- React Query staleTime optimization for useFile hook
- Deferred image detection API calls
- Progressive first-page rendering
- Loading progress feedback with i18n support
- Browser-side PDF caching with IndexedDB
- Signed URL caching
- Multi-tab synchronization via BroadcastChannel
- Lazy text/annotation layer rendering
- Scroll mode caching strategy

### Out of Scope (Future Iteration)
- Service Worker implementation
- Offline mode
- PDF pre-generation/processing server-side
- CDN-level caching changes
- Mobile-specific optimizations (storage quota limits)

## Success Metrics
- First Page Visible Time: Reduce by 50%+
- Repeat Visit Load Time: Reduce by 80%+ (cache hit)
- Perceived Load Time: Eliminate "stuck" loading state

## User Stories
**US1: First Page Speed**
As a student, I want to see the first page of my PDF quickly so that I can start reading without waiting for the entire document to load.

**US2: Return Visit Speed**
As a student, when I return to a PDF I recently viewed, I want it to load instantly from cache so I don't waste time re-downloading.

**US3: Loading Feedback**
As a student, I want to see meaningful loading progress so that I know the system is working and approximately how long to wait.

## Technical Approach
See [design.md](./design.md) for detailed technical design.

## Multi-Tab Synchronization Strategy

**Principle**: Database as source of truth + BroadcastChannel invalidation + lightweight revalidate

**Core Approach**:
1. All write operations (create/update/delete) after success:
   - Update current tab's React state
   - Write to IndexedDB (optional)
   - Broadcast event via BroadcastChannel: `pdf_cache_updated`, `stickers_updated`, `lastReadPage_updated`, etc.

2. Other tabs on receiving event:
   - Do NOT attempt to patch diffs (error-prone)
   - Trigger revalidate to fetch latest state (resource-level: stickers / file meta / quotas)
   - Mark corresponding IndexedDB cache as stale

3. On tab focus (`visibilitychange` / `focus`):
   - Perform lightweight revalidate on critical resources
   - Prevents users from seeing stale data when switching back

**Benefits**:
- Multi-tab "perceived inconsistency" virtually eliminated
- No need for server-side real-time push
- IndexedDB remains cache, not authority (database stays the source of truth)

**Applicable Resources**: Sticker list, folded state, version switching, lastReadPage, quota display, PDF binary cache

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| IndexedDB storage limits | Medium | Implement LRU eviction, max 500MB cache |
| Cache invalidation complexity | Medium | Use content hash + file modified timestamp + BroadcastChannel |
| Progressive loading complexity | Low | Use pdfjs-dist built-in progressive loading API |
| Browser compatibility | Low | Graceful fallback to current behavior |
| Multi-tab desync | Medium | BroadcastChannel + revalidate on focus |

## Decision
Pending review.

## Open Questions (Resolved)
1. **PDF file size distribution**: Each page is roughly the same size → can use predictable per-page caching strategy
2. **Performance monitoring**: New `pdf_load_metrics` table (follow existing pattern from `src/lib/metrics/`)
3. **Privacy concerns**: No concerns → can implement full caching
4. **Content hash**: Already exists in `files.content_hash` column → just expose in GET API response

## Next Steps
1. Review and approve this proposal
2. Implement Phase 1 (progressive loading + progress indicator)
3. Implement Phase 2 (caching layer)
4. Measure performance improvements
5. Decide on Phase 3 based on results

## Assumptions
- Users primarily access the same PDFs repeatedly within a session
- Most PDFs are under 50MB
- Browser IndexedDB is available (fallback for when it's not)
- pdfjs-dist supports progressive loading (confirmed in API docs)
