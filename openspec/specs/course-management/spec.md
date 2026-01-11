# course-management Specification

## Purpose
TBD - created by archiving change add-term-dropdown. Update Purpose after archive.
## Requirements
### Requirement: Term Dropdown Selection
The course creation dialog SHALL provide a dropdown select for term selection with auto-selected current term.

#### Scenario: Dropdown displays term options
- **WHEN** user opens the "New course" dialog
- **THEN** the Term field displays as a dropdown select
- **AND** dropdown contains 9 term options (3 years × 3 terms)
- **AND** terms are formatted as "[Season] [Year]" (e.g., "Winter 2026")

#### Scenario: Current term auto-selected
- **WHEN** user opens the "New course" dialog
- **THEN** the dropdown automatically selects the current academic term
- **AND** selection is based on the current month and year

#### Scenario: User can change term selection
- **WHEN** user clicks the Term dropdown
- **THEN** all available term options are displayed
- **AND** user can select any term from the list

#### Scenario: Course creation with dropdown term
- **WHEN** user fills course name and school
- **AND** selects a term from the dropdown
- **AND** submits the form
- **THEN** course is created with the selected term value
- **AND** term value matches the dropdown format

### Requirement: Term Calculation Logic
The system SHALL determine the current academic term based on calendar date.

#### Scenario: Winter term (January-April)
- **WHEN** current month is January, February, March, or April
- **THEN** current term is "Winter [current year]"

#### Scenario: Spring term (May-August)
- **WHEN** current month is May, June, July, or August
- **THEN** current term is "Spring [current year]"

#### Scenario: Fall term (September-December)
- **WHEN** current month is September, October, November, or December
- **THEN** current term is "Fall [current year]"

