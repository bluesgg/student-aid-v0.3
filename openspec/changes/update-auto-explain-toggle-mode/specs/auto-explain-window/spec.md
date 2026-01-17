## MODIFIED Requirements

### Requirement: Session Status and Progress Tracking
The system SHALL provide session state for toggle control without displaying detailed progress to users.

#### Scenario: Toggle switch displays ON/OFF state
- **GIVEN** user is viewing a PDF with auto-explain available
- **WHEN** sticker panel renders
- **THEN** toggle switch labeled "Auto Explain" is displayed
- **AND** switch position indicates current state (ON = green, OFF = gray)
- **AND** no progress bar or percentage is shown

#### Scenario: Turn on auto-explain via toggle
- **GIVEN** auto-explain toggle is OFF
- **AND** no active session exists
- **WHEN** user clicks the toggle switch
- **THEN** toggle animates to ON position (green)
- **AND** auto-explain session starts for current page window (current - 2 to current + 5)
- **AND** loading spinner appears next to label during startup

#### Scenario: Turn off auto-explain via toggle
- **GIVEN** auto-explain toggle is ON
- **AND** active session is processing pages
- **WHEN** user clicks the toggle switch
- **THEN** toggle animates to OFF position (gray)
- **AND** `cancelSession` is called
- **AND** all in-progress requests are aborted
- **AND** session status is updated to 'cancelled'
- **AND** partially completed stickers remain available

#### Scenario: Toggle disabled during startup
- **GIVEN** user clicked toggle to start session
- **AND** session is initializing (isStarting = true)
- **WHEN** toggle switch renders
- **THEN** toggle is visually disabled
- **AND** label shows "Starting..."
- **AND** clicking toggle has no effect

#### Scenario: Session completes automatically
- **GIVEN** auto-explain toggle is ON
- **AND** all pages in window have been processed
- **WHEN** session status changes to 'completed'
- **THEN** toggle remains ON (green)
- **AND** spinning indicator stops
- **AND** user can click toggle to turn OFF (no action needed, session already done)
