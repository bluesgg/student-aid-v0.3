## MODIFIED Requirements

### Requirement: Mark Mode Click-to-Detect Flow

The system SHALL support mark mode for users to manually add missed images to the detection database. When user clicks in mark mode, the system MUST first attempt to detect an image at the click position before showing the manual draw fallback.

#### Scenario: Click detects missed image successfully
- **GIVEN** user is in mark mode on a PDF page
- **AND** there is an image at position (0.3, 0.4) that was not auto-detected
- **WHEN** user clicks at position (0.35, 0.45) which is inside the image
- **THEN** system calls detect API with click coordinates
- **AND** system uses existing image extraction algorithm to find image boundary at click position
- **AND** image boundary is found and saved to `detected_images` table with `detection_method='manual'`
- **AND** detected images overlay refreshes to show the newly added image
- **AND** brief success feedback is shown (highlight flash)
- **AND** user remains in mark mode for additional marking

#### Scenario: Click finds no image - show manual draw popup
- **GIVEN** user is in mark mode on a PDF page
- **AND** click position has no detectable image
- **WHEN** user clicks at the position
- **THEN** system calls detect API with click coordinates
- **AND** detection returns no image found
- **AND** "No image detected" popup appears near click position
- **AND** popup shows "Draw manually" button
- **AND** clicking "Draw manually" enters rectangle drawing mode

#### Scenario: Manual rectangle drawing after failed detection
- **GIVEN** user clicked in mark mode and detection failed
- **AND** user clicked "Draw manually" and is now in rectangle mode
- **WHEN** user draws a rectangle around the image
- **THEN** AI explanation is triggered for the selected region
- **AND** after explanation succeeds, region is saved to `detected_images` table
- **AND** detected images overlay refreshes

## ADDED Requirements

### Requirement: Point Detection API

The system SHALL provide an API endpoint to detect images at a specific click position on a PDF page.

#### Scenario: Detect image at click position
- **GIVEN** a PDF file with page N containing images
- **WHEN** client calls `POST /api/courses/:courseId/files/:fileId/images/detect` with `{ page: N, clickX: 0.35, clickY: 0.45 }`
- **THEN** system downloads the PDF page
- **AND** runs existing image extraction algorithm on the page
- **AND** checks if any detected image boundary contains the click point
- **AND** if found, saves image to `detected_images` with `detection_method='manual'`
- **AND** returns `{ found: true, image: { id, rect } }`

#### Scenario: No image at click position
- **GIVEN** a PDF file with page N
- **AND** no image exists at click position
- **WHEN** client calls detect API with click coordinates
- **THEN** system returns `{ found: false }`
- **AND** no data is saved to database
