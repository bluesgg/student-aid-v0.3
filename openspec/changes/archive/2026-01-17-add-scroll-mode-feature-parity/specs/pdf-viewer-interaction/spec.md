## MODIFIED Requirements

### Requirement: Sticker Hover Highlighting in Scroll Mode
The system SHALL highlight regions on visible pages only when hovering stickers in scroll mode.

#### Scenario: Hover sticker with region on visible page in scroll mode
- **GIVEN** user is in scroll mode
- **AND** sticker bound to region on page 15
- **AND** page 15 is currently visible in viewport
- **WHEN** user hovers over sticker
- **THEN** region on page 15 is highlighted (border 3px, fill 30% opacity)

#### Scenario: Hover sticker with region on non-visible page in scroll mode
- **GIVEN** user is in scroll mode with viewport showing pages 20-23
- **AND** sticker bound to region on page 15
- **AND** page 15 is not currently rendered (outside virtual window)
- **WHEN** user hovers over sticker
- **THEN** no visual highlight appears (page not rendered)
- **AND** no automatic navigation to page 15 occurs

#### Scenario: Hover sticker with multiple regions across pages in scroll mode
- **GIVEN** user is in scroll mode with viewport showing pages 12-15
- **AND** sticker bound to regions on pages 13 (visible), 14 (visible), 20 (not visible)
- **WHEN** user hovers over sticker
- **THEN** regions on pages 13 and 14 are highlighted
- **AND** region on page 20 is not highlighted (not rendered)

## ADDED Requirements

### Requirement: Auto Image Detection Overlay in Scroll Mode
The system SHALL display auto-detected image regions with hover highlights on each visible page in scroll mode.

#### Scenario: Image overlay renders on visible pages in scroll mode
- **GIVEN** user is in scroll mode
- **AND** auto image detection is enabled for the PDF
- **AND** pages 10-12 are currently visible in viewport
- **AND** page 11 has 3 detected images
- **WHEN** page 11 is rendered
- **THEN** ImageDetectionOverlay renders for page 11 with 3 image regions
- **AND** hovering any image region shows highlight (2px blue border, 10% blue fill)
- **AND** image index badge appears on hover

#### Scenario: Image overlays not rendered for non-visible pages
- **GIVEN** user is in scroll mode with virtual scrolling active
- **AND** pages 10-12 are visible, pages 5 and 20 have detected images but are not visible
- **WHEN** viewport shows pages 10-12
- **THEN** ImageDetectionOverlay for pages 5 and 20 are not rendered (performance optimization)
- **AND** only overlays for visible pages with detected images are in DOM

### Requirement: Lazy Extraction Loading in Scroll Mode
The system SHALL display a loading indicator when image detection is in progress for a visible page in scroll mode.

#### Scenario: Loading indicator appears during extraction
- **GIVEN** user is in scroll mode
- **AND** auto image detection is enabled
- **AND** page 15 is visible but images are still being detected (isLoadingImages=true for page 15)
- **WHEN** page 15 renders
- **THEN** LazyExtractionLoading indicator appears at top of page 15
- **AND** shows spinner with "Detecting images..." text

#### Scenario: Loading indicator disappears after extraction
- **GIVEN** page 15 is showing LazyExtractionLoading indicator
- **WHEN** image detection completes for page 15
- **THEN** loading indicator fades out
- **AND** ImageDetectionOverlay appears with detected images (if any)

### Requirement: PDF to Sticker Bidirectional Highlighting in Scroll Mode
The system SHALL enable reverse highlighting from PDF regions to sticker cards when hovering detected regions in scroll mode.

#### Scenario: Hover PDF region highlights corresponding sticker in scroll mode
- **GIVEN** user is in scroll mode on page 20
- **AND** a sticker is bound to a region on page 20
- **AND** page 20 is visible
- **WHEN** user moves mouse over the sticker's anchor region on the PDF
- **THEN** the corresponding sticker card in the sticker panel is highlighted
- **AND** sticker card shows 2px blue border and light blue background

#### Scenario: Mouse leaves PDF region unhighlights sticker in scroll mode
- **GIVEN** sticker card is highlighted due to PDF region hover
- **WHEN** mouse leaves the anchor region on PDF
- **THEN** sticker card highlight is removed
- **AND** sticker card returns to normal styling

### Requirement: Page Area Click Feedback in Scroll Mode
The system SHALL provide click feedback on page areas in scroll mode for image detection awareness.

#### Scenario: Click shows highlight feedback in scroll mode
- **GIVEN** user is in scroll mode
- **AND** auto image detection is enabled
- **AND** page 25 is visible with 5 detected images
- **AND** user is not in mark mode
- **WHEN** user clicks on page 25 area (not on a detected image)
- **THEN** all detected images briefly highlight with dashed blue border for 2 seconds
- **AND** highlight feedback then fades out

#### Scenario: Click in mark mode shows popup in scroll mode
- **GIVEN** user is in scroll mode
- **AND** user has entered mark mode (click-to-mark)
- **AND** page 25 is visible
- **WHEN** user clicks on page 25 at position where no image is detected
- **THEN** NoImageDetectedPopup appears near the click position
- **AND** popup shows "No image detected at this position" message
- **AND** popup provides "Draw manually" button

#### Scenario: Draw manually from popup in scroll mode
- **GIVEN** NoImageDetectedPopup is showing in scroll mode
- **WHEN** user clicks "Draw manually" button
- **THEN** popup closes
- **AND** selection mode activates (cursor becomes crosshair)
- **AND** user can draw rectangle regions on any visible page
