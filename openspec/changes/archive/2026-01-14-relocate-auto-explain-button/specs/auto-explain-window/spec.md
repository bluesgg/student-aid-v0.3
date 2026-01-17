# auto-explain-window Specification Delta

## MODIFIED Requirements

### Requirement: Auto-Explain Session UI Trigger Location
The system SHALL provide a single, clear entry point for starting auto-explain sessions in the sticker panel.

#### Scenario: Start session from sticker panel button
- **GIVEN** user is viewing page 10 of a PDF in study page (P5)
- **AND** sticker panel is visible in the middle column
- **WHEN** user clicks "Explain From This Page" button in sticker panel header
- **THEN** system creates auto-explain session with window [8, 15]
- **AND** button displays "Starting..." with spinner icon
- **AND** session progress toast appears at bottom of PDF viewer

#### Scenario: Button shows progress during active session
- **GIVEN** active session is generating pages [10, 17]
- **AND** 3 out of 8 pages are completed
- **WHEN** button renders in sticker panel
- **THEN** button displays "Explaining... (3/8 pages)"
- **AND** button shows check icon
- **AND** button is disabled (cannot be clicked)

#### Scenario: Button returns to idle after session completes
- **GIVEN** active session completed all pages in window
- **WHEN** session status changes to 'completed'
- **THEN** button returns to idle state
- **AND** button displays "Explain From This Page" with play icon
- **AND** button is enabled (can start new session)

#### Scenario: Button states match session lifecycle
- **GIVEN** user navigates through auto-explain workflow
- **THEN** button shows exactly three states:
  1. **Idle**: "Explain From This Page" + play icon (blue background)
  2. **Starting**: "Starting..." + spinner icon (disabled)
  3. **Active**: "Explaining... (X/Y pages)" + check icon (disabled)

#### Scenario: No auto-explain button in PDF toolbar
- **GIVEN** user views PDF with toolbar visible
- **WHEN** toolbar renders
- **THEN** toolbar contains zoom, reader mode, and image selection controls
- **AND** toolbar does NOT contain auto-explain button
- **AND** all auto-explain functionality is accessed via sticker panel

#### Scenario: Button displays English text consistently
- **GIVEN** user starts auto-explain session
- **WHEN** button renders in any state
- **THEN** all button text is in English:
  - Idle: "Explain From This Page"
  - Starting: "Starting..."
  - Active: "Explaining... (X/Y pages)"
- **AND** no Chinese text appears (replaces previous "由此页开始讲解")

#### Scenario: Progress calculation from session data
- **GIVEN** active session with window [10, 17] (8 pages total)
- **AND** pages 10, 11, 12 are completed
- **WHEN** button calculates progress
- **THEN** completed = 3
- **AND** total = 17 - 10 + 1 = 8
- **AND** displays "Explaining... (3/8 pages)"

#### Scenario: Graceful fallback when progress unavailable
- **GIVEN** active session with incomplete progress data
- **WHEN** button renders but `autoExplainProgress` is undefined
- **THEN** button displays "Explaining..." without page count
- **AND** shows check icon
- **AND** remains disabled

---

### Requirement: Legacy Single-Page Explain Deprecation
The system SHALL preserve but not use the legacy single-page explain functionality.

#### Scenario: ExplainPageButton component marked as deprecated
- **GIVEN** developer opens `src/features/stickers/components/explain-page-button.tsx`
- **WHEN** component file is inspected
- **THEN** file contains JSDoc comment:
  ```typescript
  /**
   * @deprecated This component has been replaced by auto-explain functionality.
   * Kept for reference only. Do not use in new code.
   */
  ```
- **AND** component is NOT imported or used in any active UI

#### Scenario: Legacy button does not appear in UI
- **GIVEN** user opens any PDF in study page
- **WHEN** sticker panel renders
- **THEN** only "Explain From This Page" (auto-explain) button is visible
- **AND** old "Explain This Page" (single-page) button does NOT appear
- **AND** legacy component files remain in codebase but unused

---

## REMOVED Requirements

### ~~Requirement: Toolbar-Based Session Initiation~~ (Removed)
- **Reason**: Auto-explain is now initiated from sticker panel, not toolbar
- **Previous behavior**: User clicked "由此页开始讲解" button in PDF toolbar
- **New behavior**: User clicks "Explain From This Page" in sticker panel header

---

## Implementation Notes

### Component Hierarchy Changes

**Before:**
```
PdfViewer
├─ PdfToolbar [has auto-explain button + handlers]
├─ PDF Document
└─ StickerPanel [has single-page explain button]
```

**After:**
```
PdfViewer [owns auto-explain state + handlers]
├─ PdfToolbar [no auto-explain button]
├─ PDF Document
└─ StickerPanel [receives auto-explain props, shows button + progress]
```

### Props Flow

**Before:**
```
PdfViewer → PdfToolbar
  - onStartAutoExplain
  - isAutoExplainActive
  - isAutoExplainStarting
```

**After:**
```
PdfViewer → StickerPanel
  - onStartAutoExplain
  - isAutoExplainActive
  - isAutoExplainStarting
  - autoExplainProgress (NEW)
```

### UI Language Consistency

All auto-explain UI text is now in English:
- Button labels (idle/starting/active)
- Progress indicators
- Toast messages (already English)
- Error messages

---

## Migration Notes

**For users:**
- No behavior changes, only UI reorganization
- Auto-explain works exactly the same, just from different location
- Keyboard shortcuts (if any) remain unchanged

**For developers:**
- Props passed to `StickerPanel` instead of `PdfToolbar`
- Progress calculation logic added in `PdfViewer`
- Legacy `ExplainPageButton` preserved but unused

---

## Related Specs

- **pdf-viewer-interaction**: Updated to reflect new button location
- **context-library**: No changes (context injection unchanged)
- **ai-sticker-generation**: No changes (generation logic unchanged)
