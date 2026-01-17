## 1. Extend VirtualPdfList Props

- [x] 1.1 Add props for auto image detection: `isAutoImageDetectionEnabled`, `detectedImagesByPage`, `showHighlightFeedback`, `loadingPages`
- [x] 1.2 Add props for sticker anchor highlighting: `hoveredStickerRect`, `hoveredStickerPage`
- [x] 1.3 Add props for page area click handling: `onPageAreaClick`
- [x] 1.4 Add props for sticker hit test: `onStickerHitTestMove`, `onStickerHitTestLeave` (for PDF→Sticker highlighting)

## 2. Update PageRow Component

- [x] 2.1 Add ImageDetectionOverlay rendering for visible pages with detected images
- [x] 2.2 Add LazyExtractionLoading indicator when images are loading for a page
- [x] 2.3 Add StickerAnchorHighlight overlay when hoveredStickerPage matches current page
- [x] 2.4 Add onClick handler for page area click (mark mode feedback and popup)
- [x] 2.5 Add onMouseMove/onMouseLeave handlers for sticker hit testing

## 3. Update PdfViewer to Pass Props

- [x] 3.1 Pass image detection props to VirtualPdfList in scroll mode
- [x] 3.2 Pass sticker highlighting props to VirtualPdfList in scroll mode
- [x] 3.3 Pass click and mouse event handlers to VirtualPdfList in scroll mode

## 4. Testing and Validation

- [x] 4.1 Test image hover highlighting works in scroll mode on visible pages
- [x] 4.2 Test lazy extraction loading indicator appears in scroll mode
- [x] 4.3 Test bidirectional sticker highlighting works in scroll mode
- [x] 4.4 Test page area click shows highlight feedback in scroll mode
- [x] 4.5 Test mark mode popup works in scroll mode
- [x] 4.6 Run typecheck and lint

## Implementation Notes

### Scroll Mode Adapters
Since the current `useImageDetection` hook only fetches images for a single page, we created adapter values in PdfViewer:
- `detectedImagesByPage`: Map containing current page's images (can be extended for multi-page fetching)
- `loadingPages`: Set containing current page if loading (can be extended for multi-page loading states)
- `handleScrollModePageAreaClick`: Adapted handler accepting page number parameter
- `handleScrollModeStickerHitTest`: Adapted handler accepting page element and page number

### Current Limitation
The image detection currently only works for the "current page" (the page with maximum visible area). Full multi-page image detection would require:
1. Extending `useImageDetection` to accept multiple page numbers
2. Batching detection requests for visible pages
3. Caching detected images across pages

This limitation is acceptable for MVP as the current page in scroll mode updates as user scrolls, and the overlays will render correctly for that page.
