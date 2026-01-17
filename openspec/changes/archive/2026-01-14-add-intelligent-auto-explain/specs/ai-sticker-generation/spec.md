# ai-sticker-generation Spec Delta

This spec delta modifies the `ai-sticker-generation` specification to support sticker version management and cross-page sticker anchoring.

## MODIFIED Requirements

### Requirement: Sticker Version Management
The system SHALL support generating multiple versions of the same sticker and switching between them.

#### Scenario: Initial sticker generation creates version 1
- **GIVEN** user requests auto-explanation for a page
- **WHEN** the system generates stickers
- **THEN** each sticker is created with `current_version = 1`
- **AND** sticker content is stored in `stickers.content_markdown`
- **AND** no entry exists in `sticker_versions` table yet

#### Scenario: Refresh generates version 2
- **GIVEN** a sticker exists with version 1
- **WHEN** user clicks refresh button on the sticker
- **THEN** the system re-extracts text from the sticker's anchored region
- **AND** generates a new explanation using the same prompt structure
- **AND** creates a `sticker_versions` row with `version_number = 1` containing old content
- **AND** updates `stickers.current_version = 2`
- **AND** updates `stickers.content_markdown` with new content

#### Scenario: Second refresh implements circular replacement
- **GIVEN** a sticker has versions 1 and 2
- **WHEN** user clicks refresh again
- **THEN** the system deletes `sticker_versions` row with `version_number = 1`
- **AND** updates existing version 2 row to `version_number = 1`
- **AND** inserts new content as version 2
- **AND** maximum 2 versions are maintained at any time

#### Scenario: Switch to previous version
- **GIVEN** a sticker with `current_version = 2`
- **AND** version 1 exists in `sticker_versions` table
- **WHEN** user clicks left arrow (<image>data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHBhdGggZD0iTSA5IDEyIEwgNSA4IEwgOSA0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo=</image>) button
- **THEN** `stickers.current_version` is updated to 1
- **AND** sticker card displays content from `sticker_versions` WHERE `version_number = 1`
- **AND** right arrow (→) button becomes visible

#### Scenario: Switch back to latest version
- **GIVEN** a sticker with `current_version = 1`
- **AND** version 2 exists in `stickers.content_markdown`
- **WHEN** user clicks right arrow (→) button
- **THEN** `stickers.current_version` is updated to 2
- **AND** sticker card displays `stickers.content_markdown`
- **AND** left arrow (<image>data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHBhdGggZD0iTSA5IDEyIEwgNSA4IEwgOSA0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo=</image>) button becomes visible

#### Scenario: Hide arrows for single-version stickers
- **GIVEN** a sticker with only version 1 (never refreshed)
- **WHEN** sticker card is rendered
- **THEN** no arrow buttons are displayed
- **AND** only refresh button is visible

#### Scenario: Refresh debounce prevents rapid regeneration
- **GIVEN** user clicks refresh button
- **WHEN** API request is in progress (loading state)
- **THEN** refresh button shows loading spinner for at least 3 seconds
- **AND** clicking refresh again has no effect (debounced)
- **WHEN** 3 seconds pass
- **THEN** refresh button becomes clickable again

---

## ADDED Requirements

### Requirement: Cross-Page Sticker Anchoring
The system SHALL support stickers that span multiple pages with accurate range tracking.

#### Scenario: Single-page sticker has null page_range
- **GIVEN** a PPT-type PDF generates 1 sticker per page
- **WHEN** sticker is created for page 10
- **THEN** `sticker.page = 10`
- **AND** `sticker.page_range = null` (not needed for single-page stickers)
- **AND** `sticker.anchor_text` contains text from page 10

#### Scenario: Cross-page sticker stores full range
- **GIVEN** a text-type PDF accumulates paragraphs across pages
- **AND** page 5 ends with 100-word paragraph A
- **AND** page 6 starts with 250-word paragraph B
- **WHEN** system generates sticker for merged content (350 words total)
- **THEN** `sticker.page = 5` (start page for display)
- **AND** `sticker.page_range = { start: { page: 5, y_start: 800, y_end: 850 }, end: { page: 6, y_start: 50, y_end: 200 } }`
- **AND** `sticker.anchor_text` contains first sentence from paragraph A

#### Scenario: Refresh cross-page sticker re-extracts full range
- **GIVEN** a sticker with `page_range = { start: { page: 5, ... }, end: { page: 6, ... } }`
- **WHEN** user clicks refresh
- **THEN** system extracts text from page 5 (y_start: 800, y_end: 850)
- **AND** extracts text from page 6 (y_start: 50, y_end: 200)
- **AND** merges extracted text into single prompt
- **AND** generates new explanation for the full merged content

#### Scenario: Anchor text uses starting paragraph only
- **GIVEN** a cross-page sticker spanning pages 5-6
- **AND** paragraph A (page 5) is "微积分的基本定理指出..."
- **AND** paragraph B (page 6) is "通过积分和导数的关系..."
- **WHEN** system sets `anchor_text`
- **THEN** `anchor_text = "微积分的基本定理指出..."` (only paragraph A)
- **AND** user can locate sticker by finding this text on page 5

#### Scenario: Cross-page sticker highlight shows on start page only
- **GIVEN** a cross-page sticker displayed on page 5
- **WHEN** user hovers over sticker card
- **THEN** highlight overlay appears at `y_start: 800, y_end: 850` on page 5
- **AND** no highlight appears on page 6 (even though content is from page 6)
- **AND** sticker positioning is unambiguous (always on start page)

---

### Requirement: Window-Mode Sticker Generation
The system SHALL support generating stickers for a sliding window of pages instead of single-page requests.

#### Scenario: Window mode generates multiple pages in background
- **GIVEN** user clicks "Start Explaining From This Page" on page 10
- **WHEN** API receives request with `mode = 'window'`
- **THEN** system creates an `auto_explain_sessions` row
- **AND** calculates window range: [8, 15] (currentPage-2 to currentPage+5)
- **AND** starts background generation for all pages in window
- **AND** returns `sessionId` immediately (non-blocking)

#### Scenario: Window generation uses PDF type to select strategy
- **GIVEN** a PPT-type PDF (detected as `pdf_type_detected = 'ppt'`)
- **WHEN** window generation processes page 12
- **THEN** system extracts full page text
- **AND** generates exactly 1 sticker for page 12
- **AND** no paragraph accumulation occurs

#### Scenario: Text PDF uses paragraph accumulation in window
- **GIVEN** a text-type PDF (detected as `pdf_type_detected = 'text'`)
- **WHEN** window generation processes pages 10-12
- **AND** page 10 has 200 words, page 11 has 100 words, page 12 has 150 words
- **THEN** system accumulates paragraphs across page boundaries
- **AND** generates stickers when accumulated words reach 300-500 range
- **AND** may generate cross-page stickers as needed

#### Scenario: Window respects shared cache
- **GIVEN** user requests window generation for pages 8-15
- **AND** pages 8-10 already have cached stickers in `shared_auto_stickers`
- **WHEN** system checks shared cache for each page
- **THEN** pages 8-10 are copied from cache (no API call)
- **AND** pages 11-15 are generated via OpenAI
- **AND** total API calls = 5 instead of 8

#### Scenario: User-regenerated versions bypass shared cache
- **GIVEN** page 10 has a cached sticker (version 1) from shared cache
- **WHEN** user clicks refresh to generate version 2
- **THEN** version 2 is stored only in user's `stickers` and `sticker_versions` tables
- **AND** version 2 is NOT written to `shared_auto_stickers`
- **AND** other users will not see this user's customized version

---

## MODIFIED Requirements

### Requirement: Context-Enhanced Auto-Explanation
_(Extends existing requirement to support window mode)_

#### Scenario: Window mode injects context for each page independently
- **GIVEN** window generation is processing page 12
- **AND** page 12 mentions "chain rule"
- **WHEN** system builds prompt for page 12
- **THEN** context retrieval extracts keywords from page 12 text only
- **AND** retrieves "Chain Rule" definition from context library
- **AND** prompt includes context relevant to page 12
- **AND** no context bleeding from other pages in window

---

## MODIFIED Requirements

### Requirement: Word-Count-Based Sticker Generation
The system SHALL use paragraph accumulation strategy for text PDFs instead of fixed word-count tiers in window mode.

#### Scenario: Text PDF uses paragraph accumulation instead of fixed count
- **GIVEN** a text-type PDF with 500-word page
- **WHEN** window mode generates stickers
- **THEN** system does NOT use old word-count tiers (0-150, 151-300, etc.)
- **AND** instead uses paragraph-based accumulation (300-500 word threshold)
- **AND** may generate 1-2 stickers depending on paragraph structure
- **AND** old logic is only used for `mode='single'` (backward compatibility)

#### Scenario: PPT PDF generates exactly 1 sticker per page regardless of word count
- **GIVEN** a PPT-type PDF page with 50 words
- **WHEN** window mode generates stickers
- **THEN** system generates exactly 1 sticker for the page
- **AND** ignores word count thresholds entirely
- **AND** sticker summarizes the entire slide content

---

## Database Schema Changes

### New Tables

```sql
CREATE TABLE sticker_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number IN (1, 2)),
  content_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (sticker_id, version_number)
);

CREATE INDEX idx_versions_sticker ON sticker_versions(sticker_id);
```

### Modified Tables

```sql
ALTER TABLE stickers
  ADD COLUMN current_version INTEGER DEFAULT 1 CHECK (current_version IN (1, 2)),
  ADD COLUMN page_range JSONB;

COMMENT ON COLUMN stickers.current_version IS 'Currently displayed version (1 or 2)';
COMMENT ON COLUMN stickers.page_range IS 'For cross-page stickers: { start: { page, y_start, y_end }, end: { page, y_start, y_end } }';
```

---

## API Changes

### Modified Endpoint: POST /api/ai/explain-page

**New Request Parameter**:
```typescript
{
  mode?: 'single' | 'window'  // Default: 'single' (backward compatible)
}
```

**Response (mode='window')**:
```typescript
{
  ok: true,
  sessionId: string,
  windowRange: { start: number, end: number },
  pdfType: 'ppt' | 'text'
}
```

### New Endpoint: POST /api/ai/explain-page/sticker/[stickerId]/refresh

**Response**:
```typescript
{
  ok: true,
  sticker: {
    id: string,
    currentVersion: 1 | 2,
    versions: Array<{
      version: 1 | 2,
      contentMarkdown: string,
      createdAt: string
    }>
  }
}
```

### New Endpoint: PATCH /api/ai/explain-page/sticker/[stickerId]/version

**Request**:
```typescript
{
  version: 1 | 2
}
```

**Response**:
```typescript
{
  ok: true,
  sticker: {
    id: string,
    currentVersion: 1 | 2,
    contentMarkdown: string
  }
}
```

---

## Frontend UI Changes

### Sticker Card Component

**New Elements**:
- Left arrow button (<image>data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHBhdGggZD0iTSA5IDEyIEwgNSA4IEwgOSA0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo=</image>): Switch to previous version
- Right arrow button (→): Switch to next version
- Version indicator: "1/2" or "2/2"
- Refresh button (🔄): Generate new version

**Visibility Rules**:
- Single version: Hide arrows, show only refresh
- Two versions: Show both arrows (active arrow depends on current_version)

---

## Backward Compatibility

All changes maintain backward compatibility:

1. **Existing stickers**: `current_version` defaults to 1, `page_range` defaults to null
2. **API mode parameter**: Defaults to `'single'` (preserves old behavior)
3. **Shared cache**: Existing cache entries work unchanged
4. **Version management**: Opt-in feature, does not affect users who don't refresh

---

## Related Specs

- Depends on: `context-library` (context injection unchanged)
- Integrates with: `pdf-reader-modes` (window tracking in scroll mode)
- Extends: `ai-sticker-generation` (base sticker generation logic)
