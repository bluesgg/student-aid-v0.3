# Change: Add Scroll Mode Feature Parity

## Why

The design documentation (02_page_and_flow_design.md section 5.2) specifies that "贴纸交互/AI功能两种模式通用" (sticker interactions and AI features should work in both modes). Currently, scroll mode is missing several features that are available in page mode, creating an inconsistent user experience.

## What Changes

1. **Add ImageDetectionOverlay to scroll mode** - Display auto-detected image regions with hover highlights on each visible page
2. **Add LazyExtractionLoading to scroll mode** - Show "Detecting images..." indicator when images are being loaded for a page
3. **Add StickerAnchorHighlight to scroll mode** - Enable bidirectional hover highlighting (Sticker→PDF direction)
4. **Add handlePageAreaClick to scroll mode** - Support click feedback showing all detected images and mark mode popup
5. **Add handleStickerHitTest to scroll mode** - Enable bidirectional hover highlighting (PDF→Sticker direction)

## Impact

- Affected specs: `pdf-viewer-interaction`
- Affected code:
  - `src/features/reader/components/virtual-pdf-list.tsx` - Add new props and overlay rendering
  - `src/features/reader/components/pdf-viewer.tsx` - Pass additional props to VirtualPdfList
