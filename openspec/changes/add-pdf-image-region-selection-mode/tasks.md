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
- [ ] Create migration file: `add_selection_hash_to_shared_auto_stickers.sql`
- [ ] Add `selection_hash VARCHAR(64) NULL` column to `shared_auto_stickers`
- [ ] Create partial unique index for legacy rows (WHERE selection_hash IS NULL)
- [ ] Create partial unique index for selection rows (WHERE selection_hash IS NOT NULL)
- [ ] Verify `effective_mode` column supports `with_selected_images` (length check)
- [ ] Test migration: up and down
- [ ] Apply to dev database

### 1.2 Selection Hash Utility
- [ ] Create `src/lib/stickers/selection-hash.ts`
- [ ] Implement `computeSelectionHash(params)` function
  - [ ] Sort regions by (page, x, y, w, h)
  - [ ] Round coordinates to 4 decimals
  - [ ] Build canonical JSON with version, root_page, locale, regions
  - [ ] SHA256 hash
- [ ] Add unit tests for hash consistency
- [ ] Add unit tests for coordinate rounding edge cases

### 1.3 Extended Anchor Type Definitions with Region IDs
- [ ] Update `src/lib/supabase/db.ts` or `src/types/sticker.ts`:
  - [ ] Define `TextAnchor` type
  - [ ] Define `ImageAnchor` type with `id` field (deterministic)
  - [ ] Define `StickerAnchorV2` with `anchors` array
  - [ ] Update `Sticker` type to support extended anchor (backward compatible)
- [ ] Add type guards: `isTextAnchor()`, `isImageAnchor()`
- [ ] Add helper: `getAnchors(sticker)` for backward-compatible parsing
- [ ] Add helper: `generateRegionId(page, rect)` - returns deterministic ID string

---

## Phase 2: Backend API - Multipart Support

### 2.1 Request Schema Validation and Multipart Parsing
- [ ] Update `src/app/api/ai/explain-page/route.ts`:
  - [ ] Add `export const runtime = 'nodejs'` at top of file
  - [ ] Detect `Content-Type: multipart/form-data`
  - [ ] Parse multipart using Next.js built-in `await request.formData()`:
    - [ ] Extract `payload` field as string, parse JSON
    - [ ] Extract image files: `image_0`, `image_1`, etc. as `File` objects
    - [ ] Convert File to Buffer: `Buffer.from(await file.arrayBuffer())`
  - [ ] Define Zod schema for payload JSON:
    - [ ] Add `effectiveMode: 'with_selected_images'`
    - [ ] Add `selectedImageRegions: Array<{ page, rect }>`
    - [ ] Add optional `textSelection: { page, textSnippet, rect? }`
  - [ ] Validate region count (1-8)
  - [ ] Validate rect bounds (0..1, positive size)
  - [ ] Validate image file count matches region count
  - [ ] Validate MIME type: check `file.type === 'image/jpeg'`

### 2.2 Scanned PDF Check
- [ ] Add check after formData parsing: if `file.is_scanned === true`, return `FILE_IS_SCANNED` error
- [ ] Add error message: "Scanned PDFs do not support region selection"
- [ ] Add telemetry: log `scanned_pdf_rejected_after_upload` with `total_upload_bytes`
- [ ] Test with scanned PDF fixture
- [ ] **MVP Decision**: Accept bandwidth cost; no streaming pre-flight optimization
- [ ] **Post-MVP Trigger**: If `rejected_rate > 10%` OR `wasted_bandwidth > X GB`, consider frontend pre-check

### 2.3 Selection Hash Integration and Server-Side Idempotency
- [ ] Import `computeSelectionHash` utility
- [ ] Compute hash from request payload
- [ ] Pass to shared cache lookup function
- [ ] Update cache query to include `selection_hash` in WHERE clause
- [ ] Implement server-side deduplication:
  - [ ] For identical `(pdf_hash, root_page, selection_hash, prompt_version, locale)`, check if generation already in progress
  - [ ] Use database constraint or `FOR UPDATE SKIP LOCKED` pattern
  - [ ] If duplicate detected: return existing `generationId` (202) or cached result (200)
  - [ ] Prevents concurrent identical requests from triggering multiple OpenAI calls

### 2.4 Reference Context Derivation with Character-Based Truncation
- [ ] Create `src/lib/pdf/reference-context.ts`
- [ ] Implement label extraction patterns (MVP - hardened basic version):
  - [ ] English: `/(?:Figure|Fig\.?|Table|Equation|Eq\.?|Algorithm|Alg\.?)\s*[:#]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/gi`
  - [ ] Chinese: `/(?:图|表|公式|算法)\s*[:：]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/g`
  - [ ] Chinese ordinal: `/第\s*(\d+(?:\.\d+)?)\s*(?:图|表|式|公式)/g` (common in textbooks)
  - [ ] **MVP Coverage**: Only `\d+` and `\d+.\d+` formats (covers 85%+ cases)
- [ ] Implement corpus search:
  - [ ] Search all page texts for label references
  - [ ] Prefer body text (heuristic: line density, position)
  - [ ] Return matched paragraph + previous paragraph
- [ ] Implement character-based truncation:
  - [ ] `truncateReferenceContext(text, maxChars = 8000)`
  - [ ] Prioritize matched paragraph; truncate previous paragraph if needed
  - [ ] Ensure no mid-sentence cuts (find last period if needed)
- [ ] Add retry logic for context_length_exceeded:
  - [ ] On OpenAI error with code 'context_length_exceeded'
  - [ ] Retry once with half context (4000 chars)
- [ ] Fallback to image page context if no label match found
- [ ] **CRITICAL: Add telemetry for all steps**:
  - [ ] Log `label_extracted: boolean`
  - [ ] Log `ref_match_found: boolean`
  - [ ] Log `label_type` ('figure'|'table'|'equation'|'algorithm') when extracted
  - [ ] Log `label_value` (e.g., "7" or "3.2") when extracted
  - [ ] Log `fallback_used: boolean`
- [ ] Add unit tests with sample PDF texts (20-30 real academic samples, EN + ZH)
- [ ] **Post-MVP Trigger**: If `miss_rate > 10%` (2 weeks data), extend patterns for appendix/supplement formats

### 2.5 Multimodal Prompt Construction
- [ ] Update `src/lib/openai/prompts/explain-page.ts`:
  - [ ] Accept `selectedImages: Array<{ page, rect, base64 }>` parameter
  - [ ] Accept `referenceContext: string` parameter
  - [ ] Build multimodal messages array:
    - [ ] Text message with reference context
    - [ ] Image messages for each selected region
  - [ ] Update system prompt to mention user-selected regions
  - [ ] Ensure output format includes anchor info for each region

### 2.6 Response Parsing & Anchor Generation with Region IDs
- [ ] Update `parseExplainPageResponse()`:
  - [ ] Ensure at least 1 sticker returned
  - [ ] For image-explanation stickers:
    - [ ] Build `anchor.anchors[]` array
    - [ ] Add `TextAnchor` for reference context (with page, snippet, rect?)
    - [ ] Add `ImageAnchor` for each selected region:
      - [ ] Generate deterministic `id` using `generateRegionId(page, rect)`
      - [ ] Include `page`, `rect`, `mime: 'image/jpeg'`, and `id`
  - [ ] Fallback handling if AI returns zero stickers

### 2.7 Quota Deduction on Cache Hit
- [ ] In cache hit branch (status='ready'):
  - [ ] Check if `effectiveMode === 'with_selected_images'`
  - [ ] If true, call `deductQuota(supabase, userId, 'autoExplain')`
  - [ ] Add comment explaining product decision: "User-directed selection is premium interaction"
- [ ] **MVP Decision**: Keep this behavior unchanged; no UI warnings needed for MVP
- [ ] **Post-MVP**: Monitor user feedback; if complaints > 5%, consider adjustment options

### 2.8 Integration Testing
- [ ] Test: POST with multipart payload → 202 generating
- [ ] Test: Poll status endpoint → 200 ready with anchor.anchors[]
- [ ] Test: Scanned PDF → 400 FILE_IS_SCANNED
- [ ] Test: Invalid region count → 400 error
- [ ] Test: Cache hit → quota deducted
- [ ] Test: selection_hash uniqueness (same regions → cache hit)

---

## Phase 3: Frontend - Selection UI Foundation

### 3.1 State Management Setup
- [ ] Update `src/features/reader/components/pdf-viewer.tsx`:
  - [ ] Add state: `selectionMode: boolean`
  - [ ] Add state: `sessionRootPage: number | null` (session-scoped, cleared on mode exit)
  - [ ] Add state: `draftRegions: Region[]` (each region has deterministic `id`)
  - [ ] Add state: `requestVersion: number` (for latest-wins)
  - [ ] Add state: `isGenerating: boolean`
  - [ ] Add ref: `canvasMap = useRef<Map<number, HTMLCanvasElement>>(new Map())`
  - [ ] Add ref: `regionCrops = useRef<Map<string, Blob>>(new Map())`

### 3.2 Toolbar Toggle Button
- [ ] Update `src/features/reader/components/pdf-toolbar.tsx`:
  - [ ] Add "Select images" button (icon: bounding box or crosshair)
  - [ ] Add active state styling
  - [ ] Emit `onToggleSelection()` callback
- [ ] In PdfViewer: handle toggle
  - [ ] On enable:
    - [ ] Capture `sessionRootPage = currentPage`
    - [ ] Show instructions toast: "Draw rectangles around images you want explained"
  - [ ] On disable:
    - [ ] Clear `sessionRootPage` (null)
    - [ ] Clear `draftRegions` (keep persisted stickers)
    - [ ] Clear `regionCrops` Map

### 3.3 Canvas Registration System
- [ ] Update `PdfPage` component (or similar):
  - [ ] Add `containerRef` wrapping the `<Page>` component
  - [ ] Implement canvas registration with `MutationObserver`:
    - [ ] First attempt: Query canvas synchronously
    - [ ] If not found: Setup `MutationObserver` to watch for canvas appearance
    - [ ] Add 5-second timeout protection: disconnect observer and log warning if timeout
    - [ ] On success: Call `onCanvasReady(pageNumber, canvas)` prop
    - [ ] Cleanup: disconnect observer on unmount
  - [ ] On unmount: call `onCanvasUnmount(pageNumber)` prop
- [ ] In PdfViewer:
  - [ ] Implement `handleCanvasReady(page, canvas)` → `canvasMap.current.set(page, canvas)`
  - [ ] Implement `handleCanvasUnmount(page)` → `canvasMap.current.delete(page)`
- [ ] **Implementation Note**: Use MutationObserver as primary mechanism, not setTimeout retry

### 3.4 Rectangle Drawing Logic with Immediate Crop Extraction
- [ ] Create `src/features/reader/hooks/use-rectangle-drawing.ts`:
  - [ ] Track pointer down position
  - [ ] Track current drag position
  - [ ] Compute normalized rect from pixel drag
  - [ ] Return: `isDrawing`, `currentRect`, `onPointerDown`, `onPointerMove`, `onPointerUp`
- [ ] On `onPointerUp`:
  - [ ] Generate region ID: `generateRegionId(page, rect)`
  - [ ] Get canvas from `canvasMap.current.get(page)`
  - [ ] **CRITICAL Error Handling**: If canvas not available:
    - [ ] Log error with context: `missing_canvas_on_crop`, include page, regionId
    - [ ] Show user toast: "无法截取该区域，请重试"
    - [ ] Do NOT add region to state (abort the operation)
  - [ ] Extract JPEG crop immediately: `await cropPageRegion(canvas, rect)`
  - [ ] Store in `regionCrops.current.set(regionId, blob)`
  - [ ] Add region to `draftRegions` state
  - [ ] Trigger debounced generation
- [ ] Add unit tests for coordinate normalization

### 3.5 Region Overlay Component
- [ ] Create `src/features/reader/components/pdf-region-overlay.tsx`:
  - [ ] Props: `regions`, `currentPage`, `pageWidth`, `pageHeight`, `highlight`, `onDelete`
  - [ ] Render rectangles with:
    - [ ] Border: 2px solid (color from theme)
    - [ ] Fill: same color, 18% opacity
    - [ ] Delete button (×) on hover (top-right corner)
  - [ ] Apply highlight styling when `region.id` in `highlight.regionIds`:
    - [ ] Border width: 3px
    - [ ] Fill opacity: 30%
  - [ ] Position using absolute coords (convert normalized → pixel)

### 3.6 Integrate Overlay into PdfViewer
- [ ] Add overlay layer to `pdf-viewer.tsx`:
  - [ ] Render `<PdfRegionOverlay>` for each visible page
  - [ ] Pass regions filtered by `region.page === pageNumber`
  - [ ] Wire up `onDeleteRegion` handler
- [ ] Test: Draw rectangle → overlay appears at correct position
- [ ] Test: Zoom in/out → overlay scales correctly
- [ ] Test: Scroll → overlay moves with page

---

## Phase 4: Frontend - Generation Integration

### 4.1 JPEG Crop Extraction
- [ ] Create `src/lib/pdf/crop-image.ts`:
  - [ ] Function: `cropPageRegion(canvas, normalizedRect) => Promise<Blob>`
  - [ ] Convert normalized rect → pixel rect using canvas dimensions
  - [ ] Create offscreen canvas
  - [ ] Draw cropped region
  - [ ] Convert to JPEG blob (quality 0.85)
  - [ ] Add error handling for invalid rects

### 4.2 Multipart Client
- [ ] Create `src/features/stickers/api/explain-page-multipart.ts`:
  - [ ] Build FormData with `payload` JSON string
  - [ ] **CRITICAL: Validate all crops exist before sending**:
    - [ ] For each region: check `regionCrops.current.has(region.id)`
    - [ ] If ANY crop missing:
      - [ ] Log error: `missing_crop`, include regionId, page, totalRegions, cachedCrops count
      - [ ] Show toast: "某个选区截图失败，请删除该选区并重新框选"
      - [ ] ABORT request (do NOT send partial data)
    - [ ] **Rationale**: Partial data causes index mismatch and incorrect AI explanations
  - [ ] Append image files as `image_0`, `image_1`, ...
  - [ ] POST to `/api/ai/explain-page` with `multipart/form-data`
  - [ ] Return: generationId or stickers (same as existing API)

### 4.3 Request Triggering Logic with Debounce
- [ ] In `pdf-viewer.tsx`, implement `triggerGeneration()` with 200ms debounce:
  - [ ] Use `useDebouncedCallback` or manual `setTimeout` with cleanup
  - [ ] Increment `requestVersion`
  - [ ] Build FormData:
    - [ ] Append `payload` as JSON string (courseId, fileId, page: sessionRootPage, etc.)
    - [ ] For each region: append blob from `regionCrops.current.get(region.id)` as `image_${index}`
  - [ ] Call multipart API
  - [ ] Set `isGenerating = true`
  - [ ] Handle response:
    - [ ] Check `responseVersion === currentRequestVersion` (ignore if stale)
    - [ ] If 200 ready: Update persisted regions from stickers
    - [ ] If 202 generating: Start polling
    - [ ] Set `isGenerating = false`

### 4.4 Region Add/Delete Handlers
- [ ] `onAddRegion(rect: Rect)`:
  - [ ] Already handled in 3.4 (immediate crop extraction on mouse-up)
- [ ] `onDeleteRegion(id: string)`:
  - [ ] Remove from `draftRegions` state
  - [ ] Remove from `regionCrops.current` Map
  - [ ] Call `triggerGeneration()` with remaining regions (debounced)

### 4.5 Loading State UI
- [ ] Show global loading indicator when `isGenerating === true`
  - [ ] Option 1: Spinner overlay on PDF viewer
  - [ ] Option 2: Loading bar at top of viewer
  - [ ] Option 3: Button disabled state + spinner icon
- [ ] Disable "Select images" toggle during generation

### 4.6 Integration Testing
- [ ] Test: Draw region → generation triggered
- [ ] Test: Add second region → new generation with both regions
- [ ] Test: Delete region → generation with remaining region
- [ ] Test: Rapid add/delete → only latest response applied
- [ ] Test: Navigate pages during generation → regions persist

---

## Phase 5: Sticker-Region Binding & Hover Highlighting

### 5.1 Parse Extended Anchor Format
- [ ] Update sticker rendering logic to use `getAnchors(sticker)` helper
- [ ] Ensure backward compatibility with legacy single-anchor stickers

### 5.2 Sticker Hover Handlers
- [ ] Update `src/features/stickers/components/sticker-panel.tsx`:
  - [ ] Add `onStickerHover(stickerId: string | null)` prop
  - [ ] Emit on `onMouseEnter` and `onMouseLeave` of sticker card

### 5.3 Hover State Management with ID-Based Matching
- [ ] In parent Study page component:
  - [ ] State: `hoveredSticker: string | null`
  - [ ] On sticker hover:
    - [ ] Parse `sticker.anchor.anchors` using `getAnchors(sticker)` helper
    - [ ] Extract `ImageAnchor[]` (filter by `kind === 'image'`)
    - [ ] Extract region IDs: `imageAnchors.map(a => a.id)`
    - [ ] Compute `highlight: { regionIds: string[] }`
  - [ ] Pass `highlight` to PdfViewer → PdfRegionOverlay
  - [ ] Overlay matches regions by `region.id` (direct string comparison, no geometry check)

### 5.4 Highlight Rendering
- [ ] In `pdf-region-overlay.tsx`:
  - [ ] Apply highlight styling when `region.id` in `highlight.regionIds`:
    - [ ] Border width: 3px (from 2px)
    - [ ] Fill opacity: 0.3 (from 0.18)
    - [ ] Add CSS transition for smooth effect

### 5.5 Testing
- [ ] Test: Hover sticker → bound regions highlighted in PDF
- [ ] Test: Move mouse away → highlight removed
- [ ] Test: Hover sticker with regions on different page → only visible regions highlighted

---

## Phase 6: Polish & Edge Cases

### 6.1 Empty State & Instructions
- [ ] Show instructions tooltip when entering selection mode:
  - [ ] "Draw rectangles around images you want explained"
  - [ ] "Click the × to delete a region"
- [ ] Dismiss on first region drawn

### 6.2 Error Handling UI
- [ ] Display error toast for:
  - [ ] Scanned PDF: "This PDF is scanned. Region selection is not supported."
  - [ ] Max regions: "Maximum 8 regions allowed."
  - [ ] Network errors: "Failed to generate explanation. Please try again."

### 6.3 Region Visual Feedback
- [ ] Add subtle animation on region add (fade-in)
- [ ] Add delete confirmation tooltip (optional, low priority)
- [ ] Ensure region overlays don't interfere with text selection when disabled

### 6.4 Performance Optimization
- [ ] Debounce region updates during drag (60fps)
- [ ] Use offscreen canvas for crop extraction (no UI flicker)
- [ ] Only render overlays for visible pages (virtual scrolling compat)

### 6.5 Accessibility
- [ ] Add ARIA labels to "Select images" button
- [ ] Keyboard shortcut for toggle (e.g., `Shift+I`)
- [ ] Ensure region delete button is keyboard accessible

---

## Phase 7: Documentation & Testing

### 7.1 Unit Tests
- [ ] `computeSelectionHash()` - consistent hashing
- [ ] `normalizeRect()` - coordinate conversion
- [ ] `getAnchors()` - backward compatibility
- [ ] `extractLabel()` - pattern matching (EN/ZH)
- [ ] `cropPageRegion()` - JPEG extraction

### 7.2 Integration Tests
- [ ] API: POST multipart with valid payload → 202 or 200
- [ ] API: POST with scanned PDF → 400 FILE_IS_SCANNED
- [ ] API: POST with >8 regions → 400 error
- [ ] API: Cache hit with selection_hash → quota deducted
- [ ] API: Different selections → different cache entries

### 7.3 E2E Tests (Playwright or Cypress)
- [ ] User draws region → overlay appears
- [ ] User deletes region → overlay removed, new stickers generated
- [ ] User hovers sticker → regions highlighted
- [ ] User switches pages in selection mode → regions persist
- [ ] User draws regions on multiple pages → all included in request

### 7.4 Manual QA Checklist
- [ ] Test with different PDF types (Lecture, Homework, etc.)
- [ ] Test with bilingual content (EN, ZH)
- [ ] Test with zoomed-in/out view
- [ ] Test with mobile viewport (if supported)
- [ ] Test with slow network (loading states)
- [ ] Test quota limits (verify deduction on cache hit)

### 7.5 Documentation Updates
- [ ] Update [docs/02_page_and_flow_design.md](../../../docs/02_page_and_flow_design.md) - Add selection mode to P5 Study page
- [ ] Update [docs/03_api_design.md](../../../docs/03_api_design.md) - Document multipart endpoint
- [ ] Update [docs/04_tech_and_code_style.md](../../../docs/04_tech_and_code_style.md) - Add patterns for region selection
- [ ] Create user guide: "How to use region selection" (optional)

---

## Phase 8: Deployment & Monitoring

### 8.1 Feature Flag (Optional)
- [ ] Add env var: `ENABLE_IMAGE_REGION_SELECTION` (default: false)
- [ ] Gate frontend toggle button visibility
- [ ] Gate backend multipart handling
- [ ] Enable for internal testing first

### 8.2 Database Migration
- [ ] Run migration on staging database
- [ ] Verify indexes created correctly
- [ ] Test cache queries with selection_hash

### 8.3 Backend Deployment
- [ ] Deploy API changes
- [ ] Monitor error rates
- [ ] Check quota deduction logs

### 8.4 Frontend Deployment
- [ ] Deploy UI changes
- [ ] Enable feature flag for beta users
- [ ] Collect feedback

### 8.5 Monitoring
- [ ] Log metrics:
  - [ ] Region count per request (avg, p95)
  - [ ] Selection mode usage rate
  - [ ] Cache hit rate for `with_selected_images`
  - [ ] Generation latency
  - [ ] Error rate by type (scanned, validation, etc.)
- [ ] Set up alerts for high error rates

### 8.6 Rollback Plan
- [ ] If issues found: disable feature flag
- [ ] Database rollback not needed (selection_hash is nullable)

---

## Success Criteria (Final Validation)

- [ ] User can enter selection mode from toolbar
- [ ] User can draw rectangular regions on any page
- [ ] Regions persist across page navigation and zoom changes
- [ ] Each region add/delete triggers generation with correct payload
- [ ] Generated stickers include all selected regions in anchor data
- [ ] Hovering a sticker highlights its bound regions in PDF view
- [ ] Scanned PDFs show appropriate error message
- [ ] Cache hits work across users with identical selections
- [ ] Quota is deducted on cache hits for this mode
- [ ] No regressions in existing text-only explain functionality

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
