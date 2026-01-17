# Tasks: Fix Mark Mode Detection Flow

## 1. Backend: Point Detection API

- [x] 1.1 Create API endpoint `POST /api/courses/:courseId/files/:fileId/images/detect`
  - Input: `{ page: number, clickX: number, clickY: number }` (normalized 0-1 coordinates)
  - Logic: Download PDF page, run existing image extractor, find image containing click point
  - Output: `{ found: boolean, image?: { rect: NormalizedRect } }`
- [x] 1.2 If image found at click position, save to `detected_images` table with `detection_method='manual'`
- [x] 1.3 Return saved image data for frontend to update overlay

## 2. Frontend: Detection Hook

- [x] 2.1 Add `detectImageAtPosition(page, clickX, clickY)` function in `use-image-detection.ts`
- [x] 2.2 Function calls the detect API and returns result

## 3. Frontend: Fix Mark Mode Click Handler

- [x] 3.1 Modify `handlePageAreaClick` in `pdf-viewer.tsx`:
  - Current: Show popup immediately
  - New: Call `detectImageAtPosition` first
- [x] 3.2 If detection succeeds:
  - Invalidate detected images cache to refresh overlay
  - Show brief success feedback (e.g., flash the detected region)
  - Stay in mark mode for additional marking
- [x] 3.3 If detection fails:
  - Show "No image detected" popup (current behavior)
  - User can click "Draw manually" to enter rectangle mode

## 4. Testing

- [ ] 4.1 Test: Click on missed image → image detected and saved → overlay updates
- [ ] 4.2 Test: Click on empty area → popup appears → draw manually works
- [ ] 4.3 Test: Repeated clicks mark multiple images
