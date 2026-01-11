# Change: Add Term Dropdown with Auto-Selection

## Why
Currently, users must manually type the term (e.g., "Spring 2025") when creating a course, which can lead to inconsistent formatting and requires extra typing. A dropdown with predefined term options and automatic selection of the current term will improve UX consistency and reduce friction.

## What Changes
- Replace free-text "Term" input with a dropdown select component
- Auto-calculate and select the current academic term based on the current date
- Provide standard term options (Winter, Spring, Fall) with years

## Impact
- Affected specs: `course-management`
- Affected code:
  - `src/features/courses/components/create-course-dialog.tsx` - UI component
  - May need utility function for term calculation
- User experience: Faster course creation with consistent term formatting

## Acceptance Criteria

### Functional Requirements
- [ ] **Dropdown Rendering**: Term field displays as a `<select>` dropdown (not text input) in the "New course" dialog
- [ ] **Term Options**: Dropdown contains exactly 9 term options covering 3 years (previous, current, next)
- [ ] **Term Format**: All term options follow the format "[Season] [Year]" (e.g., "Winter 2026", "Fall 2025")
- [ ] **Seasons Included**: Each year includes three terms: Winter, Spring, Fall
- [ ] **Chronological Order**: Terms are ordered chronologically (earliest to latest)

### Auto-Selection Logic
- [ ] **Default Selection**: When dialog opens, a term is pre-selected (not blank)
- [ ] **Current Term Accuracy**: Pre-selected term matches the current academic term based on today's date
- [ ] **Date-Based Logic**:
  - January-April → Winter [current year]
  - May-August → Spring [current year]
  - September-December → Fall [current year]

### User Interaction
- [ ] **Dropdown Clickable**: User can click/tap the dropdown to see all options
- [ ] **Selection Works**: User can select any term from the dropdown
- [ ] **Visual Feedback**: Selected term is visually indicated in the dropdown
- [ ] **Form Validation**: Term field still enforces "required" validation
- [ ] **Form Submission**: Creating a course with selected term works correctly

### Data & Integration
- [ ] **Value Persisted**: Selected term value is correctly saved to the database in `courses.term` field
- [ ] **Value Format**: Database stores term in consistent format (e.g., "Spring 2025")
- [ ] **Display Consistency**: Created course displays term correctly in P3 (course list) and P4 (course details)
- [ ] **Backward Compatible**: Existing courses with free-text terms still display correctly

### Code Quality
- [ ] **Type Safety**: No TypeScript errors (`pnpm typecheck` passes)
- [ ] **Linting**: No linting errors (`pnpm lint` passes)
- [ ] **No Console Errors**: Browser console shows no errors when using the dropdown
- [ ] **Accessible**: Dropdown has proper labels and can be navigated via keyboard

### Edge Cases
- [ ] **Year Boundary**: Term auto-selection works correctly when tested on December 31st or January 1st
- [ ] **Rapid Clicks**: Double-clicking "Create" button doesn't cause issues (existing protection still works)
- [ ] **Existing Functionality**: Cancel button, error handling, and loading states still work as before
