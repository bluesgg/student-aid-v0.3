# pdf-viewer-interaction Specification Delta

## MODIFIED Requirements

### Requirement: Auto Image Detection Hover Highlight
The system SHALL provide more visible hover highlights for auto-detected images.

#### Scenario: Hover highlight visibility
- **GIVEN** user is viewing a page with auto-detected images
- **AND** auto image detection is enabled
- **WHEN** user hovers over a detected image region
- **THEN** region border changes to solid colored border (blue-500)
- **AND** region fill shows light background (bg-primary/10)
- **AND** hover effect is clearly visible on both light and dark PDF backgrounds

### Requirement: Mark Image Button
The system SHALL provide a toolbar button to mark missed images with improved labeling.

#### Scenario: Button label display
- **GIVEN** user is viewing a PDF with auto image detection enabled
- **WHEN** toolbar is rendered
- **THEN** button displays "Mark Image" in English locale
- **AND** button displays "标记图片" in Chinese locale
- **AND** button has a plus icon (when not in mark mode)
- **AND** button tooltip says "Click an image to explain, or draw rectangle for missed images"

#### Scenario: Button in active state
- **GIVEN** user has clicked "Mark Image" to enter mark mode
- **WHEN** button is rendered in active state
- **THEN** button displays "Exit" in English locale
- **AND** button displays "退出" in Chinese locale
- **AND** button has highlighted background (same as current selection mode active state)

## ADDED Requirements

### Requirement: Click-to-Mark Mode
The system SHALL enter a click-to-mark mode when user clicks the Mark Image button (when auto-detection is enabled).

#### Scenario: Enter click-to-mark mode
- **GIVEN** user is viewing a PDF with auto image detection enabled
- **AND** there are detected images on the current page
- **WHEN** user clicks "Mark Image" button
- **THEN** system enters click-to-mark mode
- **AND** cursor remains pointer (not crosshair)
- **AND** detected images remain highlighted on hover
- **AND** clicking anywhere on page will hit-test against detected images

#### Scenario: Click hits detected image in mark mode
- **GIVEN** user is in click-to-mark mode
- **AND** page has 3 detected images
- **WHEN** user clicks at a position that overlaps a detected image rect
- **THEN** system triggers explain flow for that image
- **AND** click-to-mark mode remains active
- **AND** selected image shows loading state

#### Scenario: Click misses all detected images in mark mode
- **GIVEN** user is in click-to-mark mode
- **AND** page has 3 detected images
- **WHEN** user clicks at a position that does not overlap any detected image
- **THEN** system shows "no image detected" popup near the click position
- **AND** popup contains message: "No image detected at this position"
- **AND** popup contains "Draw manually" button
- **AND** popup dismisses on outside click or ESC key

### Requirement: No-Image-Detected Popup
The system SHALL display a popup when user clicks empty area in mark mode.

#### Scenario: Popup appearance
- **GIVEN** user clicked in mark mode and missed all detected images
- **WHEN** popup is displayed
- **THEN** popup appears near the click position (within viewport bounds)
- **AND** popup animates in with fade + scale effect (150ms ease-out)
- **AND** popup shows message in user's locale
- **AND** popup has "Draw manually" button
- **AND** popup has semi-transparent overlay behind it

#### Scenario: Draw manually button action
- **GIVEN** no-image-detected popup is showing
- **WHEN** user clicks "Draw manually" button
- **THEN** popup is dismissed
- **AND** system enters rectangle drawing mode (legacy selection mode)
- **AND** cursor changes to crosshair
- **AND** user can draw rectangle to define image region

#### Scenario: Popup dismissal
- **GIVEN** no-image-detected popup is showing
- **WHEN** user clicks outside the popup
- **OR** user presses ESC key
- **THEN** popup is dismissed
- **AND** click-to-mark mode remains active

#### Scenario: Popup localization
- **GIVEN** user's locale is Chinese (zh)
- **WHEN** no-image-detected popup is displayed
- **THEN** message shows "此位置未检测到图片"
- **AND** button shows "手动框选"
