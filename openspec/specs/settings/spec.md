# settings Specification

## Purpose
TBD - created by archiving change add-language-settings. Update Purpose after archive.
## Requirements
### Requirement: Settings Page Structure
The system SHALL provide a `/settings` page with tab-based navigation containing Language and Usage sections.

#### Scenario: User accesses Settings page
- **GIVEN** a logged-in user
- **WHEN** the user clicks "Settings" in the header navigation
- **THEN** the system SHALL display the Settings page with two tabs: "Language" and "Usage"

#### Scenario: Tab navigation works
- **GIVEN** a user is on the Settings page viewing the Language tab
- **WHEN** the user clicks the "Usage" tab
- **THEN** the system SHALL display the Usage content without page reload

#### Scenario: Default tab on page load
- **GIVEN** a user navigates to `/settings`
- **WHEN** the page loads
- **THEN** the "Language" tab SHALL be selected by default

---

### Requirement: User Language Preferences Storage
The system SHALL store user language preferences (UI locale and explanation locale) in the database, persisting across sessions and devices.

#### Scenario: New user has no preferences
- **GIVEN** a newly registered user with no preferences record
- **WHEN** the system checks for user preferences
- **THEN** the system SHALL create a default record with `ui_locale='en'` and `explain_locale='en'`

#### Scenario: Preferences persist across sessions
- **GIVEN** a user has set `ui_locale='zh'` and `explain_locale='en'`
- **WHEN** the user logs in from a different device
- **THEN** the system SHALL apply the saved preferences

---

### Requirement: First-Login Language Modal
The system SHALL display a language selection modal when a user logs in for the first time (no existing preferences record).

#### Scenario: First login shows modal
- **GIVEN** a user has just completed registration
- **WHEN** the user enters the application for the first time
- **THEN** the system SHALL display a modal with:
  - UI language selector (English / Chinese)
  - Explanation language selector (English / Chinese)
  - Confirm button
  - Skip button

#### Scenario: User confirms language selection
- **GIVEN** the language modal is displayed
- **WHEN** the user selects languages and clicks Confirm
- **THEN** the system SHALL save the selected preferences, close the modal, and refresh the page with the new UI language

#### Scenario: User skips language selection
- **GIVEN** the language modal is displayed
- **WHEN** the user clicks Skip
- **THEN** the system SHALL save default preferences (English for both), close the modal, and the modal SHALL NOT appear again

#### Scenario: Returning user does not see modal
- **GIVEN** a user has previously set or skipped language preferences
- **WHEN** the user logs in again
- **THEN** the system SHALL NOT display the language modal

---

### Requirement: Language Settings Tab
The system SHALL provide language settings in the Language tab of the Settings page.

#### Scenario: Language tab displays current settings
- **GIVEN** a logged-in user with `ui_locale='zh'` and `explain_locale='en'`
- **WHEN** the user views the Language tab in Settings
- **THEN** the tab SHALL display:
  - Current UI language as selected (Chinese highlighted)
  - Current explanation language as selected (English highlighted)

#### Scenario: User changes UI language
- **GIVEN** a user with `ui_locale='en'`
- **WHEN** the user selects Chinese for UI language and saves
- **THEN** the system SHALL update `ui_locale='zh'` and refresh the page with Chinese UI

#### Scenario: User changes explanation language
- **GIVEN** a user with `explain_locale='en'`
- **WHEN** the user selects Chinese for explanation language and saves
- **THEN** the system SHALL update `explain_locale='zh'` (no immediate page change required as this affects future AI calls)

---

### Requirement: Usage Tab
The system SHALL display usage statistics in the Usage tab of the Settings page, including all existing usage page functionality.

#### Scenario: Usage tab shows statistics
- **GIVEN** a logged-in user on the Settings page
- **WHEN** the user clicks the Usage tab
- **THEN** the system SHALL display:
  - Estimated monthly cost
  - Token usage chart (input/output breakdown)
  - Cost breakdown by operation type
  - Reset date information
  - Quota overview

#### Scenario: Usage data loads correctly
- **GIVEN** a user with AI usage history
- **WHEN** the user views the Usage tab
- **THEN** the system SHALL fetch and display accurate usage statistics

---

### Requirement: UI Internationalization
The system SHALL display all user-facing text in the user's selected UI language.

#### Scenario: UI displays in English
- **GIVEN** a user with `ui_locale='en'`
- **WHEN** the user views any application page
- **THEN** all interface text (buttons, labels, messages, navigation) SHALL display in English

#### Scenario: UI displays in Chinese
- **GIVEN** a user with `ui_locale='zh'`
- **WHEN** the user views any application page
- **THEN** all interface text (buttons, labels, messages, navigation) SHALL display in Chinese

#### Scenario: Error messages respect UI locale
- **GIVEN** a user with `ui_locale='zh'`
- **WHEN** an error occurs (validation, network, etc.)
- **THEN** the error message SHALL display in Chinese

---

### Requirement: AI Explanation Language
The system SHALL generate AI explanations in the user's selected explanation language.

#### Scenario: AI explains page in English
- **GIVEN** a user with `explain_locale='en'`
- **WHEN** the user triggers "Explain this page"
- **THEN** the AI-generated explanation SHALL be in English

#### Scenario: AI explains page in Chinese
- **GIVEN** a user with `explain_locale='zh'`
- **WHEN** the user triggers "Explain this page"
- **THEN** the AI-generated explanation SHALL be in Chinese (simplified)

#### Scenario: AI Q&A respects explanation locale
- **GIVEN** a user with `explain_locale='zh'`
- **WHEN** the user asks a question in the Q&A panel
- **THEN** the AI response SHALL be in Chinese, regardless of the question language

#### Scenario: AI summary respects explanation locale
- **GIVEN** a user with `explain_locale='en'`
- **WHEN** the user generates a document summary
- **THEN** the summary content SHALL be in English

---

### Requirement: Language Change Triggers Refresh
The system SHALL refresh the page when the UI language is changed to ensure all server-rendered content updates.

#### Scenario: Page refreshes on UI language change
- **GIVEN** a user viewing the Settings page with `ui_locale='en'`
- **WHEN** the user changes UI language to Chinese and saves
- **THEN** the entire page SHALL refresh and reload with Chinese UI text

#### Scenario: No refresh needed for explanation language only
- **GIVEN** a user on the Settings page
- **WHEN** the user changes explanation language only and saves
- **THEN** the page SHALL NOT refresh (change applies to future AI requests)

---

### Requirement: Header Navigation Update
The system SHALL display "Settings" instead of "Usage" in the header navigation.

#### Scenario: Header shows Settings link
- **GIVEN** a logged-in user on any page
- **WHEN** the user views the header navigation
- **THEN** the header SHALL show "Settings" link (not "Usage")

#### Scenario: Settings link navigates to Settings page
- **GIVEN** a logged-in user
- **WHEN** the user clicks "Settings" in the header
- **THEN** the system SHALL navigate to `/settings`

---

