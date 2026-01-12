# Proposal: Add PDF Image Region Selection Mode

## Change ID
`add-pdf-image-region-selection-mode`

## Summary
Enable users to select multiple rectangular regions across PDF pages and generate AI explanations for those specific visual content areas. This feature adds a "Select images" mode to the PDF viewer toolbar, allowing users to draw boxes around diagrams, charts, or formulas, and receive auto-stickers that explain the selected visual content with proper reference context.

## Problem Statement

### Current Limitation
The existing "Explain this page" feature analyzes entire pages (text + all embedded images). Users cannot focus the AI explanation on specific regions of interest such as:
- A particular diagram among several on a page
- A complex formula rendered in the PDF
- A specific chart or graph
- Cross-page visual elements that form a logical sequence

When a page contains multiple visual elements, users get explanations for all content, making it harder to understand individual components in detail.

### Use Cases
1. **Selective explanation**: Student wants to understand only Figure 7 on a page with 5 figures
2. **Cross-page diagrams**: A diagram spanning multiple pages needs unified explanation
3. **Formula focus**: Highlight a specific mathematical expression for detailed breakdown
4. **Iterative learning**: Add/remove regions to refine the explanation scope

## Proposed Solution

### User Experience
1. **Selection Mode**: Toggle "Select images" button in PDF toolbar
2. **Drawing Regions**: Drag to draw rectangular selections (crosshair cursor)
3. **Multi-page Support**: Switch pages while in selection mode, continue adding regions
4. **Immediate Generation**: Each region addition/deletion triggers new explain-page request
5. **Visual Feedback**:
   - Selected regions show colored border + translucent fill
   - Hover sticker → highlights bound regions in PDF
   - Delete button (×) on each region overlay
6. **Root Page Concept**: First page when entering mode becomes "explanation root" for all cross-page selections

### Technical Approach
1. **Frontend (PDF Viewer)**:
   - New selection mode state in toolbar
   - Overlay layer for drawing/rendering rectangles
   - Normalized rect storage (0..1 coordinates)
   - JPEG crop extraction from rendered canvas
   - Multipart form upload with payload + images

2. **Backend (API)**:
   - Extend `POST /api/ai/explain-page` to support `multipart/form-data`
   - New effective_mode: `with_selected_images`
   - Compute `selection_hash` based on geometric identity (page + normalized rects)
   - Reference context derivation: search for label (e.g., "Figure 7") and use surrounding text
   - Multimodal prompt with user-selected image crops + reference text

3. **Data Model**:
   - **Sticker anchor extension**: Support `anchor.anchors[]` with TextAnchor + ImageAnchor types
   - **Shared cache extension**: Add `selection_hash` column to prevent cross-selection collisions
   - **Quota semantics**: Cached hits for `with_selected_images` mode still consume quota

4. **Cache Strategy**:
   - `selection_hash = SHA256({ root_page, effective_mode, locale, sorted_regions })`
   - Cross-user sharing: Same PDF + same region geometry = cache hit
   - Independent of JPEG bytes to maximize hits across devices

## What Changes

### Breaking Changes
None. This is a backward-compatible addition.

### New Features
- **PDF Viewer**:
  - "Select images" toolbar toggle
  - Rectangle drawing and overlay rendering
  - Region delete affordance
  - Sticker hover → region highlight

- **Explain-Page API**:
  - Multipart request support
  - `effectiveMode: 'with_selected_images'`
  - `selectedImageRegions[]` in request payload
  - Image file uploads (JPEG crops)

- **Data Schema**:
  - `Sticker.anchor.anchors: Array<TextAnchor | ImageAnchor>` (backward compatible)
  - `shared_auto_stickers.selection_hash` column
  - New uniqueness indexes for selection vs non-selection rows

### Modified Behavior
- **Quota**: For `with_selected_images` mode, cached hits consume quota (product decision)
- **Scanned PDFs**: Return `FILE_IS_SCANNED` error (not supported in MVP)

## Impact

### Affected Specifications
- **ai-sticker-generation** (MODIFIED):
  - New effective mode
  - Extended anchor data structure
  - Multimodal prompt with selected regions
  - Reference context derivation algorithm
  - Quota behavior for cached hits

- **pdf-viewer-interaction** (NEW):
  - Selection mode and UI controls
  - Region overlay rendering
  - Sticker-region binding and hover highlighting

### Affected Code
- **Frontend**:
  - [src/features/reader/components/pdf-viewer.tsx](../../src/features/reader/components/pdf-viewer.tsx) - Add selection mode
  - [src/features/reader/components/pdf-toolbar.tsx](../../src/features/reader/components/pdf-toolbar.tsx) - Toggle button
  - [src/features/stickers/components/sticker-panel.tsx](../../src/features/stickers/components/sticker-panel.tsx) - Hover highlighting
  - New component: `pdf-region-overlay.tsx`

- **Backend**:
  - [src/app/api/ai/explain-page/route.ts](../../src/app/api/ai/explain-page/route.ts) - Multipart parsing
  - [src/lib/stickers/shared-cache.ts](../../src/lib/stickers/shared-cache.ts) - selection_hash computation
  - [src/lib/openai/prompts/explain-page.ts](../../src/lib/openai/prompts/explain-page.ts) - Multimodal prompt
  - New utility: `src/lib/pdf/reference-context.ts`

- **Database**:
  - Migration: Add `shared_auto_stickers.selection_hash` column + indexes

### Dependencies
- Existing: `react-pdf`, `pdfjs-dist`, `gpt-4o`
- No new external dependencies required

## Non-Goals (MVP)
- Non-rectangular selections (lasso, polygon)
- Per-region progress UI (only global loading state)
- Region resize/move/undo
- Auto-navigation on sticker click across pages
- OCR fallback for scanned PDFs
- User-configurable explain language (uses current locale)

## Risks and Mitigations

### Risk 1: Rapid successive updates (race conditions)
**Mitigation**: Client-side "latest-wins" request versioning; ignore stale responses

### Risk 2: Large multipart uploads
**Mitigation**:
- Max 8 regions per request (validated)
- JPEG quality 0.85
- Resized crops if needed

### Risk 3: Reference context not found
**Mitigation**: Fallback to image page local context if label matching fails

### Risk 4: Cross-device selection_hash stability
**Mitigation**: Hash geometric coordinates (rounded to 4 decimals), not JPEG bytes

## Success Criteria
1. User can draw regions across multiple pages; all overlays persist correctly
2. Each add/delete triggers generation with current selection set
3. Generated sticker binds to all selected regions (visible in anchor data)
4. Hovering sticker highlights all bound regions in viewport
5. Scanned PDFs return proper error
6. Cache hits work across users with identical selections
7. Cached hits for this mode deduct quota

## Rollout Plan
1. **Phase 1 (MVP)**: Basic selection mode with rectangle-only, no undo
2. **Phase 2 (Future)**: Enhanced UX (resize, move, undo, per-region progress)
3. **Phase 3 (Future)**: OCR support for scanned PDFs
