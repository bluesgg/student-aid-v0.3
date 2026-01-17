# auto-explain-window Specification

## Purpose
Defines the behavior of sliding window auto-explanation sessions, including PDF type detection, window management, and concurrent request control.

## ADDED Requirements

### Requirement: PDF Type Detection
The system SHALL automatically detect whether a PDF is PPT-style or text-heavy based on content analysis.

#### Scenario: Detect PPT-style PDF
- **GIVEN** a PDF created from PowerPoint with Creator="Microsoft® PowerPoint®"
- **AND** average page has 150 words and 40% image area
- **WHEN** system calculates type score
- **THEN** metadata score contributes 0.1
- **AND** image ratio score contributes 0.4
- **AND** text density score contributes 0.3
- **AND** total composite score = 0.8 (> 0.6 threshold)
- **AND** PDF is classified as `'ppt'`

#### Scenario: Detect text-heavy PDF
- **GIVEN** a textbook PDF with 800 words per page and 5% image area
- **WHEN** system calculates type score
- **THEN** image ratio score contributes 0.0 (5% < 30% threshold)
- **AND** text density score contributes 0.0 (800 > 500 words threshold)
- **AND** total composite score = 0.0-0.2 (< 0.6 threshold)
- **AND** PDF is classified as `'text'`

#### Scenario: Cache type detection result
- **GIVEN** PDF type is detected as 'ppt' for file_id='abc123'
- **WHEN** system stores result
- **THEN** `files.pdf_type_detected` is updated to 'ppt'
- **WHEN** user opens the same PDF again
- **THEN** system reads cached value from database
- **AND** does not re-run type detection algorithm

#### Scenario: Type detection on first window request only
- **GIVEN** a newly uploaded PDF with no cached type
- **WHEN** user clicks "Start Explaining From This Page" for the first time
- **THEN** system runs type detection (samples first 5 pages)
- **AND** caches result in `files.pdf_type_detected`
- **AND** uses detected type for current and future window sessions

#### Scenario: Scanned PDF defaults to text type
- **GIVEN** a scanned PDF (is_scanned = true)
- **WHEN** type detection attempts to analyze content
- **THEN** text extraction returns minimal text
- **AND** system defaults to `'text'` type
- **AND** proceeds with image-based sticker generation

---

### Requirement: Sliding Window Initialization
The system SHALL create an auto-explain session with a sliding window when user requests window mode.

#### Scenario: Initialize window on page 10
- **GIVEN** user is viewing page 10 of a 100-page PDF
- **WHEN** user clicks "Start Explaining From This Page"
- **THEN** API creates `auto_explain_sessions` row with:
  - `user_id`: current user
  - `file_id`: current file
  - `start_page`: 10
  - `window_start`: 8 (currentPage - 2)
  - `window_end`: 15 (currentPage + 5)
  - `status`: 'active'
- **AND** returns `sessionId` and `windowRange: { start: 8, end: 15 }`

#### Scenario: Enforce single active session per file
- **GIVEN** user already has an active session for file_id='abc123'
- **WHEN** user clicks "Start Explaining From This Page" again on same file
- **THEN** API returns 409 Conflict error
- **AND** error message: "Auto-explain session already active for this file. Please wait for completion or cancel existing session."
- **AND** no new session is created

#### Scenario: Allow concurrent sessions for different files
- **GIVEN** user has active session for file_id='abc123'
- **WHEN** user opens different file_id='def456' and clicks "Start Explaining"
- **THEN** API creates new session successfully
- **AND** both sessions run concurrently (different files)

#### Scenario: Window at beginning of document
- **GIVEN** user is on page 2 of a 100-page PDF
- **WHEN** user starts window generation
- **THEN** `window_start` = max(1, 2-2) = 1 (clamp to first page)
- **AND** `window_end` = 2+5 = 7
- **AND** window size = 7 pages (not 8)

#### Scenario: Window at end of document
- **GIVEN** user is on page 98 of a 100-page PDF
- **WHEN** user starts window generation
- **THEN** `window_start` = 98-2 = 96
- **AND** `window_end` = min(98+5, 100) = 100 (clamp to last page)
- **AND** window size = 5 pages (not 8)

---

### Requirement: Window Expansion on Scroll
The system SHALL expand the window range as user scrolls through the document.

#### Scenario: Extend window on next page
- **GIVEN** active session with window [10, 17]
- **AND** current page = 12
- **WHEN** user scrolls to page 13 (currentPage changes)
- **THEN** client calls `PATCH /session/[id]` with `currentPage: 13, action: 'extend'`
- **AND** new window calculated: [11, 18]
- **AND** API starts generation for page 18 only (page 11-17 already processed)
- **AND** session updated: `window_start=11, window_end=18`

#### Scenario: No expansion if page within current window
- **GIVEN** active session with window [10, 17]
- **AND** current page = 12
- **WHEN** user scrolls to page 13 (still within [10, 17])
- **THEN** client calls `PATCH /session/[id]`
- **AND** window remains [10, 17] (no change needed)
- **AND** no new page generation is triggered

#### Scenario: Debounce rapid scrolling
- **GIVEN** user rapidly scrolls from page 10 → 11 → 12 → 13 within 1 second
- **WHEN** scroll events fire
- **THEN** client debounces currentPage updates (300ms)
- **AND** only final page (13) triggers PATCH request
- **AND** intermediate pages (11, 12) are skipped for API calls

---

### Requirement: Jump Detection and Request Cancellation
The system SHALL cancel in-progress requests when user jumps to distant pages.

#### Scenario: Detect jump (>10 pages away)
- **GIVEN** active session with window [10, 17]
- **AND** pages 12-17 are currently generating
- **WHEN** user navigates to page 50 (50 - 12 = 38 pages away)
- **THEN** client detects jump (distance > 10)
- **AND** calls `PATCH /session/[id]` with `action: 'jump'`

#### Scenario: Cancel requests outside new window
- **GIVEN** jump detected, old window [10, 17], new current page = 50
- **WHEN** API processes jump action
- **THEN** new window calculated: [48, 55]
- **AND** all `AbortController` instances for pages 12-17 are aborted
- **AND** API requests return 499 (Client Closed Request)
- **AND** session updated: `window_start=48, window_end=55, active_requests=[]`

#### Scenario: Jump via page number input
- **GIVEN** user types "75" in page number input and presses Enter
- **AND** current page was 15
- **WHEN** page navigation completes
- **THEN** currentPage change triggers jump detection (75 - 15 = 60)
- **AND** old window requests are canceled
- **AND** new window [73, 80] starts generation

#### Scenario: Jump via table of contents click
- **GIVEN** user clicks chapter 5 link in TOC (jumps to page 45)
- **AND** current page was 12
- **WHEN** page navigation completes
- **THEN** jump is detected and handled same as manual navigation

---

### Requirement: Concurrency Control
The system SHALL limit concurrent OpenAI API requests to prevent rate limiting and cost explosion.

#### Scenario: Enforce maximum 3 concurrent requests per session
- **GIVEN** window generation starts for pages [10, 17] (8 pages)
- **WHEN** system begins generation
- **THEN** first 3 pages (10, 11, 12) start immediately
- **AND** remaining pages (13-17) are queued
- **WHEN** page 10 completes
- **THEN** page 13 starts (maintains 3 concurrent)
- **AND** this pattern continues until all pages are done

#### Scenario: Track active requests in session
- **GIVEN** pages 10, 11, 12 are currently generating
- **WHEN** session state is queried
- **THEN** `active_requests = [{ page: 10, requestId: "req1" }, { page: 11, requestId: "req2" }, { page: 12, requestId: "req3" }]`
- **AND** client can display progress: "Generating: Pages 10, 11, 12"

#### Scenario: Abort request frees concurrency slot
- **GIVEN** 3 requests active for pages 10, 11, 12
- **AND** page 13 is queued
- **WHEN** user jumps to page 50 (aborts all 3 requests)
- **THEN** `active_requests` becomes empty
- **AND** new window pages 48-50 immediately start (up to 3 concurrent)

---

### Requirement: PDF Type-Specific Generation Strategy
The system SHALL use different sticker generation strategies based on detected PDF type.

#### Scenario: PPT PDF generates one sticker per page
- **GIVEN** session has `pdf_type_detected = 'ppt'`
- **WHEN** window generation processes page 15
- **THEN** full page text is extracted (no paragraph splitting)
- **AND** exactly 1 API call is made for page 15
- **AND** exactly 1 sticker is created for page 15
- **AND** no cross-page merging occurs

#### Scenario: Text PDF accumulates paragraphs within window
- **GIVEN** session has `pdf_type_detected = 'text'`
- **AND** window is [10, 12]
- **AND** page 10 has 200 words, page 11 has 150 words, page 12 has 180 words
- **WHEN** paragraph accumulation processes pages sequentially
- **THEN** accumulator merges page 10 + page 11 = 350 words
- **AND** generates sticker (within 300-500 threshold)
- **AND** resets accumulator
- **AND** processes page 12 separately (180 words, below threshold)

#### Scenario: Cross-page sticker at window boundary
- **GIVEN** window is [10, 15]
- **AND** page 15 ends with 120-word paragraph
- **WHEN** paragraph accumulation reaches page 15 end
- **THEN** accumulator holds 120 words (below 300 threshold)
- **AND** system generates sticker anyway (window boundary forces flush)
- **AND** does NOT wait for page 16 (outside current window)

---

### Requirement: Session Status and Progress Tracking
The system SHALL provide real-time progress updates for active sessions.

#### Scenario: Query session progress
- **GIVEN** active session processing window [10, 17]
- **AND** pages 10-13 are completed, pages 14-17 are pending
- **WHEN** client calls `GET /api/ai/explain-page/session/[id]`
- **THEN** response includes:
  ```json
  {
    "sessionId": "uuid",
    "status": "active",
    "windowRange": { "start": 10, "end": 17 },
    "lastProcessedPage": 13,
    "progress": {
      "completed": 4,
      "total": 8,
      "percentage": 50
    }
  }
  ```

#### Scenario: Display progress in UI toast
- **GIVEN** active session with 4/8 pages completed
- **WHEN** toast notification renders
- **THEN** toast displays: "Generating explanations: 4/8 pages"
- **AND** shows progress bar at 50%
- **AND** updates every 2 seconds via polling

#### Scenario: Session completes
- **GIVEN** all pages in window [10, 17] are processed
- **WHEN** last page (17) generation completes
- **THEN** session `status` is updated to 'completed'
- **AND** `lastProcessedPage` = 17
- **AND** next API call returns `{ status: 'completed' }`
- **AND** toast shows: "✅ Explanations ready for pages 10-17"

#### Scenario: User cancels session
- **GIVEN** active session generating pages 12-17
- **WHEN** user clicks "Stop" button in toast
- **THEN** client calls `PATCH /session/[id]` with `action: 'cancel'`
- **AND** all `AbortController` instances are aborted
- **AND** session `status` is updated to 'cancelled'
- **AND** partially completed stickers remain available
- **AND** cancelled pages are not retried

---

### Requirement: Shared Cache Integration in Window Mode
The system SHALL leverage shared cache to avoid redundant generation within window.

#### Scenario: Window checks cache for each page independently
- **GIVEN** window [10, 15] starts generation
- **AND** pages 10, 12 have cached stickers in `shared_auto_stickers`
- **AND** pages 11, 13-15 do not have cached stickers
- **WHEN** system processes window
- **THEN** pages 10, 12 are copied from shared cache (2 DB reads)
- **AND** pages 11, 13-15 are generated via OpenAI (4 API calls)
- **AND** total cost = 4 API calls instead of 6

#### Scenario: Cache miss triggers generation and write
- **GIVEN** page 14 has no shared cache entry
- **WHEN** window generation processes page 14
- **THEN** fresh sticker is generated via OpenAI
- **AND** sticker is written to user's `stickers` table
- **AND** sticker is ALSO written to `shared_auto_stickers` (for future users)
- **AND** `prompt_version`, `locale`, `effective_mode` are stored for cache key

#### Scenario: Window respects user opt-out preference
- **GIVEN** user has `share_to_cache = false` in `user_preferences`
- **WHEN** window generation starts
- **THEN** shared cache is NOT queried
- **AND** all pages generate fresh stickers
- **AND** generated stickers are NOT written to `shared_auto_stickers`
- **AND** stickers are stored only in user's personal `stickers` table

---

### Requirement: Error Handling and Resilience
The system SHALL gracefully handle errors during window generation without blocking user.

#### Scenario: Single page generation fails
- **GIVEN** window [10, 15] is generating
- **AND** page 12 generation fails with OpenAI API error
- **WHEN** error is caught
- **THEN** page 12 is marked as failed in session state
- **AND** pages 10, 11, 13-15 continue generating normally
- **AND** session status remains 'active'
- **AND** user sees stickers for successful pages (10, 11, 13-15)

#### Scenario: Type detection fails
- **GIVEN** PDF type detection throws error (corrupted PDF)
- **WHEN** window session is created
- **THEN** system logs error and defaults to `pdf_type_detected = 'text'`
- **AND** window generation proceeds with text strategy
- **AND** user is not blocked from using feature

#### Scenario: Concurrent request limit prevents deadlock
- **GIVEN** 3 requests are stuck waiting (network timeout)
- **AND** pages 13-17 are queued
- **WHEN** 60 seconds pass with no progress
- **THEN** system aborts stuck requests (force timeout)
- **AND** releases concurrency slots
- **AND** queued pages can proceed

---

### Requirement: Window Mode Coexists with User Image Selection
The system SHALL allow window mode and user image selection to operate independently without interference.

#### Scenario: User adds image selection during window session
- **GIVEN** active window session on pages [10, 17]
- **AND** page 12 already has auto-generated text sticker from window mode
- **WHEN** user draws rectangle around diagram on page 12 (using existing feature)
- **THEN** frontend calls POST /api/ai/explain-page with mode='single', effectiveMode='with_selected_images'
- **AND** system generates image-based sticker for page 12
- **AND** both text sticker and image sticker coexist on page 12
- **AND** window session continues processing other pages normally

#### Scenario: User deletes image selection during window session
- **GIVEN** page 12 has both text sticker (from window) and image sticker (from user selection)
- **WHEN** user deletes the image selection rectangle
- **THEN** frontend deletes only the image-based sticker
- **AND** text sticker from window mode remains visible
- **AND** window session is unaffected

#### Scenario: Image selection outside window range
- **GIVEN** active window session on pages [10, 17]
- **WHEN** user adds image selection on page 25 (outside window)
- **THEN** image selection is processed normally as independent feature
- **AND** does NOT affect window session
- **AND** page 25 image sticker is generated independently

#### Scenario: Window mode does not skip image-selected pages
- **GIVEN** active window session on pages [10, 17]
- **AND** user has image selections on pages 12 and 14
- **WHEN** window generation processes pages
- **THEN** pages 12 and 14 receive auto-generated text stickers normally
- **AND** pages 12 and 14 will have both text stickers (window) and image stickers (user selection)
- **AND** no pages are skipped

---

## Database Schema

```sql
CREATE TABLE auto_explain_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  start_page INTEGER NOT NULL,
  pdf_type TEXT CHECK(pdf_type IN ('ppt', 'text')),

  -- Window state
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  last_processed_page INTEGER,

  -- Request tracking
  active_requests JSONB DEFAULT '[]'::jsonb,

  status TEXT CHECK(status IN ('active', 'paused', 'cancelled', 'completed')) DEFAULT 'active',

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Ensure one active session per user-file pair
  CONSTRAINT unique_active_session UNIQUE(user_id, file_id) WHERE status = 'active'
);

CREATE INDEX idx_sessions_user_file ON auto_explain_sessions(user_id, file_id);
CREATE INDEX idx_sessions_status ON auto_explain_sessions(status) WHERE status = 'active';
```

```sql
ALTER TABLE files
  ADD COLUMN pdf_type_detected VARCHAR(10) CHECK(pdf_type_detected IN ('ppt', 'text'));

COMMENT ON COLUMN files.pdf_type_detected IS 'Cached PDF type from first window session';
```

---

## API Contracts

### POST /api/ai/explain-page (Modified)

**New Request Field**:
```typescript
{
  mode?: 'single' | 'window'  // Default: 'single'
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

---

### GET /api/ai/explain-page/session/[sessionId]

**Response**:
```typescript
{
  ok: true,
  session: {
    id: string,
    fileId: string,
    startPage: number,
    pdfType: 'ppt' | 'text',
    windowRange: { start: number, end: number },
    lastProcessedPage: number | null,
    status: 'active' | 'paused' | 'cancelled' | 'completed',
    progress: {
      completed: number,
      total: number,
      percentage: number
    }
  }
}
```

---

### PATCH /api/ai/explain-page/session/[sessionId]

**Request**:
```typescript
{
  currentPage: number,
  action: 'extend' | 'jump' | 'cancel'
}
```

**Response**:
```typescript
{
  ok: true,
  windowRange: { start: number, end: number },
  canceledPages?: number[],  // If jump occurred
  startedPages?: number[]    // Newly started pages
}
```

---

## Related Specs

- Extends: `ai-sticker-generation` (window mode modifies sticker generation)
- Integrates with: `context-library` (context injection per page)
- Uses: `pdf-reader-modes` (scroll tracking triggers window updates)
