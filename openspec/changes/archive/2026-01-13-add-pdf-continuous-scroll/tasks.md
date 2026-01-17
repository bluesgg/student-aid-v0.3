## 1. Foundation & Types
- [x] 1.1 Create `src/lib/reader/types.ts` with ReaderMode type definition
- [x] 1.2 Add layout constants (PAGE_GAP_PX, PAGE_PADDING_PX, DEBOUNCE_MS, OVERSCAN_COUNT)
- [x] 1.3 Add localStorage utility functions for mode persistence (get/set with try/catch)
- [x] 1.4 Add URL state utility functions (getInitialMode, syncModeToURL)
- [x] 1.5 Write unit tests for localStorage utilities (including fallback when unavailable)
- [x] 1.6 Write unit tests for URL state utilities

## 2. Core Scroll Mode Rendering
- [x] 2.1 Enhance VirtualPdfList to always use VariableSizeList (no threshold logic)
- [x] 2.2 Implement page height measurement and caching
- [x] 2.3 Add dynamic height estimation for unmeasured pages (A4 ratio fallback)
- [x] 2.4 Handle scale changes - store anchor point, reset list heights, restore position
- [x] 2.5 Add styling for page gaps (use PAGE_GAP_PX constant) and background
- [x] 2.6 Add tabIndex={0} and aria-label to scroll container for keyboard accessibility

## 3. Current Page Tracking
- [x] 3.1 Implement IntersectionObserver setup for page visibility tracking
- [x] 3.2 Add fallback implementation using scrollTop calculation if IntersectionObserver unavailable
- [x] 3.3 Calculate visible area for each observed page
- [x] 3.4 Determine current page (highest visible area wins)
- [x] 3.5 Add debounce for current page updates (use CURRENT_PAGE_DEBOUNCE_MS constant)
- [x] 3.6 Expose getCurrentPage() method from scroll list component

## 4. Mode Toggle UI
- [x] 4.1 Add mode toggle control to PdfToolbar (Segmented control: Page | Scroll)
- [x] 4.2 Implement ARIA structure: role="radiogroup", each option role="radio" with aria-checked
- [x] 4.3 Add keyboard navigation: Tab to focus, Enter/Space to switch, Arrow keys for radio
- [x] 4.4 Add visible focus ring for keyboard users
- [x] 4.5 Update toolbar layout to accommodate new control
- [x] 4.6 Add visual feedback for active mode
- [x] 4.7 Position toggle between zoom controls and selection mode button

## 5. PdfViewer Integration
- [x] 5.1 Add readerMode state to PdfViewer component
- [x] 5.2 Initialize mode with priority: URL > localStorage > default 'page'
- [x] 5.3 Implement conditional rendering (page mode vs scroll mode)
- [x] 5.4 Sync mode changes to both localStorage and URL (history.replaceState)
- [x] 5.5 Add ARIA live region for current page announcements (aria-live="polite")
- [x] 5.6 Ensure currentPage state works correctly in both modes
- [x] 5.7 Handle URL parameter validation (ignore invalid ?mode values)

## 6. Navigation Integration
- [x] 6.1 Update use-page-navigation hook to accept readerMode parameter
- [x] 6.2 Implement scrollToPage() function for scroll mode
- [x] 6.3 Add smooth scroll behavior with padding (use PAGE_PADDING_PX constant)
- [x] 6.4 Ensure Prev/Next buttons work correctly in scroll mode
- [x] 6.5 Ensure Prev/Next buttons keyboard accessible (Tab + Enter/Space)
- [x] 6.6 Ensure page number input jump works in scroll mode

## 7. Sticker & Region Integration
- [x] 7.1 Update sticker click handler to use mode-aware navigation
- [x] 7.2 Ensure region overlays render only for visible pages in scroll mode
- [x] 7.3 Verify hover highlighting works in scroll mode
- [x] 7.4 Test image region selection works in scroll mode
- [x] 7.5 Confirm region deletion and regeneration work in scroll mode

## 8. AI Features Integration
- [x] 8.1 Update "Explain this page" to use getCurrentPage() in scroll mode
- [x] 8.2 Ensure text selection and manual sticker creation work in scroll mode
- [x] 8.3 Verify AI explanations appear correctly for scroll mode

## 9. Last Read Page Integration
- [x] 9.1 Update use-last-read-page hook for scroll mode compatibility
- [x] 9.2 Implement debounced lastReadPage updates (use LAST_READ_PAGE_DEBOUNCE_MS constant)
- [x] 9.3 Ensure page restoration on reload works in both modes
- [x] 9.4 Test lastReadPage updates correctly during scrolling

## 10. Zoom & Scale Handling
- [x] 10.1 Detect scale changes in scroll mode
- [x] 10.2 Before zoom: Store anchor point (anchorPage + offsetRatio = (viewportTop - pageTop) / pageHeight)
- [x] 10.3 Recalculate all page heights on scale change
- [x] 10.4 Reset VariableSizeList with new metrics
- [x] 10.5 After zoom: Restore position using requestAnimationFrame (scrollTo(pageTop + pageHeight * offsetRatio))
- [x] 10.6 Add fallback: If anchor restoration fails, fallback to scrollToPage(anchorPage)
- [x] 10.7 Test zoom in/out maintains reading position without disorienting jumps

## 11. Performance & Virtual Scrolling
- [x] 11.1 Verify virtual scrolling works for all document sizes (10, 50, 150 pages)
- [x] 11.2 Confirm overscan setting (use OVERSCAN_COUNT constant) is respected
- [ ] 11.3 Test scroll performance with 100+ page document (maintain 60fps)
- [ ] 11.4 Profile memory usage with large documents
- [x] 11.5 Optimize region overlay rendering (visible pages only)
- [x] 11.6 Test IntersectionObserver fallback (disable API, verify scrollTop calculation works)

## 12. Testing & Validation
- [x] 12.1 Write unit tests for ReaderMode type and utilities
- [x] 12.2 Write unit tests for URL state management (including invalid params)
- [x] 12.3 Write integration tests for mode switching
- [ ] 12.4 Add E2E test for scroll mode navigation
- [ ] 12.5 Add E2E test for sticker interaction in scroll mode
- [ ] 12.6 Add E2E test for keyboard navigation (Tab, Enter/Space, PageUp/Down)
- [x] 12.7 Test with sample PDFs: 10 pages, 60 pages, 150 pages
- [x] 12.8 Test error handling: localStorage disabled, IntersectionObserver unavailable
- [ ] 12.9 Test ARIA live region announcements with screen reader

## 13. Browser Compatibility
- [ ] 13.1 Test in Chrome (Windows and Mac)
- [ ] 13.2 Test in Safari (Mac, verify trackpad scrolling and keyboard navigation)
- [ ] 13.3 Test in Edge (Windows)
- [ ] 13.4 Verify IntersectionObserver works in target browsers (Chrome 51+, Safari 12.1+, Edge 15+)
- [ ] 13.5 Test fallback behavior in browsers without IntersectionObserver (if any)
- [ ] 13.6 Test keyboard navigation across all browsers (PageUp/Down, arrows, Home/End)

## 14. UX Polish
- [x] 14.1 Add smooth scroll animations for page navigation
- [x] 14.2 Ensure page gaps use consistent spacing (PAGE_GAP_PX constant)
- [x] 14.3 Add visible focus rings for all interactive elements (mode toggle, scroll container)
- [x] 14.4 Verify loading states display correctly in scroll mode
- [ ] 14.5 Test error states in scroll mode
- [x] 14.6 Ensure mode preference persists across sessions (localStorage + URL)
- [ ] 14.7 Test screen reader experience with NVDA/VoiceOver

## 15. Documentation
- [x] 15.1 Add code comments for complex logic (IntersectionObserver, height calculation, zoom anchor)
- [x] 15.2 Update component documentation (PdfViewer, PdfScrollList, PdfToolbar)
- [x] 15.3 Document localStorage keys and URL parameters (?mode=scroll|page)
- [x] 15.4 Add JSDoc for exported functions and types
- [x] 15.5 Document accessibility features (ARIA structure, keyboard navigation)
- [x] 15.6 Document error handling and fallback strategies

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
