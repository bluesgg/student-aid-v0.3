# pdf-reader-modes Specification

## Purpose
Defines the behavior of reading modes in the PDF viewer, allowing users to choose between single-page (page) navigation and continuous multi-page (scroll) navigation. This spec covers mode switching, current page tracking, navigation behavior, and user preference persistence.

## ADDED Requirements

### Requirement: Reading Mode Types
The system SHALL provide two distinct reading modes for PDF viewing.

#### Scenario: Page mode characteristics
- **GIVEN** user has selected page mode
- **WHEN** viewing a PDF
- **THEN** exactly one page is rendered at a time
- **AND** navigation uses prev/next button clicks or page number jumps
- **AND** viewport shows only the current page

#### Scenario: Scroll mode characteristics
- **GIVEN** user has selected scroll mode
- **WHEN** viewing a PDF with 10+ pages
- **THEN** multiple pages are rendered vertically in a scrollable container
- **AND** user can scroll continuously with mouse wheel or trackpad
- **AND** page gaps of 16px separate each page visually
- **AND** pages have subtle shadow/border styling (PDF viewer aesthetic)

### Requirement: Mode Toggle Control
The system SHALL provide a UI control to switch between reading modes.

#### Scenario: Toggle control location
- **GIVEN** user is viewing a PDF
- **WHEN** looking at the PDF toolbar
- **THEN** mode toggle control is visible between zoom controls and selection mode button
- **AND** control displays two options: "Page" and "Scroll"
- **AND** current mode is visually highlighted

#### Scenario: Switch from page to scroll mode
- **GIVEN** user is in page mode on page 15 of 100
- **WHEN** user clicks "Scroll" toggle
- **THEN** mode switches to scroll immediately
- **AND** viewport scrolls to show page 15 at top of viewport
- **AND** multiple pages become visible
- **AND** preference is saved to localStorage

#### Scenario: Switch from scroll to page mode
- **GIVEN** user is in scroll mode with page 23 as current page
- **WHEN** user clicks "Page" toggle
- **THEN** mode switches to page immediately
- **AND** only page 23 is rendered
- **AND** scroll container transitions to single-page container
- **AND** preference is saved to localStorage

#### Scenario: Mode toggle disabled during loading
- **GIVEN** PDF is loading (isLoading=true)
- **WHEN** user attempts to click mode toggle
- **THEN** toggle is disabled and does not respond
- **AND** tooltip or visual feedback indicates loading state

### Requirement: Current Page Definition in Scroll Mode
The system SHALL track and expose the "current page" in scroll mode based on visible area.

#### Scenario: Calculate current page by visible area
- **GIVEN** user is in scroll mode
- **AND** viewport shows pages 12 (30% visible), 13 (90% visible), 14 (20% visible)
- **WHEN** system calculates current page
- **THEN** current page is determined to be 13 (highest visible area)
- **AND** page indicator displays "Page 13 / 100"
- **AND** AI "Explain this page" uses page 13

#### Scenario: Current page updates during scroll
- **GIVEN** user is in scroll mode with current page = 20
- **WHEN** user scrolls down so page 21 becomes most visible
- **THEN** current page updates to 21 after 300ms debounce
- **AND** page indicator updates to "Page 21 / 100"
- **AND** last read page is updated to 21

#### Scenario: Current page at document boundaries
- **GIVEN** user is in scroll mode at top of document
- **WHEN** viewport shows page 1 (100% visible) and page 2 (10% visible)
- **THEN** current page is 1
- **WHEN** user scrolls to bottom showing page 100 (100% visible)
- **THEN** current page is 100

### Requirement: Navigation in Scroll Mode
The system SHALL support all navigation methods in scroll mode with appropriate behavior.

#### Scenario: Next button in scroll mode
- **GIVEN** user is in scroll mode with current page = 15
- **WHEN** user clicks "Next" button
- **THEN** viewport smoothly scrolls to page 16
- **AND** page 16 top is positioned 16px from viewport top (padding)
- **AND** after scroll completes, current page updates to 16

#### Scenario: Previous button in scroll mode
- **GIVEN** user is in scroll mode with current page = 25
- **WHEN** user clicks "Previous" button
- **THEN** viewport smoothly scrolls to page 24
- **AND** page 24 top is positioned 16px from viewport top
- **AND** after scroll completes, current page updates to 24

#### Scenario: Page number jump in scroll mode
- **GIVEN** user is in scroll mode on page 10
- **WHEN** user types "55" in page number input and presses Enter
- **THEN** viewport smoothly scrolls to page 55
- **AND** page 55 top is positioned 16px from viewport top
- **AND** after scroll completes, current page updates to 55

#### Scenario: Boundary navigation in scroll mode
- **GIVEN** user is in scroll mode on page 1
- **WHEN** user clicks "Previous" button
- **THEN** button is disabled and no scroll occurs
- **GIVEN** user is on page 100 (last page)
- **WHEN** user clicks "Next" button
- **THEN** button is disabled and no scroll occurs

### Requirement: Mode Preference Persistence
The system SHALL persist user's reading mode preference across sessions.

#### Scenario: Save mode preference on change
- **GIVEN** user switches from page to scroll mode
- **WHEN** mode change is applied
- **THEN** system saves to localStorage key "pdf-reader-mode"
- **AND** value is JSON: { "mode": "scroll", "lastUpdated": <timestamp> }

#### Scenario: Restore mode preference on load
- **GIVEN** user previously selected scroll mode
- **AND** localStorage contains { "mode": "scroll" }
- **WHEN** user opens any PDF
- **THEN** viewer initializes in scroll mode
- **AND** mode toggle shows "Scroll" as active

#### Scenario: Default mode for new users
- **GIVEN** user has never set a mode preference
- **AND** localStorage does not contain "pdf-reader-mode"
- **WHEN** user opens a PDF
- **THEN** viewer initializes in page mode (default)
- **AND** mode toggle shows "Page" as active

#### Scenario: Preference applies across different PDFs
- **GIVEN** user sets mode to scroll in document A
- **WHEN** user navigates to document B
- **THEN** document B opens in scroll mode
- **AND** mode preference is shared across all PDFs

### Requirement: Last Read Page in Scroll Mode
The system SHALL update last read page appropriately in scroll mode.

#### Scenario: Update last read page during scrolling
- **GIVEN** user is in scroll mode with current page = 30
- **WHEN** user scrolls so current page changes to 31
- **AND** 300ms passes without further scroll
- **THEN** system updates lastReadPage to 31 in backend
- **AND** updates localStorage cache

#### Scenario: Restore last read page on reload in scroll mode
- **GIVEN** user was reading page 45 in scroll mode
- **AND** page is closed (lastReadPage=45 saved)
- **WHEN** user reopens the PDF
- **THEN** viewer initializes in scroll mode (from preference)
- **AND** viewport scrolls to page 45
- **AND** page 45 is positioned at top of viewport

#### Scenario: Do not update on rapid scroll
- **GIVEN** user is in scroll mode rapidly scrolling from page 10 to page 50
- **WHEN** current page changes rapidly (10→15→20→25→30...)
- **THEN** lastReadPage updates are debounced (300ms)
- **AND** only the final stable page (e.g., 50) is saved
- **AND** intermediate pages are not saved

### Requirement: Zoom Behavior in Scroll Mode
The system SHALL handle zoom/scale changes appropriately in scroll mode with anchor point preservation.

#### Scenario: Zoom in with anchor point preservation
- **GIVEN** user is in scroll mode on page 20 with scale = 1.0
- **AND** viewport is scrolled 40% down page 20 (offsetRatio = 0.4)
- **WHEN** user increases scale to 1.5
- **THEN** system records anchor point: page=20, offsetRatio=0.4
- **AND** all page heights recalculate (increase by 1.5x)
- **AND** virtual list metrics reset
- **AND** viewport scrolls to restore reading position: page20Top + page20Height * 0.4
- **AND** current page remains 20
- **AND** user continues reading from approximately the same content position

#### Scenario: Zoom out with anchor point preservation
- **GIVEN** user is in scroll mode on page 35 with scale = 1.5
- **AND** viewport is scrolled 60% down page 35 (offsetRatio = 0.6)
- **WHEN** user decreases scale to 1.0
- **THEN** system records anchor point: page=35, offsetRatio=0.6
- **AND** all page heights recalculate (decrease to original)
- **AND** virtual list metrics reset
- **AND** viewport scrolls to restore reading position: page35Top + page35Height * 0.6
- **AND** current page remains 35
- **AND** no disorienting jump occurs

#### Scenario: Zoom at page boundary
- **GIVEN** user is in scroll mode with viewport at exact top of page 10 (offsetRatio = 0.0)
- **WHEN** user changes scale
- **THEN** viewport restores to top of page 10
- **AND** behavior is consistent with general anchor point logic

#### Scenario: Fit-width mode in scroll
- **GIVEN** user is in scroll mode with zoom mode = "fit-width"
- **WHEN** user resizes browser window (width changes)
- **THEN** scale recalculates to fit new container width
- **AND** all page heights update
- **AND** scroll position adjusts to maintain current page

### Requirement: Virtual Scrolling Performance
The system SHALL always use virtual scrolling in scroll mode to maintain consistent performance and implementation.

#### Scenario: Virtual scrolling for all document sizes
- **GIVEN** user opens a PDF in scroll mode
- **WHEN** PDF has any number of pages (10, 50, 150)
- **THEN** system uses react-window VariableSizeList
- **AND** only pages in viewport ±2 (overscan) are rendered
- **AND** scrollbar accurately reflects full document height
- **AND** no threshold-based branching occurs

#### Scenario: Virtual scrolling with variable page heights
- **GIVEN** PDF has pages of different sizes (portrait, landscape mix)
- **WHEN** system measures each page
- **THEN** page heights are cached in state
- **AND** unmeasured pages use estimated height (A4 ratio: width * 1.414)
- **AND** heights update as pages are measured on first render

#### Scenario: Smooth scrolling with virtual list
- **GIVEN** user is scrolling continuously in 100-page PDF
- **WHEN** scroll position changes
- **THEN** pages smoothly appear/disappear at viewport edges
- **AND** no layout jank or stuttering occurs
- **AND** scroll performance maintains 60fps

#### Scenario: Small documents use virtual scrolling
- **GIVEN** user opens a PDF with 15 pages
- **WHEN** scroll mode is active
- **THEN** system still uses VariableSizeList (no special branch)
- **AND** overscan=2 ensures smooth experience
- **AND** implementation remains consistent with large documents
- **AND** minimal overhead from virtualization

### Requirement: Mode Compatibility with Existing Features
The system SHALL ensure all existing PDF viewer features work correctly in both modes.

#### Scenario: Text selection in both modes
- **GIVEN** PDF is not scanned
- **WHEN** user is in page mode
- **THEN** user can select text on current page
- **WHEN** user switches to scroll mode
- **THEN** user can select text on any visible page
- **AND** selection popup appears at correct position

#### Scenario: Sticker highlighting in both modes
- **GIVEN** user hovers over a sticker bound to page 25
- **WHEN** in page mode on page 25
- **THEN** highlight overlay appears on current page
- **WHEN** in scroll mode with page 25 visible
- **THEN** highlight overlay appears on page 25 in scroll list
- **WHEN** in scroll mode with page 25 not visible
- **THEN** no highlight appears (page not rendered)

#### Scenario: Image region selection in both modes
- **GIVEN** user enters image selection mode
- **WHEN** in page mode
- **THEN** user draws regions on current page
- **WHEN** in scroll mode
- **THEN** user can scroll and draw regions on any visible page
- **AND** region overlays appear correctly on each page

#### Scenario: AI explain this page in both modes
- **GIVEN** user clicks "Explain this page"
- **WHEN** in page mode on page 30
- **THEN** AI explains page 30
- **WHEN** in scroll mode with current page = 40
- **THEN** AI explains page 40 (most visible page)

### Requirement: Keyboard Accessibility
The system SHALL provide full keyboard navigation support for reading modes without custom shortcuts.

#### Scenario: Mode toggle keyboard navigation
- **GIVEN** user is on PDF viewer page
- **WHEN** user presses Tab to navigate
- **THEN** mode toggle control receives focus (visible focus ring)
- **AND** control has role="radiogroup" and aria-label="Reading mode"
- **WHEN** focus is on toggle and user presses Enter or Space
- **THEN** mode switches to other option
- **AND** aria-checked updates appropriately
- **AND** ARIA live region announces mode change

#### Scenario: Scroll container keyboard navigation
- **GIVEN** user is in scroll mode
- **WHEN** user tabs to scroll container (tabIndex=0)
- **THEN** scroll container receives focus (visible focus ring)
- **AND** container has aria-label="PDF pages, use arrow keys to scroll"
- **WHEN** focus is on container and user presses PageDown
- **THEN** viewport scrolls down by one viewport height (browser native behavior)
- **WHEN** user presses PageUp
- **THEN** viewport scrolls up by one viewport height
- **WHEN** user presses Home
- **THEN** viewport scrolls to top of document
- **WHEN** user presses End
- **THEN** viewport scrolls to bottom of document
- **WHEN** user presses Arrow Down or Arrow Up
- **THEN** viewport scrolls by line height (browser native behavior)

#### Scenario: Screen reader announces current page
- **GIVEN** user is using screen reader
- **AND** ARIA live region exists: <div aria-live="polite" aria-atomic="true">Page {currentPage} of {numPages}</div>
- **WHEN** current page changes (in scroll mode)
- **THEN** screen reader announces "Page 25 of 100" (after debounce)
- **AND** user is informed of reading progress without visual indicator

#### Scenario: Prev/Next button keyboard navigation
- **GIVEN** user is in page mode
- **WHEN** user tabs to "Next" button
- **THEN** button receives focus
- **WHEN** user presses Enter or Space
- **THEN** page advances to next page
- **AND** behavior is consistent with mouse click

### Requirement: URL State Management
The system SHALL support reading mode in URL state with appropriate priority for shareable context.

#### Scenario: Initialize mode from URL parameter
- **GIVEN** user opens URL with ?mode=scroll
- **AND** localStorage contains mode="page"
- **WHEN** PDF viewer initializes
- **THEN** viewer starts in scroll mode (URL takes priority)
- **AND** mode toggle shows "Scroll" as active
- **AND** localStorage is updated to "scroll"

#### Scenario: Initialize mode from localStorage when URL absent
- **GIVEN** user opens PDF URL without ?mode parameter
- **AND** localStorage contains mode="scroll"
- **WHEN** PDF viewer initializes
- **THEN** viewer starts in scroll mode (from localStorage)
- **AND** URL is updated to include ?mode=scroll via replaceState

#### Scenario: Default mode when both URL and localStorage absent
- **GIVEN** user opens PDF URL without ?mode parameter
- **AND** localStorage does not contain reader mode preference
- **WHEN** PDF viewer initializes
- **THEN** viewer starts in page mode (default)
- **AND** URL is updated to include ?mode=page via replaceState
- **AND** mode toggle shows "Page" as active

#### Scenario: Sync mode change to URL
- **GIVEN** user is in page mode
- **WHEN** user clicks "Scroll" toggle
- **THEN** mode switches to scroll
- **AND** URL updates to ?mode=scroll via history.replaceState() (no new history entry)
- **AND** localStorage updates to mode="scroll"
- **AND** user can share current URL and recipient sees scroll mode

#### Scenario: Invalid URL parameter ignored
- **GIVEN** user opens URL with ?mode=invalid
- **WHEN** PDF viewer initializes
- **THEN** invalid mode is ignored
- **AND** system falls through to localStorage or default
- **AND** URL is corrected to valid mode via replaceState

#### Scenario: URL state preserved across page navigation
- **GIVEN** user is in scroll mode (URL: ?mode=scroll)
- **WHEN** user navigates to different page in scroll mode
- **THEN** URL parameter remains ?mode=scroll
- **AND** no unnecessary history entries created

### Requirement: Error Handling & Fallbacks
The system SHALL gracefully degrade when browser APIs are unavailable or fail.

#### Scenario: IntersectionObserver not available
- **GIVEN** user's browser does not support IntersectionObserver
- **WHEN** PDF loads in scroll mode
- **THEN** system detects missing API: if (!('IntersectionObserver' in window))
- **AND** fallback to scrollTop-based current page calculation
- **AND** current page = page containing scrollTop + viewportHeight/2
- **AND** feature continues to work (less accurate but functional)
- **AND** console warning logged: "IntersectionObserver not supported, using fallback"

#### Scenario: localStorage unavailable or disabled
- **GIVEN** user has localStorage disabled (privacy mode or browser setting)
- **WHEN** system attempts to save mode preference
- **THEN** localStorage.setItem() throws exception
- **AND** exception is caught with try/catch
- **AND** system falls back to in-memory state
- **AND** mode preference does not persist across sessions
- **AND** console warning logged: "localStorage unavailable, preferences will not persist"
- **AND** PDF viewer continues to function normally

#### Scenario: URL manipulation fails
- **GIVEN** user's browser restricts history.replaceState()
- **WHEN** system attempts to update URL
- **THEN** replaceState() failure is caught
- **AND** system continues without URL sync
- **AND** mode still saved to localStorage (if available)
- **AND** feature works without shareable URL

#### Scenario: Zoom anchor restoration fails
- **GIVEN** user zooms in scroll mode
- **AND** page height measurement fails (edge case)
- **WHEN** system attempts to restore anchor point
- **THEN** fallback to simple scrollToPage(anchorPage) without offset
- **AND** user stays on same page (graceful degradation)
- **AND** no crash or blank screen occurs

---
