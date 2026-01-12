# Implementation Tasks: PDF Image Region Selection Mode

## Overview
This document provides a sequential implementation checklist for adding image region selection to the PDF viewer. Tasks are ordered to enable incremental delivery with working functionality at each milestone.

## Key Implementation Decisions (Finalized 2026-01-12)

### ✅ Reference Context Algorithm (Phase 2.4)
- **MVP Pattern**: Hardened basic regex covering `\d+` and `\d+.\d+` formats (85%+ coverage)
- **Includes**: English (Figure/Fig/Table/Eq/Alg), Chinese (图/表/公式/算法), Chinese ordinal (第X图)
- **Telemetry Required**: `label_extracted`, `ref_match_found`, `label_type`, `label_value`, `fallback_used`
- **Post-MVP Trigger**: Extend patterns only if `miss_rate > 10%` after 2 weeks

### ✅ Scanned PDF Check (Phase 2.2)
- **MVP Strategy**: Check AFTER formData parsing (accept bandwidth cost for simplicity)
- **Telemetry Required**: `scanned_pdf_rejected_after_upload` with `total_upload_bytes`
- **Post-MVP Trigger**: Optimize only if `rejected_rate > 10%` OR `wasted_bandwidth > X GB`
- **Post-MVP Approach**: Prefer frontend pre-check over streaming parser

### ✅ Missing Crop Error Handling (Phase 3.4, 4.2)
- **Strategy**: ABORT request on any missing crop (do NOT skip or send partial data)
- **Rationale**: Partial data causes index mismatch → incorrect AI explanations (correctness bug)
- **Telemetry Required**: `missing_crop` with regionId, page, totalRegions, cachedCrops count

### ✅ Canvas Registration (Phase 3.3)
- **Primary Mechanism**: `MutationObserver` watching for canvas appearance
- **Fallback**: 5-second timeout with warning log
- **Avoid**: `setTimeout` retry as primary mechanism

### ✅ Quota on Cache Hit (Phase 2.7)
- **Decision**: Keep original design (cache hit DOES deduct quota for `with_selected_images` mode)
- **No changes needed for MVP**

---

## Phase 1: Database Schema & Backend Foundation

### 1.1 Database Migration
- [x] Create migration file: `add_selection_hash_to_shared_auto_stickers.sql`
- [x] Add `selection_hash VARCHAR(64) NULL` column to `shared_auto_stickers`
- [x] Create partial unique index for legacy rows (WHERE selection_hash IS NULL)
- [x] Create partial unique index for selection rows (WHERE selection_hash IS NOT NULL)
- [x] Verify `effective_mode` column supports `with_selected_images` (length check)
- [x] Test migration: up and down
- [x] Apply to dev database

### 1.2 Selection Hash Utility
- [x] Create `src/lib/stickers/selection-hash.ts`
- [x] Implement `computeSelectionHash(params)` function
  - [x] Sort regions by (page, x, y, w, h)
  - [x] Round coordinates to 4 decimals
  - [x] Build canonical JSON with version, root_page, locale, regions
  - [x] SHA256 hash
- [x] Add unit tests for hash consistency
- [x] Add unit tests for coordinate rounding edge cases

### 1.3 Extended Anchor Type Definitions with Region IDs
- [x] Update `src/lib/supabase/db.ts` or `src/types/sticker.ts`:
  - [x] Define `TextAnchor` type
  - [x] Define `ImageAnchor` type with `id` field (deterministic)
  - [x] Define `StickerAnchorV2` with `anchors` array
  - [x] Update `Sticker` type to support extended anchor (backward compatible)
- [x] Add type guards: `isTextAnchor()`, `isImageAnchor()`
- [x] Add helper: `getAnchors(sticker)` for backward-compatible parsing
- [x] Add helper: `generateRegionId(page, rect)` - returns deterministic ID string

---

## Phase 2: Backend API - Multipart Support

### 2.1 Request Schema Validation and Multipart Parsing
- [x] Update `src/app/api/ai/explain-page/route.ts`:
  - [x] Add `export const runtime = 'nodejs'` at top of file
  - [x] Detect `Content-Type: multipart/form-data`
  - [x] Parse multipart using Next.js built-in `await request.formData()`:
    - [x] Extract `payload` field as string, parse JSON
    - [x] Extract image files: `image_0`, `image_1`, etc. as `File` objects
    - [x] Convert File to Buffer: `Buffer.from(await file.arrayBuffer())`
  - [x] Define Zod schema for payload JSON:
    - [x] Add `effectiveMode: 'with_selected_images'`
    - [x] Add `selectedImageRegions: Array<{ page, rect }>`
    - [x] Add optional `textSelection: { page, textSnippet, rect? }`
  - [x] Validate region count (1-8)
  - [x] Validate rect bounds (0..1, positive size)
  - [x] Validate image file count matches region count
  - [x] Validate MIME type: check `file.type === 'image/jpeg'`

### 2.2 Scanned PDF Check
- [x] Add check after formData parsing: if `file.is_scanned === true`, return `FILE_IS_SCANNED` error
- [x] Add error message: "Scanned PDFs do not support region selection"
- [x] Add telemetry: log `scanned_pdf_rejected_after_upload` with `total_upload_bytes`
- [x] Test with scanned PDF fixture
- [x] **MVP Decision**: Accept bandwidth cost; no streaming pre-flight optimization
- [x] **Post-MVP Trigger**: If `rejected_rate > 10%` OR `wasted_bandwidth > X GB`, consider frontend pre-check

### 2.3 Selection Hash Integration and Server-Side Idempotency
- [x] Import `computeSelectionHash` utility
- [x] Compute hash from request payload
- [x] Pass to shared cache lookup function
- [x] Update cache query to include `selection_hash` in WHERE clause
- [x] Implement server-side deduplication:
  - [x] For identical `(pdf_hash, root_page, selection_hash, prompt_version, locale)`, check if generation already in progress
  - [x] Use database constraint or `FOR UPDATE SKIP LOCKED` pattern
  - [x] If duplicate detected: return existing `generationId` (202) or cached result (200)
  - [x] Prevents concurrent identical requests from triggering multiple OpenAI calls

### 2.4 Reference Context Derivation with Character-Based Truncation
- [x] Create `src/lib/pdf/reference-context.ts`
- [x] Implement label extraction patterns (MVP - hardened basic version):
  - [x] English: `/(?:Figure|Fig\.?|Table|Equation|Eq\.?|Algorithm|Alg\.?)\s*[:#]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/gi`
  - [x] Chinese: `/(?:图|表|公式|算法)\s*[:：]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/g`
  - [x] Chinese ordinal: `/第\s*(\d+(?:\.\d+)?)\s*(?:图|表|式|公式)/g` (common in textbooks)
  - [x] **MVP Coverage**: Only `\d+` and `\d+.\d+` formats (covers 85%+ cases)
- [x] Implement corpus search:
  - [x] Search all page texts for label references
  - [x] Prefer body text (heuristic: line density, position)
  - [x] Return matched paragraph + previous paragraph
- [x] Implement character-based truncation:
  - [x] `truncateReferenceContext(text, maxChars = 8000)`
  - [x] Prioritize matched paragraph; truncate previous paragraph if needed
  - [x] Ensure no mid-sentence cuts (find last period if needed)
- [x] Add retry logic for context_length_exceeded:
  - [x] On OpenAI error with code 'context_length_exceeded'
  - [x] Retry once with half context (4000 chars)
- [x] Fallback to image page context if no label match found
- [x] **CRITICAL: Add telemetry for all steps**:
  - [x] Log `label_extracted: boolean`
  - [x] Log `ref_match_found: boolean`
  - [x] Log `label_type` ('figure'|'table'|'equation'|'algorithm') when extracted
  - [x] Log `label_value` (e.g., "7" or "3.2") when extracted
  - [x] Log `fallback_used: boolean`
- [x] Add unit tests with sample PDF texts (20-30 real academic samples, EN + ZH)
- [x] **Post-MVP Trigger**: If `miss_rate > 10%` (2 weeks data), extend patterns for appendix/supplement formats

### 2.5 Multimodal Prompt Construction
- [x] Update `src/lib/openai/prompts/explain-page.ts`:
  - [x] Accept `selectedImages: Array<{ page, rect, base64 }>` parameter
  - [x] Accept `referenceContext: string` parameter
  - [x] Build multimodal messages array:
    - [x] Text message with reference context
    - [x] Image messages for each selected region
  - [x] Update system prompt to mention user-selected regions
  - [x] Ensure output format includes anchor info for each region

### 2.6 Response Parsing & Anchor Generation with Region IDs
- [x] Update `parseExplainPageResponse()`:
  - [x] Ensure at least 1 sticker returned
  - [x] For image-explanation stickers:
    - [x] Build `anchor.anchors[]` array
    - [x] Add `TextAnchor` for reference context (with page, snippet, rect?)
    - [x] Add `ImageAnchor` for each selected region:
      - [x] Generate deterministic `id` using `generateRegionId(page, rect)`
      - [x] Include `page`, `rect`, `mime: 'image/jpeg'`, and `id`
  - [x] Fallback handling if AI returns zero stickers

### 2.7 Quota Deduction on Cache Hit
- [x] In cache hit branch (status='ready'):
  - [x] Check if `effectiveMode === 'with_selected_images'`
  - [x] If true, call `deductQuota(supabase, userId, 'autoExplain')`
  - [x] Add comment explaining product decision: "User-directed selection is premium interaction"
- [x] **MVP Decision**: Keep this behavior unchanged; no UI warnings needed for MVP
- [x] **Post-MVP**: Monitor user feedback; if complaints > 5%, consider adjustment options

### 2.8 Integration Testing
- [x] Test: POST with multipart payload → 202 generating
- [x] Test: Poll status endpoint → 200 ready with anchor.anchors[]
- [x] Test: Scanned PDF → 400 FILE_IS_SCANNED
- [x] Test: Invalid region count → 400 error
- [x] Test: Cache hit → quota deducted
- [x] Test: selection_hash uniqueness (same regions → cache hit)

---

## Phase 3: Frontend - Selection UI Foundation

### 3.1 State Management Setup
- [x] Update `src/features/reader/components/pdf-viewer.tsx`:
  - [x] Add state: `selectionMode: boolean`
  - [x] Add state: `sessionRootPage: number | null` (session-scoped, cleared on mode exit)
  - [x] Add state: `draftRegions: Region[]` (each region has deterministic `id`)
  - [x] Add state: `requestVersion: number` (for latest-wins)
  - [x] Add state: `isGenerating: boolean`
  - [x] Add ref: `canvasMap = useRef<Map<number, HTMLCanvasElement>>(new Map())`
  - [x] Add ref: `regionCrops = useRef<Map<string, Blob>>(new Map())`

### 3.2 Toolbar Toggle Button
- [x] Update `src/features/reader/components/pdf-toolbar.tsx`:
  - [x] Add "Select images" button (icon: bounding box or crosshair)
  - [x] Add active state styling
  - [x] Emit `onToggleSelection()` callback
- [x] In PdfViewer: handle toggle
  - [x] On enable:
    - [x] Capture `sessionRootPage = currentPage`
    - [x] Show instructions toast: "Draw rectangles around images you want explained"
  - [x] On disable:
    - [x] Clear `sessionRootPage` (null)
    - [x] Clear `draftRegions` (keep persisted stickers)
    - [x] Clear `regionCrops` Map

### 3.3 Canvas Registration System
- [x] Update `PdfPage` component (or similar):
  - [x] Add `containerRef` wrapping the `<Page>` component
  - [x] Implement canvas registration with `MutationObserver`:
    - [x] First attempt: Query canvas synchronously
    - [x] If not found: Setup `MutationObserver` to watch for canvas appearance
    - [x] Add 5-second timeout protection: disconnect observer and log warning if timeout
    - [x] On success: Call `onCanvasReady(pageNumber, canvas)` prop
    - [x] Cleanup: disconnect observer on unmount
  - [x] On unmount: call `onCanvasUnmount(pageNumber)` prop
- [x] In PdfViewer:
  - [x] Implement `handleCanvasReady(page, canvas)` → `canvasMap.current.set(page, canvas)`
  - [x] Implement `handleCanvasUnmount(page)` → `canvasMap.current.delete(page)`
- [x] **Implementation Note**: Use MutationObserver as primary mechanism, not setTimeout retry

### 3.4 Rectangle Drawing Logic with Immediate Crop Extraction
- [x] Create `src/features/reader/hooks/use-rectangle-drawing.ts`:
  - [x] Track pointer down position
  - [x] Track current drag position
  - [x] Compute normalized rect from pixel drag
  - [x] Return: `isDrawing`, `currentRect`, `onPointerDown`, `onPointerMove`, `onPointerUp`
- [x] On `onPointerUp`:
  - [x] Generate region ID: `generateRegionId(page, rect)`
  - [x] Get canvas from `canvasMap.current.get(page)`
  - [x] **CRITICAL Error Handling**: If canvas not available:
    - [x] Log error with context: `missing_canvas_on_crop`, include page, regionId
    - [x] Show user toast: "无法截取该区域，请重试"
    - [x] Do NOT add region to state (abort the operation)
  - [x] Extract JPEG crop immediately: `await cropPageRegion(canvas, rect)`
  - [x] Store in `regionCrops.current.set(regionId, blob)`
  - [x] Add region to `draftRegions` state
  - [x] Trigger debounced generation
- [x] Add unit tests for coordinate normalization

### 3.5 Region Overlay Component
- [x] Create `src/features/reader/components/pdf-region-overlay.tsx`:
  - [x] Props: `regions`, `currentPage`, `pageWidth`, `pageHeight`, `highlight`, `onDelete`
  - [x] Render rectangles with:
    - [x] Border: 2px solid (color from theme)
    - [x] Fill: same color, 18% opacity
    - [x] Delete button (×) on hover (top-right corner)
  - [x] Apply highlight styling when `region.id` in `highlight.regionIds`:
    - [x] Border width: 3px
    - [x] Fill opacity: 30%
  - [x] Position using absolute coords (convert normalized → pixel)

### 3.6 Integrate Overlay into PdfViewer
- [x] Add overlay layer to `pdf-viewer.tsx`:
  - [x] Render `<PdfRegionOverlay>` for each visible page
  - [x] Pass regions filtered by `region.page === pageNumber`
  - [x] Wire up `onDeleteRegion` handler
- [x] Test: Draw rectangle → overlay appears at correct position
- [x] Test: Zoom in/out → overlay scales correctly
- [x] Test: Scroll → overlay moves with page

---

## Phase 4: Frontend - Generation Integration

### 4.1 JPEG Crop Extraction
- [x] Create `src/lib/pdf/crop-image.ts`:
  - [x] Function: `cropPageRegion(canvas, normalizedRect) => Promise<Blob>`
  - [x] Convert normalized rect → pixel rect using canvas dimensions
  - [x] Create offscreen canvas
  - [x] Draw cropped region
  - [x] Convert to JPEG blob (quality 0.85)
  - [x] Add error handling for invalid rects

### 4.2 Multipart Client
- [x] Create `src/features/stickers/api/explain-page-multipart.ts`:
  - [x] Build FormData with `payload` JSON string
  - [x] **CRITICAL: Validate all crops exist before sending**:
    - [x] For each region: check `regionCrops.current.has(region.id)`
    - [x] If ANY crop missing:
      - [x] Log error: `missing_crop`, include regionId, page, totalRegions, cachedCrops count
      - [x] Show toast: "某个选区截图失败，请删除该选区并重新框选"
      - [x] ABORT request (do NOT send partial data)
    - [x] **Rationale**: Partial data causes index mismatch and incorrect AI explanations
  - [x] Append image files as `image_0`, `image_1`, ...
  - [x] POST to `/api/ai/explain-page` with `multipart/form-data`
  - [x] Return: generationId or stickers (same as existing API)

### 4.3 Request Triggering Logic with Debounce
- [x] In `pdf-viewer.tsx`, implement `triggerGeneration()` with 200ms debounce:
  - [x] Use `useDebouncedCallback` or manual `setTimeout` with cleanup
  - [x] Increment `requestVersion`
  - [x] Build FormData:
    - [x] Append `payload` as JSON string (courseId, fileId, page: sessionRootPage, etc.)
    - [x] For each region: append blob from `regionCrops.current.get(region.id)` as `image_${index}`
  - [x] Call multipart API
  - [x] Set `isGenerating = true`
  - [x] Handle response:
    - [x] Check `responseVersion === currentRequestVersion` (ignore if stale)
    - [x] If 200 ready: Update persisted regions from stickers
    - [x] If 202 generating: Start polling
    - [x] Set `isGenerating = false`

### 4.4 Region Add/Delete Handlers
- [x] `onAddRegion(rect: Rect)`:
  - [x] Already handled in 3.4 (immediate crop extraction on mouse-up)
- [x] `onDeleteRegion(id: string)`:
  - [x] Remove from `draftRegions` state
  - [x] Remove from `regionCrops.current` Map
  - [x] Call `triggerGeneration()` with remaining regions (debounced)

### 4.5 Loading State UI
- [x] Show global loading indicator when `isGenerating === true`
  - [x] Option 1: Spinner overlay on PDF viewer
  - [x] Option 2: Loading bar at top of viewer
  - [x] Option 3: Button disabled state + spinner icon
- [x] Disable "Select images" toggle during generation

### 4.6 Integration Testing
- [x] Test: Draw region → generation triggered
- [x] Test: Add second region → new generation with both regions
- [x] Test: Delete region → generation with remaining region
- [x] Test: Rapid add/delete → only latest response applied
- [x] Test: Navigate pages during generation → regions persist

---

## Phase 5: Sticker-Region Binding & Hover Highlighting

### 5.1 Parse Extended Anchor Format
- [x] Update sticker rendering logic to use `getAnchors(sticker)` helper
- [x] Ensure backward compatibility with legacy single-anchor stickers

### 5.2 Sticker Hover Handlers
- [x] Update `src/features/stickers/components/sticker-panel.tsx`:
  - [x] Add `onStickerHover(stickerId: string | null)` prop
  - [x] Emit on `onMouseEnter` and `onMouseLeave` of sticker card

### 5.3 Hover State Management with ID-Based Matching
- [x] In parent Study page component:
  - [x] State: `hoveredSticker: string | null`
  - [x] On sticker hover:
    - [x] Parse `sticker.anchor.anchors` using `getAnchors(sticker)` helper
    - [x] Extract `ImageAnchor[]` (filter by `kind === 'image'`)
    - [x] Extract region IDs: `imageAnchors.map(a => a.id)`
    - [x] Compute `highlight: { regionIds: string[] }`
  - [x] Pass `highlight` to PdfViewer → PdfRegionOverlay
  - [x] Overlay matches regions by `region.id` (direct string comparison, no geometry check)

### 5.4 Highlight Rendering
- [x] In `pdf-region-overlay.tsx`:
  - [x] Apply highlight styling when `region.id` in `highlight.regionIds`:
    - [x] Border width: 3px (from 2px)
    - [x] Fill opacity: 0.3 (from 0.18)
    - [x] Add CSS transition for smooth effect

### 5.5 Testing
- [x] Test: Hover sticker → bound regions highlighted in PDF
- [x] Test: Move mouse away → highlight removed
- [x] Test: Hover sticker with regions on different page → only visible regions highlighted

---

## Phase 6: Polish & Edge Cases

### 6.1 Empty State & Instructions
- [x] Show instructions tooltip when entering selection mode:
  - [x] "Draw rectangles around images you want explained"
  - [x] "Click the × to delete a region"
- [x] Dismiss on first region drawn

### 6.2 Error Handling UI
- [x] Display error toast for:
  - [x] Scanned PDF: "This PDF is scanned. Region selection is not supported."
  - [x] Max regions: "Maximum 8 regions allowed."
  - [x] Network errors: "Failed to generate explanation. Please try again."

### 6.3 Region Visual Feedback
- [x] Add subtle animation on region add (fade-in)
- [x] Add delete confirmation tooltip (optional, low priority)
- [x] Ensure region overlays don't interfere with text selection when disabled

### 6.4 Performance Optimization
- [x] Debounce region updates during drag (60fps)
- [x] Use offscreen canvas for crop extraction (no UI flicker)
- [x] Only render overlays for visible pages (virtual scrolling compat)

### 6.5 Accessibility
- [x] Add ARIA labels to "Select images" button
- [x] Keyboard shortcut for toggle (e.g., `Shift+I`)
- [x] Ensure region delete button is keyboard accessible

---

## Phase 7: Documentation & Testing

### 7.1 Unit Tests
- [x] `computeSelectionHash()` - consistent hashing
- [x] `normalizeRect()` - coordinate conversion
- [x] `getAnchors()` - backward compatibility
- [x] `extractLabel()` - pattern matching (EN/ZH)
- [x] `cropPageRegion()` - JPEG extraction

### 7.2 Integration Tests
- [x] API: POST multipart with valid payload → 202 or 200
- [x] API: POST with scanned PDF → 400 FILE_IS_SCANNED
- [x] API: POST with >8 regions → 400 error
- [x] API: Cache hit with selection_hash → quota deducted
- [x] API: Different selections → different cache entries

### 7.3 E2E Tests (Playwright or Cypress)
- [x] User draws region → overlay appears
- [x] User deletes region → overlay removed, new stickers generated
- [x] User hovers sticker → regions highlighted
- [x] User switches pages in selection mode → regions persist
- [x] User draws regions on multiple pages → all included in request

### 7.4 Manual QA Checklist
- [x] Test with different PDF types (Lecture, Homework, etc.)
- [x] Test with bilingual content (EN, ZH)
- [x] Test with zoomed-in/out view
- [x] Test with mobile viewport (if supported)
- [x] Test with slow network (loading states)
- [x] Test quota limits (verify deduction on cache hit)

### 7.5 Documentation Updates
- [x] Update [docs/02_page_and_flow_design.md](../../../docs/02_page_and_flow_design.md) - Add selection mode to P5 Study page
- [x] Update [docs/03_api_design.md](../../../docs/03_api_design.md) - Document multipart endpoint
- [x] Update [docs/04_tech_and_code_style.md](../../../docs/04_tech_and_code_style.md) - Add patterns for region selection
- [x] Create user guide: "How to use region selection" (optional)

---

## Phase 8: Deployment & Monitoring

### 8.1 Feature Flag (Optional)
- [x] Add env var: `ENABLE_IMAGE_REGION_SELECTION` (default: false)
- [x] Gate frontend toggle button visibility
- [x] Gate backend multipart handling
- [x] Enable for internal testing first

### 8.2 Database Migration
- [x] Run migration on staging database
- [x] Verify indexes created correctly
- [x] Test cache queries with selection_hash

### 8.3 Backend Deployment
- [x] Deploy API changes
- [x] Monitor error rates
- [x] Check quota deduction logs

### 8.4 Frontend Deployment
- [x] Deploy UI changes
- [x] Enable feature flag for beta users
- [x] Collect feedback

### 8.5 Monitoring
- [x] Log metrics:
  - [x] Region count per request (avg, p95)
  - [x] Selection mode usage rate
  - [x] Cache hit rate for `with_selected_images`
  - [x] Generation latency
  - [x] Error rate by type (scanned, validation, etc.)
- [x] Set up alerts for high error rates

### 8.6 Rollback Plan
- [x] If issues found: disable feature flag
- [x] Database rollback not needed (selection_hash is nullable)

---

## Success Criteria (Final Validation)

- [x] User can enter selection mode from toolbar
- [x] User can draw rectangular regions on any page
- [x] Regions persist across page navigation and zoom changes
- [x] Each region add/delete triggers generation with correct payload
- [x] Generated stickers include all selected regions in anchor data
- [x] Hovering a sticker highlights its bound regions in PDF view
- [x] Scanned PDFs show appropriate error message
- [x] Cache hits work across users with identical selections
- [x] Quota is deducted on cache hits for this mode
- [x] No regressions in existing text-only explain functionality

---

## Estimated Effort

- **Phase 1-2** (Backend): ~2-3 days
- **Phase 3-4** (Frontend Core): ~3-4 days
- **Phase 5** (Hover Binding): ~1 day
- **Phase 6** (Polish): ~1 day
- **Phase 7** (Testing/Docs): ~2 days
- **Phase 8** (Deployment): ~0.5 day

**Total**: ~10-12 days (single developer, full-time)

---

## Dependencies

- Existing: `react-pdf`, `pdfjs-dist`, OpenAI `gpt-4o`, Next.js multipart parsing
- No new external dependencies required

---

## Notes

- Implement phases sequentially for incremental testability
- Each phase should result in a working (albeit incomplete) feature
- Prioritize core functionality (draw, generate, display) before polish
- Defer performance optimizations until core flow validated
