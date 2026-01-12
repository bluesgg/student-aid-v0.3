## 1. Foundation & Types
- [ ] 1.1 Create `src/lib/reader/types.ts` with ReaderMode type definition
- [ ] 1.2 Add layout constants (PAGE_GAP_PX, PAGE_PADDING_PX, DEBOUNCE_MS, OVERSCAN_COUNT)
- [ ] 1.3 Add localStorage utility functions for mode persistence (get/set with try/catch)
- [ ] 1.4 Add URL state utility functions (getInitialMode, syncModeToURL)
- [ ] 1.5 Write unit tests for localStorage utilities (including fallback when unavailable)
- [ ] 1.6 Write unit tests for URL state utilities

## 2. Core Scroll Mode Rendering
- [ ] 2.1 Enhance VirtualPdfList to always use VariableSizeList (no threshold logic)
- [ ] 2.2 Implement page height measurement and caching
- [ ] 2.3 Add dynamic height estimation for unmeasured pages (A4 ratio fallback)
- [ ] 2.4 Handle scale changes - store anchor point, reset list heights, restore position
- [ ] 2.5 Add styling for page gaps (use PAGE_GAP_PX constant) and background
- [ ] 2.6 Add tabIndex={0} and aria-label to scroll container for keyboard accessibility

## 3. Current Page Tracking
- [ ] 3.1 Implement IntersectionObserver setup for page visibility tracking
- [ ] 3.2 Add fallback implementation using scrollTop calculation if IntersectionObserver unavailable
- [ ] 3.3 Calculate visible area for each observed page
- [ ] 3.4 Determine current page (highest visible area wins)
- [ ] 3.5 Add debounce for current page updates (use CURRENT_PAGE_DEBOUNCE_MS constant)
- [ ] 3.6 Expose getCurrentPage() method from scroll list component

## 4. Mode Toggle UI
- [ ] 4.1 Add mode toggle control to PdfToolbar (Segmented control: Page | Scroll)
- [ ] 4.2 Implement ARIA structure: role="radiogroup", each option role="radio" with aria-checked
- [ ] 4.3 Add keyboard navigation: Tab to focus, Enter/Space to switch, Arrow keys for radio
- [ ] 4.4 Add visible focus ring for keyboard users
- [ ] 4.5 Update toolbar layout to accommodate new control
- [ ] 4.6 Add visual feedback for active mode
- [ ] 4.7 Position toggle between zoom controls and selection mode button

## 5. PdfViewer Integration
- [ ] 5.1 Add readerMode state to PdfViewer component
- [ ] 5.2 Initialize mode with priority: URL > localStorage > default 'page'
- [ ] 5.3 Implement conditional rendering (page mode vs scroll mode)
- [ ] 5.4 Sync mode changes to both localStorage and URL (history.replaceState)
- [ ] 5.5 Add ARIA live region for current page announcements (aria-live="polite")
- [ ] 5.6 Ensure currentPage state works correctly in both modes
- [ ] 5.7 Handle URL parameter validation (ignore invalid ?mode values)

## 6. Navigation Integration
- [ ] 6.1 Update use-page-navigation hook to accept readerMode parameter
- [ ] 6.2 Implement scrollToPage() function for scroll mode
- [ ] 6.3 Add smooth scroll behavior with padding (use PAGE_PADDING_PX constant)
- [ ] 6.4 Ensure Prev/Next buttons work correctly in scroll mode
- [ ] 6.5 Ensure Prev/Next buttons keyboard accessible (Tab + Enter/Space)
- [ ] 6.6 Ensure page number input jump works in scroll mode

## 7. Sticker & Region Integration
- [ ] 7.1 Update sticker click handler to use mode-aware navigation
- [ ] 7.2 Ensure region overlays render only for visible pages in scroll mode
- [ ] 7.3 Verify hover highlighting works in scroll mode
- [ ] 7.4 Test image region selection works in scroll mode
- [ ] 7.5 Confirm region deletion and regeneration work in scroll mode

## 8. AI Features Integration
- [ ] 8.1 Update "Explain this page" to use getCurrentPage() in scroll mode
- [ ] 8.2 Ensure text selection and manual sticker creation work in scroll mode
- [ ] 8.3 Verify AI explanations appear correctly for scroll mode

## 9. Last Read Page Integration
- [ ] 9.1 Update use-last-read-page hook for scroll mode compatibility
- [ ] 9.2 Implement debounced lastReadPage updates (use LAST_READ_PAGE_DEBOUNCE_MS constant)
- [ ] 9.3 Ensure page restoration on reload works in both modes
- [ ] 9.4 Test lastReadPage updates correctly during scrolling

## 10. Zoom & Scale Handling
- [ ] 10.1 Detect scale changes in scroll mode
- [ ] 10.2 Before zoom: Store anchor point (anchorPage + offsetRatio = (viewportTop - pageTop) / pageHeight)
- [ ] 10.3 Recalculate all page heights on scale change
- [ ] 10.4 Reset VariableSizeList with new metrics
- [ ] 10.5 After zoom: Restore position using requestAnimationFrame (scrollTo(pageTop + pageHeight * offsetRatio))
- [ ] 10.6 Add fallback: If anchor restoration fails, fallback to scrollToPage(anchorPage)
- [ ] 10.7 Test zoom in/out maintains reading position without disorienting jumps

## 11. Performance & Virtual Scrolling
- [ ] 11.1 Verify virtual scrolling works for all document sizes (10, 50, 150 pages)
- [ ] 11.2 Confirm overscan setting (use OVERSCAN_COUNT constant) is respected
- [ ] 11.3 Test scroll performance with 100+ page document (maintain 60fps)
- [ ] 11.4 Profile memory usage with large documents
- [ ] 11.5 Optimize region overlay rendering (visible pages only)
- [ ] 11.6 Test IntersectionObserver fallback (disable API, verify scrollTop calculation works)

## 12. Testing & Validation
- [ ] 12.1 Write unit tests for ReaderMode type and utilities
- [ ] 12.2 Write unit tests for URL state management (including invalid params)
- [ ] 12.3 Write integration tests for mode switching
- [ ] 12.4 Add E2E test for scroll mode navigation
- [ ] 12.5 Add E2E test for sticker interaction in scroll mode
- [ ] 12.6 Add E2E test for keyboard navigation (Tab, Enter/Space, PageUp/Down)
- [ ] 12.7 Test with sample PDFs: 10 pages, 60 pages, 150 pages
- [ ] 12.8 Test error handling: localStorage disabled, IntersectionObserver unavailable
- [ ] 12.9 Test ARIA live region announcements with screen reader

## 13. Browser Compatibility
- [ ] 13.1 Test in Chrome (Windows and Mac)
- [ ] 13.2 Test in Safari (Mac, verify trackpad scrolling and keyboard navigation)
- [ ] 13.3 Test in Edge (Windows)
- [ ] 13.4 Verify IntersectionObserver works in target browsers (Chrome 51+, Safari 12.1+, Edge 15+)
- [ ] 13.5 Test fallback behavior in browsers without IntersectionObserver (if any)
- [ ] 13.6 Test keyboard navigation across all browsers (PageUp/Down, arrows, Home/End)

## 14. UX Polish
- [ ] 14.1 Add smooth scroll animations for page navigation
- [ ] 14.2 Ensure page gaps use consistent spacing (PAGE_GAP_PX constant)
- [ ] 14.3 Add visible focus rings for all interactive elements (mode toggle, scroll container)
- [ ] 14.4 Verify loading states display correctly in scroll mode
- [ ] 14.5 Test error states in scroll mode
- [ ] 14.6 Ensure mode preference persists across sessions (localStorage + URL)
- [ ] 14.7 Test screen reader experience with NVDA/VoiceOver

## 15. Documentation
- [ ] 15.1 Add code comments for complex logic (IntersectionObserver, height calculation, zoom anchor)
- [ ] 15.2 Update component documentation (PdfViewer, PdfScrollList, PdfToolbar)
- [ ] 15.3 Document localStorage keys and URL parameters (?mode=scroll|page)
- [ ] 15.4 Add JSDoc for exported functions and types
- [ ] 15.5 Document accessibility features (ARIA structure, keyboard navigation)
- [ ] 15.6 Document error handling and fallback strategies

## Dependencies
- Tasks 2-5 can be developed in parallel
- Task 6 depends on 5 (PdfViewer state)
- Tasks 7-9 depend on 5 and 6 (core integration complete)
- Task 10 depends on 2 (scroll list implementation)
- Task 11 depends on 2-10 (validation of complete feature)
- Tasks 12-14 can run in parallel after 11
- Task 15 runs throughout development

## Validation Criteria
Each task is considered complete when:
- Code is written and passes lint checks
- Relevant unit tests pass
- Manual testing confirms expected behavior
- Code review feedback is addressed (if applicable)
- No console errors or warnings introduced
