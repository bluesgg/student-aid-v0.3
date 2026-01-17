# Proposal: Relocate Auto-Explain Button to Sticker Panel

## Problem Statement

Currently, the "Start Auto-Explain" functionality has two separate UI entry points that create confusion and redundancy:

1. **PDF Toolbar Button**: "由此页开始讲解" (Chinese) - Triggers intelligent auto-explain session
2. **Sticker Panel Button**: "Explain This Page" (English) - Triggers legacy single-page explanation (now deprecated)

This creates several issues:

- **Confusing UX**: Users see two "explain" buttons with unclear differences
- **Inconsistent Language**: Toolbar button uses Chinese while sticker panel uses English
- **Redundant Functionality**: The legacy single-page explain is replaced by auto-explain but both buttons remain
- **Poor Discoverability**: Auto-explain button is in toolbar (away from stickers), but stickers appear in the middle panel

## Proposed Solution

**Relocate and consolidate** the auto-explain button:

1. **Remove** the auto-explain button from PDF toolbar
2. **Replace** the "Explain This Page" button in sticker panel with a new auto-explain button
3. **Standardize** all UI text to English: "Explain From This Page"
4. **Preserve** the legacy `ExplainPageButton` component (marked as deprecated) for potential future use
5. **Enhance** button to show progress: "Explaining... (3/8 pages)" when session is active

### Visual Changes

**Before:**
```
[PDF Toolbar]
  [Zoom] [Mode] [由此页开始讲解] [Select Images]  ← Auto-explain here

[Sticker Panel Header]
  [Explain This Page]  ← Single-page explain here
```

**After:**
```
[PDF Toolbar]
  [Zoom] [Mode] [Select Images]  ← Auto-explain removed

[Sticker Panel Header]
  [Explain From This Page (3/8 pages)]  ← Auto-explain moved here
```

## User Value

### Benefits

1. **Unified Entry Point**: Single clear button for AI explanations
2. **Better Context**: Button is located next to where stickers appear
3. **Consistent Language**: All UI text in English
4. **Enhanced Feedback**: Progress display shows generation status inline
5. **Cleaner Toolbar**: Reduces toolbar clutter, keeps navigation focused

### User Flow

**Current (Confusing):**
- User sees "由此页开始讲解" in toolbar → clicks → session starts
- User sees "Explain This Page" in sticker panel → clicks → single page only
- User confused about difference

**Proposed (Clear):**
- User opens sticker panel → sees "Explain From This Page"
- User clicks → session starts with progress: "Explaining... (1/8 pages)"
- User understands this generates multiple page explanations
- Progress updates appear in same location

## Key Decisions

### Confirmed

1. **Button Location**: Move to sticker panel header (replace existing button)
2. **Button Text**: "Explain From This Page" (English only)
3. **Progress Display**: Show inline progress: "Explaining... (X/Y pages)"
4. **Button Behavior**: Immediate activation (no confirmation dialog)
5. **Legacy Code**: Keep `ExplainPageButton` component but mark as `@deprecated`
6. **Session States**:
   - Idle: "Explain From This Page" + play icon
   - Starting: "Starting..." + spinner icon
   - Active: "Explaining... (X/Y pages)" + check icon + disabled
7. **Toast Preservation**: Keep `SessionProgressToast` in PDF viewer area (unchanged)

### Assumptions

1. **No API Changes**: This is purely a UI reorganization, no backend changes needed
2. **State Management Architecture**: Lift `useAutoExplainSession` to StudyPage (common parent of PdfViewer and StickerPanel siblings)
3. **Props Flow**: StudyPage → both PdfViewer and StickerPanel (not PdfViewer → StickerPanel)
4. **Progress Data**: Extract from existing `session.progress` (no calculation needed)
5. **Deprecation Timeline**: Legacy button code stays for at least one release cycle
6. **Quality Priority**: Choosing thorough refactoring over quick patches for long-term maintainability

## Non-Goals (Out of Scope)

- ❌ Changing auto-explain core logic (window size, generation strategy)
- ❌ Modifying session cancellation mechanism
- ❌ Altering sticker data structure or API contracts
- ❌ Deleting legacy `ExplainPageButton` component entirely
- ❌ Changing `SessionProgressToast` behavior or location
- ❌ Adding user confirmation dialog before starting session

## Implementation Scope

### Files Modified

1. **src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx** (StudyPage - NEW)
   - Import and call `useAutoExplainSession` hook (move from PdfViewer)
   - Create wrapper handler `handleStartAutoExplain`
   - Pass auto-explain state to both `PdfViewer` and `StickerPanel` as props
   - This lifts state to common parent so siblings can share session data

2. **src/features/reader/components/pdf-viewer.tsx**
   - Remove `useAutoExplainSession` hook import and call (move to StudyPage)
   - Add props: `autoExplainSession`, `onStartAutoExplain`, `isAutoExplainActive`, `isAutoExplainStarting`
   - Accept session state from parent instead of managing internally
   - Keep `SessionProgressToast` and window tracking logic (unchanged)

3. **src/features/stickers/components/sticker-panel.tsx**
   - Replace `ExplainPageButton` with new auto-explain UI
   - Add props: `onStartAutoExplain`, `isAutoExplainActive`, `isAutoExplainStarting`, `autoExplainProgress`
   - Display button states and progress inline

4. **src/features/reader/components/pdf-toolbar.tsx**
   - Remove auto-explain button UI (lines 305-338)
   - Remove auto-explain props from interface (no longer used in toolbar)

5. **src/features/stickers/components/explain-page-button.tsx**
   - Add `@deprecated` JSDoc comment
   - No functional changes

### Files Preserved (Not Deleted)

- `src/features/stickers/components/explain-page-button.tsx` (marked deprecated)
- `src/features/stickers/hooks/use-explain-page.ts` (if exists, marked deprecated)

## Success Metrics

1. **UI Clarity**: Single "Explain From This Page" button visible in sticker panel
2. **Consistency**: All button text in English
3. **Functionality**: Button starts session with same behavior as before
4. **Progress Visibility**: User sees "X/Y pages" progress inline
5. **Code Quality**: No TypeScript errors, all tests pass

## Validation Plan

### Manual Testing

- [ ] Click button in sticker panel starts auto-explain session
- [ ] Button shows correct states: idle → starting → active
- [ ] Progress updates display correctly: "Explaining... (3/8 pages)"
- [ ] Button is disabled during active session
- [ ] Toast still appears at bottom of PDF viewer
- [ ] Cancel button in toast still works
- [ ] No auto-explain button appears in toolbar

### Automated Testing

- [ ] TypeScript compilation passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Existing unit tests pass (if any)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Users confused by button relocation | Low | Medium | Clear button text and progress feedback |
| Props passing breaks | Low | High | Thorough testing of component tree |
| Progress data unavailable | Low | Medium | Fallback to simple active/inactive states |
| Regression in session management | Very Low | High | No logic changes, only UI reorganization |

## Rollback Plan

If issues arise:

1. **Quick Rollback**: Restore auto-explain button to toolbar (revert commit)
2. **Partial Rollback**: Keep both buttons temporarily while investigating
3. **Code Preservation**: Legacy button code is preserved, can be re-enabled quickly

## Dependencies

- **Prerequisite**: `auto-explain-window` spec must be implemented and stable
- **Related Specs**:
  - `auto-explain-window` (unchanged, only UI trigger location changes)
  - `pdf-viewer-interaction` (may need minor update for button location)

## Timeline

- **Proposal & Review**: 0.5 days (completed)
- **Implementation**: 1 day (7-8 hours)
  - State lifting to StudyPage: 2 hours
  - PdfViewer refactoring: 2 hours
  - StickerPanel button UI: 1.5 hours
  - Toolbar cleanup: 0.5 hour
  - Integration: 1-2 hours
- **Testing & QA**: 0.5 days (4 hours)
  - Component integration testing
  - Manual functional testing
  - Edge case validation
- **Total**: ~1.5-2 days (11-12 hours)

**Note**: This timeline reflects **quality-first approach** with thorough refactoring rather than quick patches. The extra time ensures long-term maintainability and cleaner architecture.

## Approval

**This proposal requires Product Manager approval before implementation begins.**

Questions or concerns? Please comment in the proposal review.
