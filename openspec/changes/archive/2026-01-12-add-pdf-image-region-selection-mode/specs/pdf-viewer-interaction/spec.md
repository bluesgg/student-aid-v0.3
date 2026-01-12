# pdf-viewer-interaction Specification

## Purpose
Defines user interactions within the PDF viewer, including selection modes, region overlays, and visual feedback mechanisms.

---

## ADDED Requirements

### Requirement: Selection Mode Toggle
The system SHALL provide a toolbar control to enable/disable image region selection mode.

#### Scenario: Enter selection mode
- **GIVEN** user is viewing a PDF in normal reading mode
- **WHEN** user clicks "Select images" toolbar button
- **THEN** selection mode is activated
- **AND** cursor changes to crosshair
- **AND** sessionRootPage is captured as current page
- **AND** instructions tooltip appears: "Draw rectangles around images you want explained"

#### Scenario: Exit selection mode
- **GIVEN** user is in selection mode with 2 draft regions
- **WHEN** user clicks "Select images" button again
- **THEN** selection mode is deactivated
- **AND** cursor returns to normal
- **AND** draft-only regions are cleared
- **AND** persisted regions (from generated stickers) remain visible

#### Scenario: Selection mode persists across page navigation
- **GIVEN** user enters selection mode on page 12
- **WHEN** user navigates to page 13
- **THEN** selection mode remains active
- **AND** user can continue drawing regions on page 13
- **AND** sessionRootPage remains 12

### Requirement: Rectangle Drawing
The system SHALL allow users to draw rectangular regions by dragging on the PDF page.

#### Scenario: Draw a single rectangle
- **GIVEN** selection mode is active
- **WHEN** user presses pointer at position (100, 150)
- **AND** drags to position (300, 350)
- **AND** releases pointer
- **THEN** system captures rectangle in pixel coordinates
- **AND** converts to normalized coordinates (0..1 relative to page size)
- **AND** stores region: { page: currentPage, rect: { x, y, width, height } }
- **AND** immediately triggers explain-page generation

#### Scenario: Draw multiple rectangles on same page
- **GIVEN** user has drawn 1 rectangle on page 13
- **WHEN** user draws a 2nd rectangle on page 13
- **THEN** both rectangles are stored as separate regions
- **AND** both overlays are visible simultaneously
- **AND** new generation request includes both regions

#### Scenario: Draw rectangles on different pages
- **GIVEN** user drew 1 rectangle on page 13 (root page 12)
- **WHEN** user navigates to page 14 and draws another rectangle
- **THEN** both regions are stored with their respective pages
- **AND** new generation request includes: page=12, regions=[{page:13,...}, {page:14,...}]

#### Scenario: Minimum rectangle size
- **GIVEN** user attempts to draw a very small rectangle (e.g., 5x5 pixels)
- **WHEN** pointer is released
- **THEN** system validates minimum size (e.g., 20x20 pixels)
- **AND** rejects rectangle if too small (show toast: "Region too small")

### Requirement: Region Overlay Rendering
The system SHALL render visible overlays for all selected regions with proper styling.

#### Scenario: Overlay visual appearance
- **GIVEN** user has drawn a region with normalized rect { x: 0.2, y: 0.3, w: 0.4, h: 0.3 }
- **AND** current page width is 600px, height is 800px
- **WHEN** overlay is rendered
- **THEN** overlay is positioned at pixel coordinates (120, 240) with size (240, 240)
- **AND** overlay has 2px solid border (theme color)
- **AND** overlay has translucent fill (same color, 18% opacity)
- **AND** overlay is positioned absolutely over PDF canvas

#### Scenario: Overlay scales with zoom
- **GIVEN** user has drawn a region at 100% zoom
- **WHEN** user zooms to 150%
- **THEN** overlay scales proportionally with PDF page
- **AND** normalized coordinates remain unchanged
- **AND** pixel position recalculates based on new page dimensions

#### Scenario: Overlay persists across scroll
- **GIVEN** user has drawn a region on page 13
- **WHEN** user scrolls to page 15 and back to page 13
- **THEN** overlay reappears at correct position on page 13

#### Scenario: Multi-page overlay rendering (virtual scrolling)
- **GIVEN** user has regions on pages 5, 12, 18
- **AND** PDF viewer uses virtual scrolling
- **WHEN** only pages 11-13 are rendered in viewport
- **THEN** only page 12's overlay is visible
- **AND** overlays for pages 5 and 18 are not rendered (performance optimization)

### Requirement: Region Deletion
The system SHALL allow users to delete individual regions.

#### Scenario: Delete region via overlay button
- **GIVEN** user has 3 selected regions with generated stickers
- **WHEN** user hovers over region overlay
- **THEN** delete button (×) appears in top-right corner of overlay
- **WHEN** user clicks delete button
- **THEN** region is removed from selection set
- **AND** overlay disappears immediately
- **AND** new generation request is triggered with remaining 2 regions

#### Scenario: Delete last region
- **GIVEN** user has 1 selected region
- **WHEN** user deletes the region
- **THEN** region overlay is removed
- **AND** selection mode remains active (user can draw new regions)
- **AND** no generation is triggered (empty selection)

### Requirement: Sticker Hover Highlighting
The system SHALL highlight bound regions when user hovers over a sticker.

#### Scenario: Hover sticker with single region
- **GIVEN** a sticker bound to 1 image region on page 13
- **WHEN** user hovers mouse over the sticker card
- **THEN** system parses sticker.anchor.anchors
- **AND** identifies ImageAnchor with page=13, rect={...}
- **AND** applies highlight styling to corresponding overlay:
  - Border width increases to 3px
  - Fill opacity increases to 30%
- **WHEN** mouse leaves sticker card
- **THEN** highlight styling is removed

#### Scenario: Hover sticker with multiple regions
- **GIVEN** a sticker bound to 3 image regions (pages 13, 13, 14)
- **AND** PDF viewer currently shows pages 12-14
- **WHEN** user hovers over sticker
- **THEN** all 3 region overlays are highlighted simultaneously

#### Scenario: Hover sticker with region on non-visible page
- **GIVEN** a sticker bound to region on page 20
- **AND** PDF viewer currently shows page 12
- **WHEN** user hovers over sticker
- **THEN** no visual change occurs (page 20 not rendered)
- **AND** no auto-navigation to page 20 (MVP constraint)

### Requirement: Request Versioning (Latest-Wins)
The system SHALL ignore stale responses using request versioning.

#### Scenario: Rapid successive edits
- **GIVEN** user draws region R1 → requestVersion=1, fires API call
- **AND** before response returns, user draws R2 → requestVersion=2, fires new call
- **WHEN** response for version 1 returns
- **THEN** client checks: responseVersion (1) < currentRequestVersion (2)
- **AND** response is ignored (not applied to UI)
- **WHEN** response for version 2 returns
- **THEN** client applies stickers (latest wins)

#### Scenario: Delete during generation
- **GIVEN** user has 3 regions, generation in progress (version 5)
- **WHEN** user deletes 1 region during generation
- **THEN** new generation starts (version 6)
- **WHEN** version 5 response returns
- **THEN** client ignores it (stale)
- **WHEN** version 6 response returns
- **THEN** client applies stickers with 2 regions

### Requirement: Loading State UI
The system SHALL display loading feedback during generation.

#### Scenario: Global loading state
- **GIVEN** user adds a region, triggering generation
- **WHEN** generation request is in flight
- **THEN** system sets isGenerating=true
- **AND** displays loading indicator (spinner or progress bar)
- **AND** "Select images" button is disabled
- **WHEN** generation completes
- **THEN** isGenerating=false
- **AND** loading indicator disappears
- **AND** button is re-enabled

### Requirement: Region Coordinate Validation
The system SHALL validate region coordinates before sending to backend.

#### Scenario: Valid region coordinates
- **GIVEN** user draws region with normalized rect { x: 0.2, y: 0.3, w: 0.4, h: 0.3 }
- **WHEN** system validates coordinates
- **THEN** checks: 0 <= x, y, x+w, y+h <= 1
- **AND** checks: w > 0 and h > 0
- **AND** validation passes

#### Scenario: Invalid coordinates (out of bounds)
- **GIVEN** coordinate calculation error results in x = 1.2
- **WHEN** system validates coordinates
- **THEN** validation fails
- **AND** error logged to console
- **AND** region is clamped to valid range or rejected

#### Scenario: Region count limit
- **GIVEN** user has drawn 8 regions (maximum)
- **WHEN** user attempts to draw a 9th region
- **THEN** system prevents drawing
- **AND** shows toast: "Maximum 8 regions allowed"
- **AND** existing regions remain unchanged

### Requirement: JPEG Crop Extraction
The system SHALL extract JPEG image crops from selected regions.

#### Scenario: Extract crop from rendered page
- **GIVEN** page 13 is rendered on canvas (width 600px, height 800px)
- **AND** user selected region with normalized rect { x: 0.2, y: 0.3, w: 0.4, h: 0.3 }
- **WHEN** system extracts JPEG crop
- **THEN** converts normalized rect to pixel rect: (120, 240, 240, 240)
- **AND** creates offscreen canvas
- **AND** draws cropped region from source canvas
- **AND** encodes to JPEG blob (quality 0.85)
- **AND** JPEG blob is approximately 200-500 KB

#### Scenario: Extract multiple crops
- **GIVEN** user has 3 selected regions across 2 pages
- **WHEN** system prepares multipart request
- **THEN** extracts 3 JPEG crops in parallel
- **AND** crops are named: image_0, image_1, image_2 (matching region array order)

### Requirement: Error Handling and User Feedback
The system SHALL provide clear error messages for edge cases.

#### Scenario: Scanned PDF detection
- **GIVEN** user opens a scanned PDF (is_scanned=true)
- **WHEN** user clicks "Select images" button
- **THEN** system shows error toast: "Scanned PDFs do not support region selection"
- **AND** selection mode is not activated

#### Scenario: Network error during generation
- **GIVEN** user triggers generation with selected regions
- **AND** API request fails (network error or 500)
- **WHEN** error is returned
- **THEN** system shows error toast: "Failed to generate explanation. Please try again."
- **AND** isGenerating is set to false
- **AND** regions remain selected (user can retry)

#### Scenario: Quota exceeded
- **GIVEN** user has exhausted autoExplain quota
- **WHEN** user triggers generation
- **THEN** API returns 429 QUOTA_EXCEEDED
- **AND** system shows toast: "Quota exceeded. Resets at [time]."
- **AND** regions remain selected

---

## REMOVED Requirements

None. This is a new capability.

---

## Notes

### MVP Constraints
- Rectangle-only selection (no lasso, polygon)
- No per-region progress UI (global loading state only)
- No region resize/move/undo
- No auto-navigation on sticker click

### Future Enhancements
- Resize/move existing regions
- Undo/redo stack for region operations
- Per-region generation status
- Auto-navigate to region on sticker click
- Lasso/polygon selection tools
