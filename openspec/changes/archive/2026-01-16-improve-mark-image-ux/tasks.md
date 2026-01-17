# Tasks: Improve Mark Image UX

## 1. UI Text Changes

- [x] 1.1 Rename toolbar button from "Add Image" to "Mark Image" in `pdf-toolbar.tsx`
- [x] 1.2 Add i18n keys for new button text in `en.json`:
  - `reader.markImage` = "Mark Image"
  - `reader.exitMarkMode` = "Exit"
  - `reader.noImageDetected` = "No image detected at this position"
  - `reader.drawManually` = "Draw manually"
- [x] 1.3 Add corresponding Chinese translations in `zh.json`:
  - `reader.markImage` = "标记图片"
  - `reader.exitMarkMode` = "退出"
  - `reader.noImageDetected` = "此位置未检测到图片"
  - `reader.drawManually` = "手动框选"

## 2. Hover Highlight Visibility

- [x] 2.1 Update `HIGHLIGHT_COLORS.hover.border` from `border-primary/40` to `border-blue-500`
- [ ] 2.2 Verify hover state is clearly visible on various PDF backgrounds (light/dark)

## 3. Click-to-Mark Mode

- [x] 3.1 Replace current selection mode behavior when auto-detection is enabled:
  - Current: "Add Image" → enters rectangle drawing mode
  - New: "Mark Image" → enters click-to-mark mode
- [x] 3.2 In click-to-mark mode, clicking on a detected image triggers explain flow (same as normal click)
- [x] 3.3 In click-to-mark mode, clicking empty area shows no-image-detected popup

## 4. No-Image-Detected Popup

- [x] 4.1 Create `NoImageDetectedPopup` component with:
  - Message: "No image detected at this position"
  - "Draw manually" button
  - Dismiss on outside click or ESC
- [x] 4.2 When "Draw manually" clicked:
  - Dismiss popup
  - Enter rectangle drawing mode (legacy selection mode)
- [x] 4.3 Position popup near click location (constrained to viewport bounds)
- [x] 4.4 Add fade + scale animation (150ms ease-out) on popup appearance

## 5. Testing

- [ ] 5.1 Verify button label changes in both EN and ZH locales
- [ ] 5.2 Verify hover highlight is visually distinct
- [ ] 5.3 Test click-to-mark flow on PDF with detected images
- [ ] 5.4 Test no-image-detected popup appears on empty area click
- [ ] 5.5 Test "Draw manually" transitions to rectangle mode correctly
