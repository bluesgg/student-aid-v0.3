# Design: Intelligent Auto-Explain Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ PDF Viewer     │  │ Session Manager  │  │ Sticker Card    │ │
│  │ (scroll track) │→ │ (window control) │→ │ (version UI)    │ │
│  └────────────────┘  └──────────────────┘  └─────────────────┘ │
└───────────────────────────────│─────────────────────────────────┘
                                │
                                ↓ HTTP + WebSocket (for progress)
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API Layer                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ POST /api/ai/explain-page (modified)                       │ │
│  │  • Check existing session                                  │ │
│  │  • Run PDF type detection (cache result)                   │ │
│  │  • Create auto_explain_session                             │ │
│  │  • Start background window generation                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ PATCH /api/ai/explain-page/session/[id]                    │ │
│  │  • Update window range on page scroll                      │ │
│  │  • Cancel requests outside window (AbortController)        │ │
│  │  • Start generation for new pages                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ POST /api/ai/explain-page/sticker/[id]/refresh             │ │
│  │  • Read sticker.page_range                                 │ │
│  │  • Re-extract text from PDF                                │ │
│  │  • Generate new version                                    │ │
│  │  • Circular version replacement (max 2)                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Core Business Logic                         │
│  ┌──────────────────┐  ┌────────────────────┐  ┌─────────────┐ │
│  │ Type Detector    │  │ Window Manager     │  │ Paragraph   │ │
│  │ (multi-dim       │  │ (sliding window    │  │ Accumulator │ │
│  │  analysis)       │  │  + AbortController)│  │ (300-500w)  │ │
│  └──────────────────┘  └────────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                               │
│  ┌────────────────────┐  ┌────────────────────┐  ┌───────────┐│
│  │ auto_explain_      │  │ sticker_versions   │  │ stickers  ││
│  │ sessions           │  │ (2 versions max)   │  │ (extended)││
│  │ (window state)     │  │                    │  │           ││
│  └────────────────────┘  └────────────────────┘  └───────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. PDF Type Detector

**Input**: PDF Buffer, sample pages (default 5)
**Output**: `'ppt' | 'text'`
**Caching**: Store result in `files.pdf_type_detected` (VARCHAR)

**Algorithm**:
```typescript
function calculateTypeScore(page: PDFPage): number {
  let score = 0

  // 1. Image/text ratio (40% weight)
  const imageArea = getImageAreaRatio(page)
  if (imageArea > 0.3) score += 0.4

  // 2. Text density (30% weight)
  const textDensity = getWordsPerPage(page) / pageArea
  if (textDensity < 500) score += 0.3

  // 3. Layout regularity (20% weight)
  const layoutScore = analyzeLayout(page) // bullets, center-align, headings
  score += layoutScore * 0.2

  // 4. PDF metadata (10% weight)
  if (/powerpoint|keynote|prezi/i.test(pdfMetadata.creator)) {
    score += 0.1
  }

  return score // 0-1 range
}

// Average across sample pages
avgScore = sum(scores) / sampleSize
return avgScore > 0.6 ? 'ppt' : 'text'
```

**Edge Cases**:
- Mixed-type PDFs: Use majority vote (treat as single type)
- Scanned PDFs: Falls back to image analysis only
- Encrypted PDFs: Skip detection, default to 'text'

---

### 2. Sliding Window Manager

**Responsibilities**:
1. Track current window range (start page, end page)
2. Expand window when user scrolls
3. Cancel requests outside window when user jumps
4. Enforce concurrency limits (max 3 concurrent requests)

**State Machine**:
```
┌─────────────┐
│  Idle       │
└──────┬──────┘
       │ User clicks "Start Explaining From This Page"
       ↓
┌─────────────┐
│  Active     │ ← Window: [currentPage-2, currentPage+5]
└──────┬──────┘
       │ User scrolls to next page
       ↓
┌─────────────┐
│  Extending  │ ← Window: [currentPage-2, currentPage+6]
└──────┬──────┘   Generate page currentPage+6
       │ User jumps to page 50 (>10 pages away)
       ↓
┌─────────────┐
│  Canceling  │ ← Abort all requests outside [48, 55]
└──────┬──────┘
       │ Requests canceled
       ↓
┌─────────────┐
│  Active     │ ← Window: [48, 55]
└─────────────┘
```

**Concurrency Control**:
```typescript
class WindowManager {
  private activeRequests: Map<number, AbortController> = new Map()
  private readonly MAX_CONCURRENT = 3

  async generatePage(page: number) {
    // Wait if at concurrency limit
    while (this.activeRequests.size >= this.MAX_CONCURRENT) {
      await sleep(500)
    }

    const controller = new AbortController()
    this.activeRequests.set(page, controller)

    try {
      await callOpenAI(pageText, { signal: controller.signal })
    } finally {
      this.activeRequests.delete(page)
    }
  }

  cancelOutsideWindow(start: number, end: number) {
    for (const [page, controller] of this.activeRequests) {
      if (page < start || page > end) {
        controller.abort()
        this.activeRequests.delete(page)
      }
    }
  }
}
```

---

### 3. Paragraph Accumulator (Text PDFs)

**Goal**: Merge small paragraphs across pages to reach 300-500 word threshold

**Algorithm**:
```typescript
interface Accumulator {
  text: string
  wordCount: number
  startPage: number
  startY: number
  endPage: number
  endY: number
}

async function generateTextPdfStickers(pages: number[]) {
  let acc: Accumulator = { text: '', wordCount: 0, ... }
  const stickers = []

  for (const page of pages) {
    const paragraphs = await extractParagraphs(pdfBuffer, page)

    for (const para of paragraphs) {
      if (acc.wordCount === 0) {
        // Start new accumulation
        acc.startPage = page
        acc.startY = para.yStart
      }

      acc.text += para.text + '\n'
      acc.wordCount += para.wordCount
      acc.endPage = page
      acc.endY = para.yEnd

      if (acc.wordCount >= 300 && acc.wordCount <= 500) {
        // Generate sticker
        const explanation = await callOpenAI(acc.text)
        stickers.push({
          page: acc.startPage, // Display on start page
          page_range: {
            start: { page: acc.startPage, y_start: acc.startY, y_end: paragraphs[0].yEnd },
            end: { page: acc.endPage, y_start: para.yStart, y_end: acc.endY }
          },
          anchor_text: extractFirstSentence(acc.text),
          content_markdown: explanation
        })

        // Reset accumulator
        acc = { text: '', wordCount: 0, ... }
      } else if (acc.wordCount > 500) {
        // Exceeded threshold, generate anyway
        // (should not happen often with paragraph-level accumulation)
      }
    }
  }

  // Handle remaining accumulation at end of window
  if (acc.wordCount > 0) {
    const explanation = await callOpenAI(acc.text)
    stickers.push({ ... })
  }

  return stickers
}
```

**Edge Case**: Page boundary at exact 300 words
- **Solution**: Allow slight overflow (300-500 range) to avoid splitting mid-paragraph

---

### 4. Sticker Version Management

**Data Model**:
```sql
-- stickers table (existing, add columns)
ALTER TABLE stickers ADD COLUMN current_version INTEGER DEFAULT 1;
ALTER TABLE stickers ADD COLUMN page_range JSONB;

-- sticker_versions table (new)
CREATE TABLE sticker_versions (
  id UUID PRIMARY KEY,
  sticker_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  version_number INTEGER CHECK (version_number IN (1, 2)),
  content_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sticker_id, version_number)
);
```

**Version Lifecycle**:
```
Initial generation:
  stickers: { id: 'abc', current_version: 1, content_markdown: 'V1' }
  sticker_versions: []  (empty, content is in stickers table)

First refresh:
  stickers: { id: 'abc', current_version: 2, content_markdown: 'V2' }
  sticker_versions: [
    { sticker_id: 'abc', version_number: 1, content_markdown: 'V1' }
  ]

Second refresh (circular replacement):
  stickers: { id: 'abc', current_version: 2, content_markdown: 'V3' }
  sticker_versions: [
    { sticker_id: 'abc', version_number: 1, content_markdown: 'V2' },  // V1 deleted, V2 moved here
  ]
  // V1 is permanently lost
```

**UI Flow**:
```
Sticker Card:
┌─────────────────────────────────┐
│ 📌 Derivative Definition         │
│                                  │
│ The derivative measures...       │
│                                  │
│ [←] 2/2 [→]   [🔄 Refresh]      │
└─────────────────────────────────┘

Click left arrow (←):
  stickers.current_version = 1
  Display sticker_versions WHERE version_number = 1

Click right arrow (→):
  stickers.current_version = 2
  Display stickers.content_markdown

Click refresh (🔄):
  1. Show loading spinner (3s debounce)
  2. Call /api/ai/explain-page/sticker/[id]/refresh
  3. Backend:
     - Generate new explanation
     - DELETE FROM sticker_versions WHERE version_number = 1  (if exists)
     - UPDATE sticker_versions SET version_number = 1 WHERE version_number = 2  (if exists)
     - INSERT sticker_versions (version_number = 1, old content)
     - UPDATE stickers SET current_version = 2, content_markdown = new content
  4. Frontend: Reload sticker, show new version
```

---

### 5. Shared Cache Integration

**Write Strategy**:
```
User generates sticker (version 1):
  ✅ Write to shared_auto_stickers (for cross-user reuse)
  ✅ Write to user's stickers table

User refreshes sticker (version 2):
  ❌ Do NOT write to shared_auto_stickers
  ✅ Write to user's sticker_versions table
```

**Read Strategy**:
```
New user requests explanation:
  1. Check shared_auto_stickers for cached stickers
  2. If found:
     - Copy to user's stickers table (version 1 only)
     - Return cached stickers
  3. If not found:
     - Generate fresh stickers
     - Write version 1 to both shared_auto_stickers and user's stickers
```

**Rationale**: User-customized versions (v2+) are personal preference, not authoritative enough to share globally.

---

### 6. Window Mode + User Image Selection Coexistence

**Design Philosophy**: Window mode and user image selection are **independent orthogonal features**:

- **Window mode**: Generates text-only stickers automatically (paragraph accumulation)
- **Image selection**: User manually selects image regions (existing `with_selected_images` feature)

**Coexistence Behavior**:
```
User on page 10 with active window session [8-15]:

Scenario 1: User selects image on page 12
1. User draws rectangle around diagram (existing feature)
2. Frontend calls POST /api/ai/explain-page (mode='single', effectiveMode='with_selected_images')
3. Backend generates image-based sticker for page 12
4. If page 12 already has auto-generated text sticker → both stickers coexist on same page
5. Window session continues processing other pages normally

Scenario 2: User deletes image selection
1. User removes image rectangle (existing feature)
2. Frontend deletes image-based sticker from UI
3. Auto-generated text sticker (if exists) remains visible
4. Window session unaffected
```

**No Special Integration Needed**:
- Window session does NOT track user image selections
- Window session does NOT skip pages with user selections
- Both features operate independently and can generate stickers on the same page
- User sees both text stickers (from window) and image stickers (from manual selection)

**Sticker Anchor Positioning**:
- Text stickers: Anchor at paragraph start position (yStart)
- Image stickers: Anchor at image region position (user-selected rect)
- Multiple stickers on same page are stacked vertically

---

## Database Schema Changes

See migration file: `005_intelligent_auto_explain.sql`

**New Tables**:
1. `auto_explain_sessions`: Track active window generation sessions
2. `sticker_versions`: Store previous sticker versions (max 2)

**Modified Tables**:
1. `stickers`: Add `current_version` and `page_range` columns
2. `files`: Add `pdf_type_detected` column

---

## API Contracts

### POST /api/ai/explain-page (Modified)

**Request**:
```json
{
  "courseId": "uuid",
  "fileId": "uuid",
  "page": 10,
  "pdfType": "Lecture",
  "locale": "en",
  "mode": "window"  // NEW: 'single' (old behavior) or 'window' (new)
}
```

**Response (mode=window)**:
```json
{
  "ok": true,
  "sessionId": "uuid",
  "windowRange": { "start": 8, "end": 15 },
  "pdfType": "text",  // Detected type
  "message": "Started auto-explain from page 10 (window: 8-15)"
}
```

---

### PATCH /api/ai/explain-page/session/[sessionId]

**Request**:
```json
{
  "currentPage": 12,
  "action": "extend" | "jump" | "cancel"
}
```

**Response**:
```json
{
  "ok": true,
  "windowRange": { "start": 10, "end": 17 },
  "canceledPages": [8, 9],  // If jump occurred
  "startedPages": [16, 17]
}
```

---

### POST /api/ai/explain-page/sticker/[stickerId]/refresh

**Response**:
```json
{
  "ok": true,
  "sticker": {
    "id": "uuid",
    "currentVersion": 2,
    "versions": [
      { "version": 1, "contentMarkdown": "Old explanation", "createdAt": "..." },
      { "version": 2, "contentMarkdown": "New explanation", "createdAt": "..." }
    ]
  }
}
```

---

## Performance Considerations

1. **Type Detection**: Cache result per file (1-time cost)
2. **Window Generation**: Max 3 concurrent OpenAI requests (avoid rate limit)
3. **AbortController**: Cancel unused requests to save cost
4. **Paragraph Extraction**: Use pdf-parse library with streaming for large PDFs
5. **Version Storage**: JSONB for page_range (indexed for fast lookups)

---

## Security Considerations

1. **Session Ownership**: Enforce `user_id` match in session queries
2. **Concurrency Limit**: Prevent single user from creating >100 concurrent requests
3. **Rate Limiting**: API-level throttling (10 requests/min per user)
4. **Content Validation**: Sanitize AI-generated markdown (prevent XSS)

---

## Rollback Plan

If this feature causes issues, rollback steps:

1. Deploy code with `mode=single` as default (reverts to old behavior)
2. Database migration rollback: Drop `auto_explain_sessions` and `sticker_versions` tables
3. Remove `pdf_type_detected` column from `files` table
4. Existing stickers remain functional (ignore `current_version` and `page_range` columns)
