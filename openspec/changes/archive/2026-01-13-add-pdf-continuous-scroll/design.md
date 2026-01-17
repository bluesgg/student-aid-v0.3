## Context

The current PDF viewer only supports single-page rendering with page-by-page navigation. Users navigate using "Previous" and "Next" buttons, and the viewport shows exactly one page at a time. This matches traditional document readers but differs from modern PDF viewers (Adobe Acrobat, browser PDF viewers) where continuous scrolling is the norm.

The original product documents mentioned "scroll/page mode" as a planned feature, but implementation was deferred. This change brings that feature to completion.

### Constraints
- Must not break existing features: sticker highlighting, image region selection, text selection, AI explanations
- Must maintain performance with large PDFs (100+ pages)
- Frontend-only change (no backend contract modifications)
- Must work with existing virtual scrolling for large documents

### Stakeholders
- End users: Improved reading experience, familiar interaction patterns
- Product: Feature parity with modern PDF viewers
- AI/Sticker system: No changes required, must integrate seamlessly

## Goals / Non-Goals

### Goals
1. Implement continuous scroll mode where multiple pages render vertically
2. Add UI toggle to switch between Page and Scroll modes
3. Define and track "current page" in scroll mode (highest visible area)
4. Preserve all existing functionality in both modes
5. Persist user preference to localStorage
6. Maintain performance with virtual scrolling for large docs

### Non-Goals
- Mobile-specific scroll optimizations (existing responsive behavior sufficient)
- Keyboard shortcuts for mode switching
- Backend API changes
- Advanced zoom anchor preservation (scroll to exact position after zoom)
- Horizontal scroll support
- Continuous scroll for scanned PDFs (not applicable, already restricted)

## Decisions

### Decision 1: Default Mode
**Choice**: Default to `page` mode
**Rationale**:
- Conservative approach, preserves current UX
- Users can opt-in to scroll mode
- Reduces risk of user confusion on initial rollout
- Alternative considered: Default to `scroll` for modern UX, but higher risk

### Decision 2: Current Page Definition in Scroll Mode
**Choice**: Page with highest visible area in viewport
**Rationale**:
- Most semantically correct (user is "reading" the most visible page)
- Works well with AI "Explain this page" feature
- Alternative considered: Topmost page in viewport (simpler but less accurate)
- Implementation: Use IntersectionObserver to calculate visible area per page

### Decision 3: Virtual Scrolling Strategy
**Choice**: Use react-window's VariableSizeList with dynamic height measurement
**Rationale**:
- Already in dependencies (react-window: ^1.8.10)
- Handles variable page heights well
- Mature library with good performance
- Existing VirtualPdfList component can be extended
- Alternative considered: Custom implementation (higher complexity, no benefit)

### Decision 4: Zoom Behavior in Scroll Mode
**Choice**: Anchor point preservation - maintain reading position during zoom
**Rationale**:
- Prevents disorienting jumps when user zooms in/out
- Professional PDF viewer behavior (Adobe Acrobat, browser PDF viewers)
- Implementation complexity is acceptable with offset ratio calculation
- Implementation: Record anchorPage + offsetRatio before zoom, restore after page heights recalculate
- Formula: `offsetRatio = (viewportTop - pageTop) / pageHeight`
- After zoom: `scrollTo(newPageTop + newPageHeight * offsetRatio)`
- Alternative considered: Reset to page top (simpler but worse UX)

### Decision 5: Page Navigation in Scroll Mode
**Choice**: Prev/Next buttons scroll viewport to target page top with small padding
**Rationale**:
- Consistent with user expectation (buttons still functional)
- Smooth scroll provides good UX
- Padding (8-16px) prevents content cut-off at top
- Alternative considered: Disable buttons in scroll mode (poor UX)

### Decision 6: Sticker Click Navigation
**Choice**: In scroll mode, smooth scroll to target page; in page mode, instant page switch
**Rationale**:
- Mode-appropriate behavior
- Scroll mode benefits from smooth scroll (visual continuity)
- Page mode instant switch matches existing behavior
- Implementation: Conditional logic based on current mode

### Decision 7: URL State Management
**Choice**: Support `?mode=scroll|page` URL parameter with priority: URL > localStorage > default
**Rationale**:
- Enables shareable reading context (users can share link with preferred mode)
- URL parameter overrides localStorage (intentional user action)
- Use `history.replaceState()` to sync URL without polluting browser history
- Reduces communication friction when collaborating on documents
- Alternative considered: localStorage only (not shareable)

### Decision 8: Virtual Scrolling Threshold
**Choice**: Always use virtual scrolling in scroll mode, no document size threshold
**Rationale**:
- Eliminates dual implementation complexity (threshold branches create two code paths)
- Even 30-40 page documents can cause performance issues without virtualization
- Consistent behavior across all document sizes (easier testing and maintenance)
- react-window overhead is minimal with overscan=2-3
- Alternative considered: Only virtualize >50 pages (rejected due to complexity and edge cases at threshold)

### Decision 9: Keyboard Accessibility
**Choice**: Support standard keyboard navigation without custom shortcuts
**Rationale**:
- Mode toggle: Tab-focusable, Enter/Space to switch, role="radiogroup"
- Scroll container: tabIndex=0, native browser scroll keys work (PageUp/Down, arrows, Home/End, Space)
- No custom shortcuts needed (reduces cognitive load, no conflicts with browser shortcuts)
- ARIA live region (aria-live="polite") announces current page changes to screen readers
- Meets WCAG 2.1 Level AA requirements
- Alternative considered: Custom shortcuts (rejected, adds complexity and potential conflicts)

### Decision 10: Error Handling & Fallbacks
**Choice**: Graceful degradation with fallback implementations
**Rationale**:
- **IntersectionObserver unavailable**: Fallback to scrollTop calculation for current page
  - Calculate based on scroll position and known page heights
  - Less accurate but functional
- **localStorage unavailable**: Fallback to in-memory state, default to page mode
  - User preference doesn't persist across sessions
  - Console warning logged
- **Invalid URL parameter**: Ignore and fall through to localStorage/default
- Never crash or block core functionality
- Alternative considered: Polyfills (rejected, adds bundle size for rare cases)

## Technical Approach

### Architecture

```
PdfViewer (main component)
├─ State: readerMode ('page' | 'scroll')
├─ Page Mode Rendering
│  └─ Single PdfPage component
└─ Scroll Mode Rendering
   └─ PdfScrollList (enhanced VirtualPdfList)
      ├─ VariableSizeList (react-window)
      ├─ IntersectionObserver (current page tracking)
      └─ Multiple PdfPage components
```

### Data Flow

1. **Mode Toggle**: User clicks toggle → State updates → localStorage saves → Re-render with new mode
2. **Scroll Mode Current Page**: IntersectionObserver fires → Calculate visible area → Update currentPage state → Update lastReadPage (debounced)
3. **Navigation in Scroll**: Click next → Calculate target scroll position → Smooth scroll to position → IntersectionObserver updates currentPage
4. **Sticker Integration**: Click sticker → Get target page → Call scroll/navigation function based on mode

### Type Definitions

```typescript
// src/lib/reader/types.ts
export type ReaderMode = 'page' | 'scroll'

export interface ReaderModePreference {
  mode: ReaderMode
  lastUpdated: number
}

// Layout constants (design tokens)
export const PAGE_GAP_PX = 16
export const PAGE_PADDING_PX = 12
export const CURRENT_PAGE_DEBOUNCE_MS = 300
export const LAST_READ_PAGE_DEBOUNCE_MS = 300
export const OVERSCAN_COUNT = 2
```

### Component Changes

**PdfViewer.tsx**
- Add `readerMode` state with URL + localStorage persistence (URL > localStorage > default)
- Initialize mode from URL searchParams, fallback to localStorage
- Conditional rendering: `{readerMode === 'page' ? <SinglePage /> : <PdfScrollList />}`
- Pass mode-aware navigation functions to children
- Expose `getCurrentPage()` function for AI features
- Sync mode changes to URL via `history.replaceState()`
- Add ARIA live region for current page announcements: `<div aria-live="polite" aria-atomic="true" className="sr-only">Page {currentPage} of {numPages}</div>`

**PdfToolbar.tsx**
- Add mode toggle control (Segmented control with role="radiogroup")
- Display: `[ Page | Scroll ]`
- Position: After zoom controls, before selection mode button
- ARIA structure:
  - Container: `role="radiogroup"` `aria-label="Reading mode"`
  - Each option: `role="radio"` `aria-checked="true|false"` `tabIndex="0|-1"`
- Keyboard: Tab to focus, Arrow keys or Enter/Space to switch

**PdfScrollList.tsx** (enhanced VirtualPdfList)
- Always use VariableSizeList (no threshold check)
- Implement IntersectionObserver for page visibility (with fallback to scrollTop calculation)
- Expose `scrollToPage(pageNumber)` method
- Handle scale changes: store anchor point (page + offsetRatio), reset heights, restore position
- Container: `tabIndex={0}` for keyboard focus, visible focus ring
- Accessibility: Scroll container labeled via `aria-label="PDF pages, use arrow keys to scroll"`

**use-page-navigation.tsx**
- Accept `readerMode` parameter
- Conditional navigation: scroll in scroll mode, setPage in page mode

### Regions & Stickers in Scroll Mode

- **Region Drawing**: Works identically in scroll mode
- **Region Overlay**: Render only for visible pages (performance optimization)
- **Sticker Hover**: Highlight regions on visible pages, ignore non-visible pages
- **Sticker Click**: Scroll to target page if in scroll mode

### Performance Optimizations

1. **Virtual Scrolling**: Always active in scroll mode (no threshold)
2. **Overscan**: ±2 pages (controlled by OVERSCAN_COUNT constant)
3. **Page Height Estimation**: Use A4 ratio (1.414) for unmeasured pages
4. **Debounced Current Page Update**: 300ms debounce (CURRENT_PAGE_DEBOUNCE_MS) to avoid rapid updates during scroll
5. **Conditional Overlay Rendering**: Only render overlays for visible pages (within virtual window)
6. **Zoom Anchor Caching**: Store anchor point before zoom, avoid recalculating during scale change

## Risks / Trade-offs

### Risk 1: Performance degradation with many regions
**Impact**: If user has drawn many image regions across pages, rendering all overlays could be slow
**Mitigation**: Only render overlays for pages within virtual window (already planned)

### Risk 2: IntersectionObserver browser compatibility
**Impact**: Older browsers may not support IntersectionObserver
**Mitigation**:
- IntersectionObserver is well-supported (all modern browsers: Chrome 51+, Safari 12.1+, Edge 15+)
- Fallback implementation: Calculate current page from scrollTop and cumulative page heights
- Graceful degradation: Feature still works, slightly less accurate
- No polyfill needed (keeps bundle size down)

### Risk 3: Zoom causing layout jumps
**Impact**: When user zooms, all page heights change, potentially causing disorienting repositioning
**Mitigation**:
- Store anchor point before zoom: `anchorPage + offsetRatio`
- Reset VariableSizeList with new heights
- Restore scroll position: `scrollTo(newPageTop + newPageHeight * offsetRatio)`
- Uses requestAnimationFrame to ensure heights are measured before scrolling
- Professional PDF viewer behavior (users expect this)

### Risk 4: Complex state management
**Impact**: Two rendering modes increase state complexity and testing surface
**Mitigation**:
- Clear separation in code (conditional rendering at top level)
- Shared utilities where possible
- Comprehensive test coverage for both modes

## Migration Plan

### Phase 1: Implementation (This Change)
1. Add ReaderMode types and state management
2. Implement mode toggle UI
3. Build PdfScrollList with current page tracking
4. Integrate with existing features (stickers, navigation, AI)
5. Add localStorage persistence
6. Test across browsers

### Phase 2: Rollout
1. Deploy with default mode = `page` (conservative)
2. Monitor user feedback and metrics
3. Consider changing default to `scroll` in future iteration

### Phase 3: Future Enhancements (Out of Scope)
1. Advanced zoom anchor preservation
2. Keyboard shortcuts for mode toggle
3. Per-document mode memory (remember mode per PDF)
4. Horizontal scroll support for wide pages

## Print & Export Strategy

### Decision
Do not attempt to print the scroll mode rendered view. Instead, provide explicit path for users:
- Add "Download PDF" or "Open in new tab" button/menu item
- Users print the original PDF in native PDF viewer (browser or system)
- Optional: Hide complex UI elements in print CSS (`@media print`)

### Rationale
- Browser printing of virtualized scroll view is unreliable and hard to control
- Native PDF printing provides better quality and expected behavior
- Reduces implementation complexity and edge cases
- Users familiar with this pattern (e.g., Google Docs "Download as PDF")

## Open Questions

None at this time. All major design decisions have been resolved in consultation with stakeholder.
