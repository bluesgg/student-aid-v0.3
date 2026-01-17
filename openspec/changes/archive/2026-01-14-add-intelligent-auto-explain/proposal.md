# Proposal: Intelligent Auto-Explain with Sliding Window

## Problem Statement

The current "Explain This Page" feature requires users to manually click on each page they want to understand. This creates friction in the learning workflow:

- **Manual overhead**: Users must click 100 times to get explanations for a 100-page PDF
- **Waiting time**: Each page requires a separate API call with 3-5 second latency
- **Inflexible segmentation**: The system generates stickers based solely on word count, ignoring document type (PPT slides vs dense textbooks)
- **No version control**: If AI generates a poor explanation, users cannot regenerate or compare alternatives

## Proposed Solution

Transform "Explain This Page" into an **intelligent auto-explanation system** with:

1. **Sliding Window Generation**: Click once to explain the current page + surrounding pages (previous 2, next 5), with automatic expansion as user scrolls
2. **PDF Type Detection**: Automatically identify PPT-style vs text-heavy PDFs and adapt explanation strategy
3. **Sticker Version Management**: Allow users to regenerate explanations and switch between versions (ChatGPT-style arrows)
4. **Cross-Page Sticker Support**: Merge small paragraphs across page boundaries for coherent explanations

### Button Replacement
- **Old**: "Explain This Page" button (removed)
- **New**: "Explain From This Page" button (complete replacement)
- **UI Language**: All UI elements in English

## User Value

**Before**: User on page 10 → clicks "Explain This Page" → waits 5s → sees stickers → navigates to page 11 → clicks again → waits 5s → ...

**After**: User on page 10 → clicks "Start Explaining From This Page" → system generates explanations for pages 8-15 in background → user reads page 10 → scrolls to page 11 → stickers already ready → keeps reading smoothly

**Cost Efficiency**:
- PPT PDFs: 1 sticker per page (100 pages = 100 API calls)
- Text PDFs: Merge small paragraphs across pages to avoid fragmented requests
- Image explanations: Users manually select images (existing feature), independent of window mode

## Key Decisions

### Confirmed by User
1. **Session Limit**: Maximum 1 active auto-explain session per user per file
2. **Type Detection Caching**: Store detected PDF type in `files.pdf_type_detected` field
3. **Shared Cache Isolation**: User-regenerated sticker versions do NOT write to `shared_auto_stickers` table
4. **UI Language**: All UI elements (buttons, toasts, labels) use English
5. **Button Replacement**: "Explain From This Page" completely replaces "Explain This Page" functionality
6. **Window Mode Strategy**: Window mode generates text-only stickers (paragraph accumulation), no automatic image detection
7. **User Image Selection**: Users manually select image regions (existing feature), triggers single-page regeneration with `with_selected_images` mode
8. **Error Handling**: Session continues on individual page failures (no cancellation)

### Assumptions (Pending Confirmation)
4. **Window Expansion Strategy**: Assume continuous expansion (pages 8-15 → 9-16 → 10-17) until user stops or jumps
5. **Type Detection Timing**: Run detection on first "Start Explaining" click, not during upload
6. **Cost Transparency**: No confirmation dialog; start generation immediately
7. **Jump Detection**: Any navigation >10 pages away from current window triggers jump (cancels old requests)
8. **Version Limit**: Circular replacement - 3rd regeneration overwrites version 1
9. **Shared Cache Write**: New stickers DO write to shared cache (version 1 only)

## Window Mode + Image Selection Interaction

Window mode generates **text-only stickers** using paragraph accumulation. Image explanations are handled separately through user manual selection:

**User Manual Image Selection** (existing feature):
- User draws rectangle around diagram on any page
- System calls POST /api/ai/explain-page with `effectiveMode='with_selected_images'`
- Generates image-based sticker with reference context derivation

**During Active Window Session**:
- User can still manually select images on any page
- If page is in window range [8-15]: image selection replaces auto-generated text sticker for that page
- If page is outside window: image sticker generated independently
- Window session continues processing other pages normally

**Implementation**: Window mode and image selection are **independent features** that can coexist. No automatic image detection in window mode.

## Open Questions

**Q1**: If user rapidly scrolls from page 10 → page 50, should the system:
- (A) Generate all pages 8-55 (expensive but complete)
- (B) Cancel pages 12-47 and only generate 48-55 (cheaper, gaps exist)

**Q2**: For cross-page stickers (e.g., paragraph A on page 5, paragraph B on page 6):
- Anchor text should be: (A) Only paragraph A, (B) Merged A+B first 50 chars, or (C) AI-generated title?

**Q3**: PDF type detection metrics - which combination provides best accuracy:
- Image ratio weight 40% + text density 30% + layout 20% + metadata 10%?
- Different thresholds for identifying PPT type (currently >0.6 composite score)?

## Non-Goals (Out of Scope)

- ❌ Multi-PDF batch explanation (future consideration)
- ❌ Per-page type detection (entire PDF treated as single type)
- ❌ Session persistence across browser restarts (sessions are ephemeral)
- ❌ Custom window size configuration (fixed at -2/+5 pages)
- ❌ Sticker version history beyond 2 versions
- ❌ Separate "Explain This Page" button (completely replaced by new button)

## Success Metrics

1. **User Experience**: Average time to read 20 pages with AI explanations decreases from 200s (20 pages × 10s latency) to <30s (click once + background generation)
2. **Cost Efficiency**: Requests per 100-page PDF:
   - PPT type: ~100 requests (1 per page)
   - Text type: ~150-200 requests (1.5-2 per page average)
   - Baseline (current): ~300-500 requests if user explains every page
3. **Type Detection Accuracy**: >90% correct classification on sample dataset (10 PPT PDFs, 10 textbooks)

## Implementation Phases

See `tasks.md` for detailed breakdown.

1. **Phase 1**: Database schema + PDF type detection (2 days)
2. **Phase 2**: Sliding window session management (3 days)
3. **Phase 3**: Sticker version management (2 days)
4. **Phase 4**: Frontend integration (2 days)

**Total Estimated Effort**: 9 days

## Dependencies

- Existing: `ai-sticker-generation` spec (modifies sticker generation behavior)
- Existing: `context-library` spec (context injection unchanged)
- Existing: `pdf-reader-modes` spec (window tracking integrates with scroll mode)
- New: Database migration for `auto_explain_sessions` and `sticker_versions` tables

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User scrolls too fast → request storm | Medium | High | AbortController cancellation + max 3 concurrent requests |
| Type detection inaccurate | Low | Medium | Multi-dimensional scoring + user feedback loop |
| Cross-page sticker positioning confusing | Medium | Medium | Always place on start page + store full page_range |
| Shared cache version conflicts | Low | Low | Only version 1 writes to shared cache, user versions separate |

## Alternatives Considered

1. **Whole-PDF batch processing**: Rejected due to cost explosion (500-page PDF = $50+ per user)
2. **Per-page type detection**: Rejected due to complexity (mixed-type PDFs are rare)
3. **Unlimited version history**: Rejected due to storage cost (most users only need current + previous)
