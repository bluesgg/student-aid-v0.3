# Change: Update Auto-Explain Button to Toggle Mode

## Why
The current "Explain From This Page" button is a one-time action that starts an auto-explain session. Users cannot easily cancel an in-progress session or restart after completion. A toggle switch provides clearer state indication and simpler control.

## What Changes
- Replace "Explain From This Page" button with a toggle switch labeled "Auto Explain"
- Remove progress bar and progress text display from the button
- Enable users to turn off auto-explain by clicking the toggle (cancels active session)
- Simplify UI by showing only ON/OFF state without progress details

## Impact
- Affected specs: `auto-explain-window`
- Affected code:
  - `src/features/stickers/components/sticker-panel.tsx` - Toggle button UI
  - `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx` - Toggle handler
