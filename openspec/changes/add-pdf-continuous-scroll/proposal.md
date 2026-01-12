# Change: Add PDF Continuous Scroll Mode

## Why

Currently, the P5 page PDF reader only supports page-by-page navigation (previous/next buttons). Users expect a more familiar reading experience with continuous scroll capability, similar to modern PDF viewers like Adobe Acrobat, where multiple pages render vertically and can be scrolled smoothly with mouse wheel or trackpad.

This feature was mentioned in the original product/flow documents but has not yet been implemented. This proposal fills that gap while preserving all existing functionality (sticker highlighting, text selection, AI explanations, image region selection).

## What Changes

### Core Features
- **New reading mode toggle**: Add `Page` (existing) and `Scroll` (new) modes with UI toggle in PDF toolbar
- **Continuous scroll rendering**: In scroll mode, render multiple pages vertically in a scrollable container with proper spacing and styling
- **Current page tracking**: Define and track "current page" in scroll mode as the page with highest visible area in viewport
- **Persistent user preference**: Save selected mode to localStorage and URL state (?mode=scroll|page)
- **Keyboard accessibility**: Mode toggle accessible via Tab/Enter/Space, scroll container supports native browser scroll keys
- **Screen reader support**: ARIA labels and live regions announce mode changes and current page updates

### Integration with Existing Features
- **Page navigation**: Prev/Next buttons in scroll mode will scroll viewport to align with target page top
- **Sticker interaction**: Clicking sticker/reference navigates to target page in both modes
- **Sticker highlighting**: Hover highlighting works in scroll mode for visible pages only
- **AI "Explain this page"**: Uses current page in both modes
- **Last read page**: Updates in scroll mode based on current page with debounce
- **Image region selection**: Fully compatible with scroll mode

### Performance
- **Virtual scrolling**: Use react-window for all scroll mode rendering to ensure consistent performance
- **Zoom handling**: Scale changes update all page heights, reset virtual list metrics, and restore reading position (anchor point preservation)

### Non-Goals (Explicitly Out of Scope)
- Mobile-specific adaptations (existing narrow-screen tab strategy remains)
- Custom keyboard shortcuts (basic keyboard accessibility IS in scope: Tab, Enter/Space, native scroll keys)
- Changes to backend APIs or data models
- Per-document mode memory (global preference applies to all PDFs)
- Print layout optimization (users should export/download PDF for printing)

## Impact

### Affected Specs
- `pdf-viewer-interaction` (MODIFIED) - scroll mode integration with existing features
- New capability needed: `pdf-reader-modes` (ADDED) - core scroll/page mode behavior

### Affected Code
- `src/features/reader/components/pdf-viewer.tsx` - main viewer component
- `src/features/reader/components/pdf-toolbar.tsx` - add mode toggle control
- `src/features/reader/components/virtual-pdf-list.tsx` - enhance for scroll mode
- `src/features/reader/hooks/use-page-navigation.tsx` - adapt for scroll mode
- `src/lib/reader/types.ts` or new file - add ReaderMode type
- localStorage utilities for mode persistence

### Breaking Changes
None. This is purely additive functionality with a fallback default mode.

### Dependencies
- Existing: `react-pdf`, `react-window`, `pdfjs-dist`
- No new dependencies required

## Migration Plan

- Default mode: `page` (conservative approach, preserves current UX)
- Users can opt-in to scroll mode via toggle
- All existing features continue to work identically in page mode
- State persistence priority: URL parameter > localStorage > default `page`
- URL parameter enables shareable reading context (?mode=scroll)
- State persistence is client-side only (no backend changes)
- Graceful degradation: If IntersectionObserver or localStorage unavailable, features degrade to fallback implementations

## Validation

### User Testing
- [ ] Verify smooth scrolling experience with 10, 60, and 150 page PDFs
- [ ] Confirm sticker hover highlighting works correctly in scroll mode
- [ ] Test zoom changes don't break scroll position or layout
- [ ] Validate page navigation (prev/next/jump) in both modes

### Performance Testing
- [ ] Measure frame rate during scroll with 100+ page document
- [ ] Verify virtual scrolling works correctly for all document sizes (10, 50, 150 pages)
- [ ] Check memory usage doesn't spike with large documents
- [ ] Validate zoom anchor preservation doesn't cause layout jank

### Compatibility Testing
- [ ] Chrome/Edge (Windows, Mac)
- [ ] Safari (Mac, trackpad scrolling)
- [ ] Verify no regression in page mode

### Accessibility Testing
- [ ] Keyboard navigation: Tab to mode toggle, Enter/Space to switch
- [ ] Scroll container focusable with native scroll keys (PageUp/Down, arrows, Home/End)
- [ ] Screen reader announces mode changes and current page updates
- [ ] Visible focus indicators on all interactive elements

### Error Handling Testing
- [ ] IntersectionObserver not supported (fallback to scrollTop calculation)
- [ ] localStorage disabled (fallback to in-memory state)
- [ ] URL parameter validation (ignore invalid ?mode values)
