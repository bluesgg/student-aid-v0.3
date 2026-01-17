# Changelog

All notable changes to the StudentAid project from v2.0 onwards.

---

## [Released] - 2026-01-16

### Improved Mark Image UX (`improve-mark-image-ux`)

**Why**: The "Add Image" button had usability issues: confusing label ("Add" vs "Mark"), unnecessary manual rectangle drawing after auto-detection, poor click-miss feedback, and subtle hover highlights (40% opacity) that users didn't notice.

**Key Changes**:
- Renamed button: "Add Image" → "Mark Image" (EN) / "标记图片" (ZH)
- Click-to-mark mode: Click anywhere to detect/add image at that position
- No-image-detected popup: Shows "No image detected" message with "Draw manually" button for rectangle mode
- Enhanced hover highlights: Solid colored border (border-blue-500) instead of subtle 40% opacity
- Two-mode button behavior: "Mark Image" enters mode, "Exit" leaves mode

**Impact**:
- Modified: `src/features/reader/components/pdf-toolbar.tsx` (button text)
- Modified: `src/features/reader/components/image-detection-overlay.tsx` (hover styles)
- Modified: `src/features/reader/components/pdf-viewer.tsx` (click-to-mark logic)
- Modified: i18n files (`en.json`, `zh.json`)

**Non-Goals**: AI-based image detection at click position, changing auto-detection algorithm, multiple mark modes

**Status**: Archived

### Auto Image Detection with Click-to-Explain (`add-auto-image-detection`)

**Why**: Manual rectangle drawing for images is tedious (precise mouse coordination), error-prone (missing boundaries), and slow (multiple steps). Users should be able to simply click on any image for instant explanation.

**Key Changes**:
- Auto image extraction on PDF upload (alongside context extraction)
- Click-on-image detection using PDF.js OPS parsing (`getOperatorList()` with `OPS.paintImageXObject`)
- Hover highlight always showing detected images (no mode toggle needed)
- Click-miss feedback showing all clickable images
- Cross-user image explanation cache (same PDF file by binary hash)
- Feedback collection for incorrect detections
- "Add Image" button for manual rectangle drawing when auto-detection misses
- Removed "Image Explain Mode" toggle (hover highlights always on)
- Removed image content hash deduplication (each image treated independently)

**Hybrid Extraction Strategy**:
- PDFs ≤50 pages: Extract all pages on upload
- PDFs >50 pages: Extract first 50 pages on upload, remaining pages lazily on view
- Extraction status UI: Progress indicator for large PDFs

**Impact**:
- New table: `detected_images` for storing extracted image positions
- New column: `extraction_status` on files table
- New: `src/lib/pdf/image-extractor.ts` (extract image positions)
- New: `src/features/reader/hooks/use-image-detection.ts` (detection hook)
- New: `src/features/reader/components/image-overlay.tsx` (hover highlights)
- New: `src/features/reader/components/image-extraction-status.tsx` (progress indicator)
- New: `src/app/api/files/[fileId]/images/route.ts` (image metadata API with lazy detection)
- Modified: `src/app/api/files/[fileId]/extract/route.ts` (include image extraction)
- Modified: `src/features/reader/components/pdf-viewer.tsx` (simplified click handler)
- Modified: `src/features/reader/components/pdf-toolbar.tsx` ("Add Image" button)
- Modified: `src/lib/stickers/shared-cache.ts` (image-based cache lookup)
- Modified spec: `pdf-viewer-interaction`

**Technical Decisions**:
- Primary detection: PDF.js `getOperatorList()` with `OPS.paintImageXObject`
- Fallback: Manual rectangle drawing (no AI fallback)
- No deduplication within same PDF (each image generates separate explanation)
- Cache scope: Same PDF file shares detected images cross-user
- Context: Page text included with image for better explanations
- Trigger: All explanations user-triggered (click image), not auto-generated
- Privacy: Reuses existing `share_to_cache` preference
- PDF type handling: Different filtering heuristics for PPT vs textbook PDFs

**Non-Goals**: AI-based decorative image filtering, AI detection fallback (DETR), OCR, cross-PDF deduplication, same-PDF image deduplication, detection sensitivity settings, vector graphics, auto-generation on detection

**Status**: Archived

---

## [Released] - 2026-01-15

### Settings Page with Language & Usage (`add-language-settings`)

**Why**: Users need independent control over UI language and AI explanation language for optimal learning experience. Usage statistics should be integrated into a unified Settings page.

**Key Changes**:
- New `/settings` page with tab layout (Language | Usage)
- Moved Usage page content into Settings as a tab
- New `user_preferences` table with `ui_locale` and `explain_locale` fields
- First-login language selection modal for new users
- Full-site i18n using `next-intl` for UI text
- All AI API calls accept `explain_locale` parameter
- Header navigation: "Usage" link replaced with "Settings"
- Page refresh on language change (no hot-swap)

**Impact**:
- Database: New migration for `user_preferences` table
- Components: Updated `app-header.tsx`, new Settings page
- API: All AI routes accept `explain_locale`
- Languages: English (en) and Chinese (zh) only

**Non-Goals**: Additional languages, guest language preferences, real-time switching, content translation

**Status**: Archived

---

## [Released] - 2026-01-14

### Auto-Explain Button Relocation (`relocate-auto-explain-button`)

**Why**: Two separate "explain" buttons (toolbar and sticker panel) created confusion with inconsistent language (Chinese vs English) and redundant functionality.

**Key Changes**:
- Removed auto-explain button from PDF toolbar
- Replaced "Explain This Page" button in sticker panel with "Explain From This Page"
- Standardized all UI text to English
- Added progress display: "Explaining... (X/Y pages)" when session is active
- Preserved legacy `ExplainPageButton` component (marked deprecated)
- Lifted `useAutoExplainSession` state to StudyPage (common parent)

**Impact**:
- Modified: `src/app/(app)/courses/[courseId]/files/[fileId]/page.tsx` (state lifting)
- Modified: `src/features/reader/components/pdf-viewer.tsx` (accept props)
- Modified: `src/features/stickers/components/sticker-panel.tsx` (new button UI)
- Modified: `src/features/reader/components/pdf-toolbar.tsx` (removed button)
- Deprecated: `src/features/stickers/components/explain-page-button.tsx`

**Non-Goals**: Changing auto-explain core logic, modifying session cancellation, deleting legacy components

**Status**: Archived

### Intelligent Auto-Explain with Sliding Window (`add-intelligent-auto-explain`)

**Why**: Manual page-by-page explanation requires 100 clicks for 100-page PDFs with 3-5 second latency per page. Fixed word-count segmentation ignores document type (slides vs textbooks).

**Key Changes**:
- Sliding window generation: Click once to explain current page + surrounding pages (previous 2, next 5)
- Automatic expansion as user scrolls
- PDF type detection: Identify PPT-style vs text-heavy PDFs
- Sticker version management: Regenerate explanations and switch between versions
- Cross-page sticker support: Merge small paragraphs across page boundaries
- Button replacement: "Explain This Page" → "Explain From This Page"
- Session limit: Maximum 1 active auto-explain session per user per file

**Impact**:
- New tables: `auto_explain_sessions`, `sticker_versions`
- Modified: AI sticker generation behavior
- Modified: Context injection (unchanged logic)
- Integration with scroll mode for window tracking

**Success Metrics**:
- Time to read 20 pages with AI: 200s → <30s
- Requests per 100 pages: PPT ~100, Text ~150-200 (vs 300-500 baseline)
- Type detection accuracy: >90%

**Non-Goals**: Multi-PDF batch processing, per-page type detection, session persistence across restarts, custom window size

**Status**: Archived

### Shared Context Library (`add-shared-context-library`)

**Why**: AI features (auto-explain, Q&A) only see current page content. When pages reference concepts from previous pages or other documents, AI lacks context for accurate explanations.

**Key Changes**:
- Two-layer architecture: `pdf_context_entries` (shared content) + `user_context_scope` (user associations)
- Automatic extraction on first PDF open using GPT-4o-mini
- Cross-user sharing via `pdf_hash`
- Entry types: Definition, Formula, Theorem, Concept, Principle
- Smart retrieval: LLM keyword extraction + context library matching
- Word-based batching: 3000-5000 words/batch adapts to PDF density
- Quality control: AI self-scoring (>=0.7 threshold) + deduplication
- English-first strategy: Auto-translate non-English content
- Fault tolerance: Automatic retry with checkpoint resume

**Impact**:
- New tables: `pdf_context_entries`, `user_context_scope`
- Progress display in P4 file list (real-time via Supabase Realtime)
- Toast notification on completion
- Usage limits: 20 PDF extractions per user per month
- Storage limits: 5GB/user, 50 files/course, 100MB/file, 200 pages/file

**Cost Analysis**:
- Per 100-page PDF: ~$0.03
- With 70% cache hit rate: $0.009 per user per common PDF
- Monthly (1000 users): $80-120 target, $150 hard ceiling

**Success Metrics**:
- Week 1 validation: >20% improvement in AI accuracy with context
- Processing time: Slides (100 pages) <1 min, Textbook (200 pages) 2-3 min
- 95%+ extraction success rate
- Context retrieval adds <200ms latency

**Non-Goals**: Context browsing UI (v1.1), manual entry management, summary features, cross-course global library, vector embeddings/RAG, real-time extraction

**Status**: Archived

---

## [Released] - 2026-01-13

### PDF Continuous Scroll Mode (`add-pdf-continuous-scroll`)

**Why**: Page-by-page navigation with prev/next buttons doesn't match user expectations. Modern PDF viewers provide continuous scroll for natural reading experience.

**Key Changes**:
- New reading mode toggle: `Page` (existing) vs `Scroll` (new) in PDF toolbar
- Continuous scroll rendering: Multiple pages vertically with proper spacing
- Current page tracking: Page with highest visible area in viewport
- Persistent preference: localStorage + URL state (?mode=scroll|page)
- Virtual scrolling: react-window for consistent performance
- Keyboard accessibility: Tab/Enter/Space, native scroll keys
- Screen reader support: ARIA labels and live regions

**Integration with Existing Features**:
- Page navigation: Prev/Next scroll to target page in scroll mode
- Sticker interaction: Click navigates to target page in both modes
- Sticker highlighting: Hover works for visible pages only
- AI features: Use current page in both modes
- Last read page: Updates based on current page with debounce
- Image region selection: Fully compatible

**Impact**:
- New spec: `pdf-reader-modes`
- Modified: `pdf-viewer.tsx`, `pdf-toolbar.tsx`, `virtual-pdf-list.tsx`, `use-page-navigation.tsx`
- No backend changes
- Existing: `react-pdf`, `react-window`, `pdfjs-dist`

**Non-Goals**: Mobile-specific adaptations, custom keyboard shortcuts, backend API changes, per-document mode memory, print layout optimization

**Status**: Archived

---

## [Released] - 2026-01-12

### PDF Image Region Selection Mode (`add-pdf-image-region-selection-mode`)

**Why**: "Explain this page" analyzes entire pages. Users cannot focus AI explanation on specific regions like individual diagrams, formulas, or charts among multiple elements on a page.

**Key Changes**:
- "Select images" mode toggle in PDF toolbar
- Draw rectangular selections with crosshair cursor
- Multi-page support: Switch pages while in selection mode
- Immediate generation: Each region add/delete triggers new explain-page request
- Visual feedback: Selected regions show colored border + translucent fill
- Hover sticker → highlights bound regions in PDF
- Delete button (×) on each region overlay
- Root page concept: First page in mode becomes explanation anchor for cross-page selections

**Technical Implementation**:
- Frontend: Selection mode state, overlay layer, normalized rect storage (0..1 coordinates)
- Backend: Multipart form upload support, new `effective_mode: 'with_selected_images'`
- Data model: `Sticker.anchor.anchors[]` with TextAnchor + ImageAnchor types
- Cache strategy: `selection_hash = SHA256({ root_page, effective_mode, locale, sorted_regions })`
- Reference context derivation: Search for labels (e.g., "Figure 7") and use surrounding text
- Quota semantics: Cached hits for `with_selected_images` mode still consume quota

**Impact**:
- Modified spec: `ai-sticker-generation` (new effective mode, extended anchor structure)
- New spec: `pdf-viewer-interaction` (selection mode UI)
- Frontend: New `pdf-region-overlay.tsx`, modified `pdf-viewer.tsx`, `pdf-toolbar.tsx`, `sticker-panel.tsx`
- Backend: Multipart parsing in explain-page API, `selection_hash` computation
- Database: Migration for `shared_auto_stickers.selection_hash` column + indexes

**Success Criteria**:
- Draw regions across multiple pages with persistence
- Add/delete triggers generation with current selection set
- Generated sticker binds to all selected regions
- Hover highlights all bound regions
- Scanned PDFs return proper error
- Cache hits work across users with identical selections

**Non-Goals**: Non-rectangular selections, per-region progress UI, region resize/move/undo, auto-navigation on sticker click, OCR for scanned PDFs

**Status**: Archived

---

## Version History

- **v2.0** (2026-01-12 to present): Advanced PDF interaction features, intelligent AI explanations, internationalization
- **v1.x**: Core MVP features (authentication, course management, PDF upload, basic AI explanations)

---

## Notes

- All dates follow YYYY-MM-DD format
- Each feature includes `Why`, `What`, `Impact`, and `Non-Goals` sections from OpenSpec proposals
- Breaking changes are explicitly marked
- All listed changes are released and archived
- Cost analysis and success metrics included where applicable
