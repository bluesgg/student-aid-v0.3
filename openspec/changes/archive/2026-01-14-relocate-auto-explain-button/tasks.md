# Implementation Tasks

## Task Checklist

### Phase 1: Update Sticker Panel Component
- [x] **Task 1.1**: Add new props to `StickerPanel` interface
  - Add `onStartAutoExplain?: () => void`
  - Add `isAutoExplainActive?: boolean`
  - Add `isAutoExplainStarting?: boolean`
  - Add `autoExplainProgress?: { completed: number; total: number }`
  - **Validation**: TypeScript compilation passes

- [x] **Task 1.2**: Remove `ExplainPageButton` import and usage
  - Remove import statement from line 8
  - Remove `<ExplainPageButton>` component usage (lines 180-194)
  - **Validation**: Component renders without old button

- [x] **Task 1.3**: Create new auto-explain button UI
  - Add button with three states (idle/starting/active)
  - Add play icon for idle state
  - Add spinner icon for starting state
  - Add check icon + progress text for active state
  - Style: `bg-blue-600`, `rounded-lg`, consistent with toolbar button
  - **Validation**: Button displays correct states visually

- [x] **Task 1.4**: Connect button to `onStartAutoExplain` handler
  - Wire onClick to call `onStartAutoExplain?.()`
  - Disable button when `isAutoExplainActive || isAutoExplainStarting`
  - **Validation**: Click triggers session start (check via console/toast)

- [x] **Task 1.5**: Add progress display logic
  - Calculate progress text: `${completed}/${total} pages`
  - Show only when `isAutoExplainActive && autoExplainProgress`
  - Fallback to "Explaining..." if progress data unavailable
  - **Validation**: Progress updates correctly during session

### Phase 2: Update PDF Toolbar Component
- [x] **Task 2.1**: Remove auto-explain button UI
  - Delete lines 305-338 (auto-explain button block)
  - Remove related comments
  - **Validation**: Toolbar renders without auto-explain button

- [x] **Task 2.2**: Keep props definitions for pass-through
  - Verify `onStartAutoExplain`, `isAutoExplainActive`, `isAutoExplainStarting` remain in interface
  - These props are no longer used in toolbar but needed for PDF viewer
  - **Validation**: TypeScript compilation passes

- [x] **Task 2.3**: Clean up unused imports
  - Check if any imports are now unused after button removal
  - Remove unused imports
  - **Validation**: Linting passes with no warnings

### Phase 3: Lift State to StudyPage (Architecture Refactoring)
- [x] **Task 3.1**: Import hook in StudyPage
  - Open `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx`
  - Import `useAutoExplainSession` from `@/features/reader/hooks/use-auto-explain-session`
  - Add hook call: `const { session, isActive, isStarting, startSession, ... } = useAutoExplainSession(fileId)`
  - **Validation**: TypeScript compilation passes

- [x] **Task 3.2**: Create wrapper handler in StudyPage
  - Create `handleStartAutoExplain` function that calls `startSession`
  - Pass `courseId`, `fileId`, `currentPage`, `pdfType`, `locale` to startSession
  - **Validation**: Handler defined correctly with proper types

- [x] **Task 3.3**: Pass auto-explain props to PdfViewer
  - Update `<PdfViewer>` component props:
    - Add `autoExplainSession={session}`
    - Add `onStartAutoExplain={handleStartAutoExplain}`
    - Add `isAutoExplainActive={isActive}`
    - Add `isAutoExplainStarting={isStarting}`
  - **Validation**: PdfViewer receives props (check via React DevTools)

- [x] **Task 3.4**: Pass auto-explain props to StickerPanel
  - Update `<StickerPanel>` component props:
    - Add `autoExplainSession={session}`
    - Add `onStartAutoExplain={handleStartAutoExplain}`
    - Add `isAutoExplainActive={isActive}`
    - Add `isAutoExplainStarting={isStarting}`
    - Add `autoExplainProgress={session?.progress}`
  - **Validation**: StickerPanel receives props (check via React DevTools)

- [x] **Task 3.5**: Update PdfViewer interface
  - Open `src/features/reader/components/pdf-viewer.tsx`
  - Update `PdfViewerProps` interface to accept:
    - `autoExplainSession?: AutoExplainSession | null`
    - `onStartAutoExplain?: () => void`
    - `isAutoExplainActive?: boolean`
    - `isAutoExplainStarting?: boolean`
  - **Validation**: TypeScript compilation passes

- [x] **Task 3.6**: Remove hook from PdfViewer
  - Remove `import { useAutoExplainSession } from '../hooks/use-auto-explain-session'`
  - Remove hook call (lines 90-97)
  - Remove derived variables: `startSession`, `updateWindow`, `cancelSession`
  - **Validation**: No undefined variable errors

- [x] **Task 3.7**: Use props in PdfViewer logic
  - Replace `session` with `autoExplainSession` (from props)
  - Replace `isActive` with `isAutoExplainActive` (from props)
  - Replace `isStarting` with `isAutoExplainStarting` (from props)
  - Keep `handleStartAutoExplain` callback unchanged (receives from props)
  - **Validation**: All references updated, TypeScript passes

- [x] **Task 3.8**: Update PdfViewer handlers
  - Update `handleStartAutoExplain` to call `onStartAutoExplain?.()` from props
  - Keep `updateWindow` and `cancelSession` logic (still needed for internal use)
  - **Validation**: Handlers work correctly with new props flow

- [x] **Task 3.9**: Verify session state flows to toast
  - Confirm `SessionProgressToast` receives correct session data
  - Check `autoExplainSession` prop is passed correctly
  - **Validation**: Toast displays correct progress

### Phase 4: Mark Legacy Code as Deprecated
- [x] **Task 4.1**: Add deprecation notice to `ExplainPageButton`
  - Add JSDoc comment at top of file:
    ```typescript
    /**
     * @deprecated This component has been replaced by auto-explain functionality in sticker panel.
     * Kept for reference only. Do not use in new code.
     * See: openspec/changes/relocate-auto-explain-button/proposal.md
     */
    ```
  - **Validation**: Comment appears in IDE when hovering over component

- [x] **Task 4.2**: Check for `use-explain-page` hook
  - Search for `src/features/stickers/hooks/use-explain-page.ts`
  - If exists, add same deprecation notice
  - **Validation**: Hook marked as deprecated (if exists)

### Phase 5: UI Text Unification (English Only)
- [x] **Task 5.1**: Verify all button text is English
  - Confirm button text: "Explain From This Page"
  - Confirm loading text: "Starting..."
  - Confirm active text: "Explaining... (X/Y pages)"
  - **Validation**: No Chinese characters in UI

- [x] **Task 5.2**: Check toast messages remain English
  - Verify `SessionProgressToast` uses English text
  - Check for any Chinese strings in related components
  - **Validation**: All user-visible text is English

### Phase 6: Testing & Validation
- [x] **Task 6.1**: Run TypeScript type checking
  - Execute: `pnpm typecheck`
  - Fix any type errors
  - **Validation**: Exit code 0

- [x] **Task 6.2**: Run ESLint
  - Execute: `pnpm lint`
  - Fix any linting warnings
  - **Validation**: Exit code 0, no warnings

- [ ] **Task 6.3**: Manual functional testing
  - Open sticker panel
  - Click "Explain From This Page" button
  - Verify session starts (toast appears)
  - Verify button shows "Starting..." state
  - Wait for first page completion
  - Verify button shows "Explaining... (1/8 pages)"
  - Verify progress updates as pages complete
  - Cancel session via toast
  - Verify button returns to idle state
  - **Validation**: All states work correctly

- [ ] **Task 6.4**: Visual regression testing
  - Compare toolbar before/after (no auto-explain button)
  - Compare sticker panel before/after (new button style)
  - Verify button styling matches design
  - **Validation**: UI appears as expected

- [ ] **Task 6.5**: Edge case testing
  - Test button when PDF is scanned (should not show button)
  - Test button at document beginning (page 1)
  - Test button at document end (last page)
  - Test rapid clicking (should not create duplicate sessions)
  - **Validation**: All edge cases handled correctly

### Phase 7: Documentation & Cleanup
- [x] **Task 7.1**: Update component comments
  - Add comment in `StickerPanel` explaining new button
  - Add comment in `PdfToolbar` explaining button removal
  - **Validation**: Comments are clear and accurate

- [x] **Task 7.2**: Check for orphaned code
  - Search for references to removed button
  - Remove any dead code paths
  - **Validation**: No unused code remains

- [ ] **Task 7.3**: Verify no regressions
  - Test text selection (should still work)
  - Test image selection (should still work)
  - Test reader mode switching (should still work)
  - Test zoom controls (should still work)
  - **Validation**: All existing features work normally

## Completion Criteria

All tasks must be checked off (- [x]) before the change is considered complete.

**Definition of Done:**
1. All checkboxes above are marked complete
2. TypeScript compilation passes with no errors
3. ESLint passes with no warnings
4. Manual testing confirms all functionality works
5. No regressions in existing features
6. Legacy code properly marked as deprecated
7. All UI text is in English


## Implementation Summary

**Completed on**: 2026-01-14

**Files Modified**:
- `src/features/stickers/components/sticker-card.tsx` - Updated StickerPanel interface and added auto-explain button UI with state management
- `src/features/reader/components/pdf-toolbar.tsx` - Removed auto-explain button UI while preserving prop definitions
- `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx` - Lifted auto-explain state to StudyPage component
- `src/features/reader/components/pdf-viewer.tsx` - Refactored to accept auto-explain props instead of managing state locally
- `src/features/stickers/components/explain-page-button.tsx` - Added deprecation notice
- `src/features/reader/components/session-progress-toast.tsx` - Verified English text and correct session data flow

**Remaining Manual Testing Tasks**:
- Task 6.3: Manual functional testing of button states and session management
- Task 6.4: Visual regression testing comparing toolbar and sticker panel before/after
- Task 6.5: Edge case testing for scanned PDFs, page boundaries, and rapid clicks
- Task 7.3: Verify no regressions in text selection, image selection, reader modes, and zoom controls

All automated tasks (phases 1-5, tasks 6.1-6.2, and tasks 7.1-7.2) have been completed successfully.

## Task Dependencies

```
Phase 1 (Sticker Panel) ──┐
                           ├──→ Phase 3 (PDF Viewer)
Phase 2 (PDF Toolbar) ────┘              │
                                          ↓
Phase 4 (Deprecation) ───────────→ Phase 6 (Testing)
Phase 5 (UI Text) ───────────────→       │
                                          ↓
                                    Phase 7 (Cleanup)
```

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 6

**Can be done in parallel**:
- Phase 4 (Deprecation) - independent task
- Phase 5 (UI Text) - can be done alongside Phase 1-3

## Estimated Time

- Phase 1 (Sticker Panel): 1.5 hours
- Phase 2 (PDF Toolbar): 30 minutes
- Phase 3 (State Lifting): 3.5 hours ⬆️ (architecture refactoring)
- Phase 4 (Deprecation): 15 minutes
- Phase 5 (UI Text): 30 minutes
- Phase 6 (Testing): 3 hours ⬆️ (more integration testing needed)
- Phase 7 (Cleanup): 30 minutes

**Total**: ~10 hours (1.5 working days)

**Note**: Additional time in Phase 3 and Phase 6 reflects **quality-first approach**:
- Phase 3: Proper state lifting and component refactoring (vs quick patch)
- Phase 6: Thorough integration testing with new architecture

## Notes

- Keep all changes in a single commit for easy rollback
- Test after each phase to catch issues early
- Document any unexpected issues or deviations from plan
