# Change: Improve Mark Image UX

## Why

The current "Add Image" button flow has usability issues:

1. **Label confusion** - "Add Image" doesn't clearly communicate the action. Users expect to "mark" or "tag" an image, not "add" it. Chinese label should be "标记图片" (Mark Image).

2. **Unnecessary friction** - After clicking "Add Image", users must draw a rectangle. But if images are already auto-detected, users should just click on the missed image position to mark it.

3. **Poor failure feedback** - When a click doesn't hit any detected image, the current "click-miss" feedback just highlights existing images for 2 seconds with no clear action path.

4. **Subtle hover highlights** - The current hover border uses `border-primary/40` (40% opacity) which is too subtle. Users may not notice the clickable images.

## What Changes

- **MODIFIED**: Rename "Add Image" to "Mark Image" (EN) / "标记图片" (ZH)
- **NEW**: Click-to-mark mode - when button is clicked, user can click anywhere to detect/add image at that position
- **NEW**: No-image-detected popup - when click hits no image, show popup with:
  - Message: "No image detected at this position"
  - Button: "Draw manually" that enables rectangle drawing mode
- **MODIFIED**: Make hover highlight border more visible with solid colored border (no opacity)

## Impact

- **Affected specs**: `pdf-viewer-interaction`
- **Affected code**:
  - `src/features/reader/components/pdf-toolbar.tsx` - Button text change
  - `src/features/reader/components/image-detection-overlay.tsx` - Hover styles
  - `src/features/reader/components/pdf-viewer.tsx` - Click-to-mark mode logic
  - `src/i18n/messages/en.json` - Add i18n keys
  - `src/i18n/messages/zh.json` - Add i18n keys

## Non-Goals (This Iteration)

- AI-based image detection at click position (use manual rectangle as fallback)
- Changing the auto-detection algorithm itself
- Adding multiple mark modes or settings

## Technical Decisions

1. **Button modes**: One button with two modes:
   - Default: "Mark Image" - enters click-to-mark mode
   - Active: "Exit" - exits mark mode (same as current selection mode exit)

2. **Click handling in mark mode**:
   - If click hits a detected image rect → trigger explain flow
   - If click misses all detected images → show failure popup

3. **Failure popup**: Simple dialog component with dismiss on outside click

4. **Hover styles**: Change from `border-primary/40` to `border-blue-500` for solid visible border
