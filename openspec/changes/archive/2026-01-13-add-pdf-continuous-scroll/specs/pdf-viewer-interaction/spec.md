## ADDED Requirements

### Requirement: Sticker Click Navigation in Scroll Mode
The system SHALL navigate to target page appropriately based on current reading mode when user clicks a sticker.

#### Scenario: Sticker click navigation in page mode
- **GIVEN** user is in page mode on page 10
- **AND** a sticker references page 25
- **WHEN** user clicks the sticker
- **THEN** system instantly switches to page 25
- **AND** only page 25 is rendered
- **AND** sticker highlight appears (if sticker has region)

#### Scenario: Sticker click navigation in scroll mode
- **GIVEN** user is in scroll mode with current page = 10
- **AND** a sticker references page 25
- **WHEN** user clicks the sticker
- **THEN** viewport smoothly scrolls to page 25
- **AND** page 25 top is positioned 16px from viewport top
- **AND** after scroll completes, current page updates to 25
- **AND** sticker highlight appears on page 25 (if sticker has region)

#### Scenario: Sticker click to already visible page in scroll mode
- **GIVEN** user is in scroll mode with viewport showing pages 20-22
- **AND** a sticker references page 21
- **WHEN** user clicks the sticker
- **THEN** viewport scrolls slightly to align page 21 at top (if not already aligned)
- **AND** highlight appears on page 21

### Requirement: Region Overlay Rendering in Scroll Mode
The system SHALL render region overlays only for visible pages in scroll mode for performance optimization.

#### Scenario: Overlays render for visible pages only
- **GIVEN** user has selected regions on pages 5, 12, 18, 25
- **AND** user is in scroll mode with virtual scrolling active
- **WHEN** viewport shows pages 11-14 (virtual window)
- **THEN** overlay for page 12 is rendered
- **AND** overlays for pages 5, 18, 25 are not rendered (performance optimization)

#### Scenario: Overlays appear as pages scroll into view
- **GIVEN** user has regions on pages 10, 11, 12
- **AND** user is in scroll mode scrolling from page 5 to page 15
- **WHEN** page 10 enters viewport
- **THEN** page 10 overlay appears
- **WHEN** page 10 exits viewport
- **THEN** page 10 overlay is unmounted

#### Scenario: Overlays in page mode (no change)
- **GIVEN** user is in page mode with regions on pages 5, 12, 18
- **WHEN** user is on page 12
- **THEN** only page 12 overlay is rendered (as before)
- **AND** behavior is unchanged from original implementation

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
- **AND** page indicator could optionally show "Target: p.15 (not visible)"

#### Scenario: Hover sticker with multiple regions across pages in scroll mode
- **GIVEN** user is in scroll mode with viewport showing pages 12-15
- **AND** sticker bound to regions on pages 13 (visible), 14 (visible), 20 (not visible)
- **WHEN** user hovers over sticker
- **THEN** regions on pages 13 and 14 are highlighted
- **AND** region on page 20 is not highlighted (not rendered)

### Requirement: Selection Mode Persists Across Page Navigation
The system SHALL maintain selection mode state when user navigates between pages in both page and scroll modes.

#### Scenario: Selection mode persists across page navigation in page mode
- **GIVEN** user enters selection mode on page 12
- **WHEN** user navigates to page 13 (via next button)
- **THEN** selection mode remains active
- **AND** user can continue drawing regions on page 13
- **AND** sessionRootPage remains 12

#### Scenario: Selection mode persists during scrolling in scroll mode
- **GIVEN** user enters selection mode on page 12 in scroll mode
- **WHEN** user scrolls to view page 15
- **AND** current page updates to 15
- **THEN** selection mode remains active
- **AND** user can draw regions on page 15
- **AND** sessionRootPage remains 12

#### Scenario: Selection mode cursor in scroll mode
- **GIVEN** user is in scroll mode with selection mode active
- **WHEN** cursor is over any visible page
- **THEN** cursor displays as crosshair
- **AND** drawing can be initiated on any visible page

---
