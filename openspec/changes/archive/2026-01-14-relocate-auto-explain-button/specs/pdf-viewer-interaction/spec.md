# pdf-viewer-interaction Specification Delta

## MODIFIED Requirements

### Requirement: Sticker Panel AI Interaction Controls
The sticker panel SHALL provide unified access to AI explanation features including auto-explain sessions.

#### Scenario: Auto-explain button in sticker panel header
- **GIVEN** user views PDF in study page (P5) with sticker panel visible
- **WHEN** sticker panel renders
- **THEN** panel header contains:
  - Title: "AI Explanations"
  - Current page indicator: "Page X of Y"
  - Auto-explain button: "Explain From This Page"
- **AND** button is positioned below page indicator
- **AND** button spans full width of sticker panel header area

#### Scenario: Button adapts to session state
- **GIVEN** sticker panel is visible
- **WHEN** auto-explain session state changes
- **THEN** button updates to show current state:
  - Before session: Blue button with play icon, enabled
  - Session starting: Gray button with spinner, disabled
  - Session active: White button with check icon + progress text, disabled
  - Session complete: Returns to blue button with play icon, enabled

#### Scenario: Sticker panel shows progress feedback
- **GIVEN** active auto-explain session with 4 out of 8 pages completed
- **WHEN** user views sticker panel
- **THEN** button displays "Explaining... (4/8 pages)"
- **AND** newly generated stickers appear dynamically as pages complete
- **AND** user can scroll through completed stickers while generation continues

#### Scenario: No duplicate session buttons
- **GIVEN** user views PDF with both toolbar and sticker panel visible
- **WHEN** user looks for auto-explain controls
- **THEN** exactly ONE "Explain From This Page" button exists (in sticker panel)
- **AND** PDF toolbar does NOT contain auto-explain button
- **AND** toolbar only contains navigation/zoom/reader mode controls

---

### Requirement: PDF Toolbar Focused on Document Controls
The PDF toolbar SHALL provide document navigation and viewing controls without AI feature buttons.

#### Scenario: Toolbar contains only document controls
- **GIVEN** user views PDF in study page
- **WHEN** toolbar renders at top of PDF viewer
- **THEN** toolbar contains:
  - Page navigation (previous/next arrows + page input)
  - Zoom controls (zoom in/out + zoom mode dropdown)
  - Reader mode toggle (page view / continuous scroll)
  - Image selection mode toggle
- **AND** toolbar does NOT contain:
  - Auto-explain button (moved to sticker panel)
  - Text selection controls (context menu handles this)

#### Scenario: Toolbar remains clean and focused
- **GIVEN** toolbar without auto-explain button
- **WHEN** user navigates document
- **THEN** toolbar provides quick access to viewing controls
- **AND** AI features are clearly separated in sticker panel
- **AND** toolbar layout is more spacious and less cluttered

---

## REMOVED Requirements

### ~~Requirement: Toolbar-Based AI Explanation Trigger~~ (Removed)
- **Reason**: Auto-explain is now triggered from sticker panel, not toolbar
- **Previous location**: PDF toolbar (top of viewer)
- **New location**: Sticker panel header (middle column)

---

## ADDED Requirements

### Requirement: State Management at Page Level
The system SHALL manage auto-explain session state at the StudyPage level to enable sibling component communication.

#### Scenario: StudyPage coordinates auto-explain state
- **GIVEN** user opens PDF in study page
- **WHEN** StudyPage component mounts
- **THEN** StudyPage calls `useAutoExplainSession(fileId)` hook
- **AND** owns session state: `{ session, isActive, isStarting, startSession, updateWindow, cancelSession }`
- **AND** passes relevant state to both PdfViewer and StickerPanel as props

#### Scenario: StickerPanel triggers session via props
- **GIVEN** StickerPanel receives `onStartAutoExplain` callback from StudyPage
- **WHEN** user clicks "Explain From This Page" button
- **THEN** button calls `onStartAutoExplain?.()`
- **AND** StudyPage handler calls `startSession({ courseId, fileId, page, pdfType, locale })`
- **AND** session state updates trigger re-render in both PdfViewer and StickerPanel

#### Scenario: PdfViewer receives session state as props
- **GIVEN** StudyPage has active auto-explain session
- **WHEN** session state changes (e.g., progress updates)
- **THEN** StudyPage passes updated `autoExplainSession` to PdfViewer
- **AND** PdfViewer uses props to update SessionProgressToast
- **AND** PdfViewer does NOT manage session state internally

#### Scenario: Sibling components stay synchronized
- **GIVEN** active session with progress: 4/8 pages completed
- **WHEN** session state updates in StudyPage
- **THEN** StickerPanel button shows "Explaining... (4/8 pages)"
- **AND** PdfViewer toast shows "Generating: 4/8 pages"
- **AND** both components display identical progress data
- **AND** no state desynchronization occurs

---

## Implementation Notes

### Component Architecture

**State Ownership:**
```
StudyPage (page.tsx)
├─ useAutoExplainSession(fileId) ← State lives here
├─ handleStartAutoExplain() ← Wrapper handler
│
├─→ PdfViewer (props)
│   ├─ autoExplainSession
│   ├─ onStartAutoExplain
│   ├─ isAutoExplainActive
│   └─ isAutoExplainStarting
│
└─→ StickerPanel (props)
    ├─ autoExplainSession
    ├─ onStartAutoExplain
    ├─ isAutoExplainActive
    ├─ isAutoExplainStarting
    └─ autoExplainProgress (derived from session)
```

**Why State Lifting is Required:**
- PdfViewer and StickerPanel are **sibling components** (rendered by ResizableLayout)
- Siblings cannot pass props directly to each other
- StudyPage is the nearest common parent that can coordinate both components
- This ensures single source of truth for session state

**Migration from Previous Architecture:**
- **Before**: PdfViewer owned `useAutoExplainSession` hook internally
- **After**: StudyPage owns hook, PdfViewer receives state as props
- **Benefit**: Cleaner separation of concerns, easier testing, prevents state duplication

---

### Visual Layout Changes

**Before (Toolbar Cluttered):**
```
┌─────────────────────────────────────────────────┐
│ [←] [→] [Zoom] [Mode] [由此页开始讲解] [Images] │  ← Toolbar
└─────────────────────────────────────────────────┘
```

**After (Toolbar Focused):**
```
┌───────────────────────────────────┐
│ [←] [→] [Zoom] [Mode] [Images]  │  ← Toolbar (cleaner)
└───────────────────────────────────┘

┌─────────────────────────────────┐
│ AI Explanations   Page 10 of 50 │  ← Sticker Panel Header
│ [Explain From This Page]       │  ← Auto-explain button here
└─────────────────────────────────┘
```

### User Workflow

**Starting Auto-Explain:**
1. User opens PDF
2. User looks at sticker panel (middle column)
3. User sees "Explain From This Page" button
4. User clicks button
5. Session starts, button shows progress
6. Stickers appear in panel as pages complete

**Why This Works Better:**
- Button is next to where results (stickers) appear
- Clearer cause-effect relationship
- Sticker panel is dedicated to AI features
- Toolbar remains focused on document viewing

---

## Accessibility Notes

### Keyboard Navigation
- Auto-explain button is keyboard accessible via Tab key
- Enter/Space keys trigger session start
- Button disabled state prevents accidental re-triggering

### Screen Reader Support
- Button announces current state: "Explain From This Page, button" (idle)
- Button announces progress: "Explaining... 4 out of 8 pages, button, disabled" (active)
- Session start is announced via ARIA live region

---

## Related Specs

- **auto-explain-window**: Updated to reflect new UI trigger location
- **ai-sticker-generation**: No changes (generation logic unchanged)
- **context-library**: No changes (context injection unchanged)
