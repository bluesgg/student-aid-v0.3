# Change: Add Auto Image Detection (Click-to-Explain)

## Why

Current image explanation requires users to manually draw rectangles around images, which is:
1. **Tedious** - Requires precise mouse coordination to outline images
2. **Error-prone** - Users may miss image boundaries or include unwanted content
3. **Slow** - Multiple steps: enter selection mode → draw → confirm

Users should be able to simply **click on any image** and get an explanation instantly.

## What Changes

- **NEW**: Auto image extraction on PDF upload (alongside context extraction)
- **NEW**: Click-on-image detection using PDF.js OPS parsing
- **NEW**: Hover highlight always showing detected images (no mode toggle needed)
- **NEW**: Click-miss feedback showing all clickable images
- **NEW**: Cross-user image explanation cache (same PDF file = shared explanations)
- **REMOVED**: Image content hash deduplication within PDF (each image treated independently)
- **NEW**: Feedback collection for incorrect detections
- **NEW**: "Add Image" button for manual rectangle drawing when auto-detection misses
- **REMOVED**: "Image Explain Mode" toggle (hover highlights always on)

## Impact

- **Affected specs**: `pdf-viewer-interaction`
- **Affected code**:
  - `src/lib/pdf/image-extractor.ts` - NEW: Extract image positions from PDF
  - `src/features/reader/hooks/use-image-detection.ts` - NEW: Image detection hook
  - `src/features/reader/components/image-overlay.tsx` - NEW: Hover highlight component
  - `src/features/reader/components/image-extraction-status.tsx` - NEW: Extraction progress indicator
  - `src/features/reader/components/pdf-viewer.tsx` - Simplified click handler
  - `src/features/reader/components/pdf-toolbar.tsx` - "Add Image" button for manual fallback
  - `src/lib/stickers/shared-cache.ts` - Extended for image-based cache lookup
  - `src/app/api/files/[fileId]/images/route.ts` - NEW: Image metadata API (lazy detect on GET if needed)
  - `src/app/api/files/[fileId]/extract/route.ts` - MODIFIED: Include image extraction in upload flow
- **Database**: New table `detected_images` for storing extracted image positions; new column `extraction_status` on files table
- **External**: None (pure client-side detection with manual fallback)

## Non-Goals (This Iteration)

- AI-based decorative image filtering (use size/position heuristics only)
- AI-based image detection fallback (DETR etc.) - use manual rectangle as fallback
- OCR text extraction from images
- Cross-PDF deduplication (only same PDF file shares cache)
- Same-PDF image deduplication (identical images within PDF each get separate explanations)
- User settings for detection sensitivity
- Vector graphics detection (raster images only)
- Auto-generation of explanations on image detection (must be user-triggered)

## Technical Decisions

1. **Primary detection**: PDF.js `getOperatorList()` with `OPS.paintImageXObject`
2. **Detection timing**: Hybrid approach based on PDF size:
   - **≤50 pages**: Extract all pages on upload
   - **>50 pages**: Extract first 50 pages on upload, remaining pages lazily on view
3. **Fallback**: "Add Image" button triggers manual rectangle drawing (no AI fallback)
4. **Deduplication**: None within same PDF (each image generates its own explanation)
5. **Cache scope**: Same PDF file (by binary hash) shares detected images cross-user
6. **Context**: Page text included with image for better AI explanations
7. **Trigger**: All explanations triggered by user action (click image), not auto-generated
8. **Privacy**: Reuses existing `share_to_cache` user preference
9. **PDF type handling**: Different filtering heuristics for PPT-converted vs textbook PDFs
10. **Extraction status UI**: Show progress indicator for large PDFs with lazy extraction
