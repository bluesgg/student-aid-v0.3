# Tasks: Add Auto Image Detection

## 0. Setup

- [x] 0.1 Add feature flag `ENABLE_AUTO_IMAGE_DETECTION` (default: false)
- [x] 0.2 Add feature flag check in PDF viewer component

## 1. Core Infrastructure

- [x] 1.1 Create `src/lib/pdf/image-extractor.ts` - Extract image positions from PDF using pdf.js OPS
- [x] 1.2 Create `src/lib/pdf/type-detector.ts` - Detect PDF type (PPT vs textbook) using heuristics (already existed)
- [x] 1.3 Create database migration for `detected_images` table
- [x] 1.4 Add `image_extraction_status` and `image_extraction_progress` columns to files table
- [x] 1.5 Add RLS policies for detected_images table

## 2. Upload-Time Extraction (50-page threshold)

- [x] 2.1 Extend extract API to include image extraction (parallel with context extraction)
- [x] 2.2 Implement 50-page threshold logic:
  - ≤50 pages: extract all, set status to `complete`
  - >50 pages: extract first 50, set status to `partial`
- [x] 2.3 Implement PDF type detection during extraction
- [x] 2.4 Apply type-specific filtering rules (PPT vs textbook)
- [x] 2.5 Store detected images in `detected_images` table with pdf_hash

## 2b. Lazy Extraction (for >50 page PDFs)

- [x] 2b.1 Create lazy extraction endpoint for single page
- [x] 2b.2 Trigger lazy extraction when viewing unextracted page
- [x] 2b.3 Update `image_extraction_progress` after each lazy extraction
- [x] 2b.4 Set status to `complete` when all pages extracted

## 3. API Layer

- [x] 3.1 Create `GET /api/files/[fileId]/images?page=N` - Fetch detected images (trigger lazy extract if needed)
- [x] 3.2 Create `POST /api/files/[fileId]/images/feedback` - Submit detection feedback
- [x] 3.3 Extend shared cache lookup to support image-based keys (by `pdf_hash:page:image_index`)
  - Note: Uses existing selection hash mechanism; same rect from detected_images produces same cache key

## 4. Client Components

- [x] 4.1 Create `useImageDetection` hook for fetching/caching detected images per page
- [x] 4.2 Create `ImageOverlay` component for always-on hover highlights
- [x] 4.3 Create `ImageExtractionStatus` component - progress indicator for large PDFs
- [x] 4.4 Implement click handler: hit-test against detected image rects
- [x] 4.5 Implement click-miss feedback: highlight all detected images for 2 seconds
- [x] 4.6 Add "Add Image" toolbar button for manual rectangle drawing fallback
- [x] 4.7 Add loading state when explanation is being generated
- [x] 4.8 Add loading state when lazy extraction is in progress for current page

## 5. Detection Logic

- [x] 5.1 Implement PDF.js OPS-based image extraction (primary method)
- [x] 5.2 Implement PPT type detection heuristics (text density, layout, slide ratios)
- [x] 5.3 Implement textbook type detection heuristics (multi-column, high text density)
- [x] 5.4 Implement type-specific size/position filtering

## 6. Integration

- [x] 6.1 Update explain-page flow to use detected image boundaries
- [x] 6.2 Ensure page text context is sent with image for explanation
- [x] 6.3 Implement cross-user cache lookup by `pdf_hash:page:image_index`
  - Note: Existing explain-page flow uses pdf_hash + selection_hash for caching
- [x] 6.4 Handle overlapping images (topmost wins on click)

## 7. Testing & Polish

- [ ] 7.1 Test with PPT-converted PDFs (slides, presentations)
- [ ] 7.2 Test with textbook PDFs (academic papers, textbooks)
- [ ] 7.3 Test lazy extraction with >50 page PDFs
- [x] 7.4 Add loading states for image detection during upload
- [x] 7.5 Add error handling for detection failures
- [ ] 7.6 Performance test: ensure extraction adds acceptable latency (<100ms/page)
