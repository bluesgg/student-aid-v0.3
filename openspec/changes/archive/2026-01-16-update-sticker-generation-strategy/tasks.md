# Tasks: Update Sticker Generation Strategy

## 1. Data Model Updates
- [x] 1.1 Locate existing `Anchor` type definition (in `src/features/stickers/api.ts`) and add `isFullPage?: boolean` field
- [x] 1.2 Update response formatting in API routes to include `isFullPage`
- [x] 1.3 ~~Add database migration~~ - Not needed: anchor is stored as JSONB, new optional fields are automatically supported

## 2. Backend: Sticker Generation Logic
- [x] 2.1 Modified `ppt-pdf-generator.ts` to store full-page anchor with `isFullPage: true`
- [x] 2.2 For PPT-type: stickers now include full-page anchor (`{x:0, y:0, width:1, height:1}`) with `isFullPage: true`
- [x] 2.3 Updated `explain-page` route response formatting to extract and return `isFullPage` from anchor_rect
- [x] 2.4 For text-type: existing logic unchanged (paragraph-aligned anchors without `isFullPage`)
- [x] 2.5 Updated `formatStickers` function to include `rect` and `isFullPage` in response

## 3. Frontend: Hover Highlighting Infrastructure
- [x] 3.1 Created `HoverHighlightProvider` context in `src/features/stickers/context/hover-highlight-context.tsx`
- [x] 3.2 Added `hoveredStickerId`, `setHoveredStickerId` state in context
- [x] 3.3 Added `hoveredPdfRegion`, `hoveredStickerRect`, `hoveredStickerPage` state for PDF region tracking
- [x] 3.4 Created `useHoverHighlight` hook to access context

## 4. Frontend: Sticker Card Hover → PDF Highlight
- [x] 4.1 Added `onMouseEnter`/`onMouseLeave` handlers in `StickerPanel` that use context
- [x] 4.2 Pass hovered sticker anchor coordinates via context to PDF viewer
- [x] 4.3 Created `StickerAnchorHighlight` component to render highlight overlay on PDF page
- [x] 4.4 Applied styling: `border: 2px solid #3B82F6` + `background: rgba(59,130,246,0.1)`

## 5. Frontend: PDF Region Hover → Sticker Highlight
- [x] 5.1 Added `matchingStickers` state in context for reverse highlighting
- [x] 5.2 Added `highlighted` prop to `StickerCard` component
- [x] 5.3 Updated `StickerCard` to show highlight styling when `highlighted` is true
- [x] 5.4 Applied highlight styling: `border: 2px solid #3B82F6` + `background: rgba(59,130,246,0.05)`
- [x] 5.5 Implement mouse position tracking on PDF to detect hover over sticker anchor regions

## 6. Frontend: PPT-Type Sticker UI
- [x] 6.1 Skip hover highlighting for full-page stickers (`anchor.isFullPage === true`) in `handleStickerMouseEnter`
- [x] 6.2 Add visual indicator for "Full Page Explanation" in sticker card

## 7. Testing
- [x] 7.1 Unit tests for anchor type changes (created `src/features/stickers/__tests__/anchor-types.test.ts`)
- [x] 7.2 Integration tests for PPT vs text-type sticker generation (updated `src/lib/auto-explain/__tests__/ppt-pdf-generator.test.ts`)
- [x] 7.3 E2E tests for hover highlighting behavior (created `tests/e2e/hover-highlighting.spec.ts`)
- [x] 7.4 Unit tests for hover highlight context (created `src/features/stickers/context/__tests__/hover-highlight-context.test.tsx`)

## 8. Documentation
- [x] 8.1 Update `01_light_prd.md` - sticker mechanism description (already covered in §2.3)
- [x] 8.2 Update `02_page_and_flow_design.md` - generation strategy table and hover spec (already covered in §A.5)
- [x] 8.3 Update `03_api_design.md` - anchor data model (already includes `isFullPage` in §3.0.1)
- [x] 8.4 Update `04_tech_and_code_style.md` - quota config (already includes PPT/text config in §8)

---

## Implementation Notes

### Files Changed:
1. `src/features/stickers/api.ts` - Added `isFullPage?: boolean` to Sticker anchor type
2. `src/lib/auto-explain/ppt-pdf-generator.ts` - Updated to store full-page anchor with `isFullPage: true`
3. `src/app/api/ai/explain-page/route.ts` - Updated sticker response formatting to include `isFullPage`
4. `src/features/stickers/context/hover-highlight-context.tsx` - New file: hover highlight context
5. `src/features/stickers/context/index.ts` - New file: context exports
6. `src/features/stickers/components/sticker-panel.tsx` - Added hover context integration
7. `src/features/stickers/components/sticker-card.tsx` - Added `highlighted` prop and styling
8. `src/features/reader/components/sticker-anchor-highlight.tsx` - New file: PDF highlight overlay
9. `src/features/reader/components/pdf-viewer.tsx` - Added hover context integration and highlight rendering
10. `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx` - Added `HoverHighlightProvider` wrapper

### Test Files Created:
11. `src/features/stickers/__tests__/anchor-types.test.ts` - Unit tests for anchor type with isFullPage
12. `src/features/stickers/context/__tests__/hover-highlight-context.test.tsx` - Unit tests for hover context
13. `tests/e2e/hover-highlighting.spec.ts` - E2E tests for hover highlighting behavior

### Bidirectional Hover Flow:
1. **Sticker → PDF**: User hovers sticker card → context stores sticker's anchor rect → PDF viewer renders highlight overlay
2. **PDF → Sticker**: User hovers over PDF region → `usePdfStickerHitTest` hook detects sticker anchors → context's `matchingStickers` updates → Sticker cards use `highlighted` prop

### Additional Files Added (Task 5.5 & 6.2):
14. `src/features/reader/hooks/use-pdf-sticker-hit-test.ts` - New hook for PDF → Sticker hit testing

### Vitest Configuration Update:
- Added `esbuild: { jsx: 'automatic', jsxImportSource: 'react' }` to `vitest.config.ts` for proper JSX transformation in tests
