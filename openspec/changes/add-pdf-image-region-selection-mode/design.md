# Design: PDF Image Region Selection Mode

## Architecture Overview

This feature introduces a **user-directed multimodal explain** flow where users explicitly select visual regions for AI analysis. The architecture coordinates three main systems:

1. **PDF Viewer** (Frontend): Selection UI, overlay rendering, region management
2. **Explain-Page API** (Backend): Multipart handling, reference context derivation, multimodal prompting
3. **Shared Cache** (Database): Extended cache key to prevent cross-selection pollution

## Key Design Decisions

### 1. Rectangle-Only Selection (MVP Constraint)

**Decision**: Support only rectangular selections in MVP.

**Rationale**:
- Simplifies coordinate storage (4 floats: x, y, w, h)
- Rectangle is sufficient for 90% of use cases (diagrams, charts, formulas)
- Easier to implement crop extraction from canvas
- Can extend to polygon/lasso in future without breaking changes

**Trade-offs**:
- Cannot precisely select irregular shapes
- Acceptable for MVP; users can draw slightly larger rectangles

### 2. Immediate Generation with Debounce (High-Frequency Request Handling)

**Decision**: Trigger new explain-page request on every region add/delete, with 150-250ms debounce + server-side idempotency.

**Rationale**:
- User feedback: "immediate" interaction feels responsive
- Aligns with product requirement in patch spec
- Latest-wins strategy prevents stale results from appearing
- Debounce merges rapid successive edits into fewer requests
- Server-side idempotency prevents duplicate processing

**Implementation**:
- **Client-side**:
  - Maintain `requestVersion` counter
  - Each add/delete schedules a debounced generation trigger (150-250ms)
  - If another edit occurs within debounce window, cancel previous and reschedule
  - Response handler checks version; ignores if stale
- **Server-side**:
  - For identical `(pdf_hash, root_page, selection_hash, prompt_version, locale)`, only one request enters `generating` state
  - Concurrent duplicate requests either:
    - Return existing `generationId` (202) if already generating
    - Return cached result (200) if ready
  - Use database-level locking (e.g., `FOR UPDATE SKIP LOCKED` or unique constraint on generation record)

**Trade-offs**:
- 150-250ms delay feels "instant" to users but significantly reduces API calls
- Server-side deduplication adds complexity but prevents wasted OpenAI quota

### 3. Session Root Page (Session-Scoped Lifecycle)

**Decision**: Capture "session root page" when entering selection mode; root page is session-scoped and resets on mode exit.

**Rationale**:
- Explain-page API expects a single "page being explained"
- Selected regions may span multiple pages (e.g., page 13, 14)
- Root page represents the "primary context page" for the explanation
- Allows reference context search to start from a consistent anchor

**Lifecycle (Session-Scoped)**:
- **Mode entry**: `sessionRootPage = currentViewerPage` (captured once)
- **During session**: Root page remains fixed even if user navigates to other pages
- **Mode exit**: Session ends; root page is cleared
- **Re-entry**: New session starts; root page is re-captured from current page
- **Navigation away**: Session naturally ends (no persistence across routes)

**Example**:
```
User on page 12 → clicks "Select images" → sessionRootPage = 12
User scrolls to page 13 → draws region on page 13
User scrolls to page 14 → draws region on page 14
API request: page=12, selectedImageRegions=[{page:13,...}, {page:14,...}]
User exits mode → sessionRootPage cleared
User re-enters mode on page 20 → sessionRootPage = 20 (new session)
```

**Trade-offs**:
- Predictable: user always knows which page is being "explained"
- Simpler than document-scoped persistence (avoids stale state issues)
- Root page cannot be changed mid-session (user must exit and re-enter)

### 4. Normalized Coordinates (0..1 Range)

**Decision**: Store and transmit rectangle coordinates as normalized values (0..1) relative to PDF page dimensions.

**Rationale**:
- Resolution-independent: works across different zoom levels and screen sizes
- Simplifies cache key computation (no pixel values)
- Aligns with existing `anchor_rect` storage in database

**Coordinate System**:
```typescript
type Rect = {
  x: number      // 0..1 (left edge)
  y: number      // 0..1 (top edge)
  width: number  // 0..1 (relative width)
  height: number // 0..1 (relative height)
}
```

**Rendering**: Convert normalized → pixel using current viewport dimensions.

### 5. Selection Hash (Geometric Identity)

**Decision**: Hash the sorted array of (page, x, y, w, h) tuples, not the JPEG bytes.

**Rationale**:
- **Goal**: Maximize cross-user cache hits
- **Problem**: JPEG encoding is non-deterministic (different browsers, canvas implementations)
- **Solution**: Base hash on geometric coordinates only

**Algorithm**:
```javascript
selectionHash = SHA256({
  v: "2026-01-12.2",         // prompt version
  root_page: 12,
  effective_mode: "with_selected_images",
  locale: "zh-Hans",
  regions: [
    { page: 13, x: 0.1234, y: 0.3300, w: 0.4000, h: 0.2800 },
    { page: 13, x: 0.6000, y: 0.1200, w: 0.2000, h: 0.2000 }
  ]  // sorted by (page, x, y, w, h)
})
```

**Precision**: Round coordinates to 4 decimals to tolerate minor floating-point variance.

**Trade-offs**:
- Tiny coordinate differences (< 0.0001) may cause cache miss
- Acceptable: 4 decimals = 0.1mm precision on typical PDF page

### 6. Extended Anchor Data Model with Deterministic Region IDs

**Decision**: Extend `Sticker.anchor` to support multi-anchors with deterministic region IDs for hover matching.

**Rationale**:
- Existing stickers use `{ textSnippet, rect? }`
- New stickers need multiple anchors (1 text + N images)
- Must not break existing sticker rendering
- **Region ID is required for reliable hover highlighting** (floating-point rect comparison is unreliable)

**Schema**:
```typescript
type TextAnchor = {
  kind: "text"
  page: number
  textSnippet: string
  rect?: Rect | null
}

type ImageAnchor = {
  kind: "image"
  id: string  // Deterministic: `${page}-${x.toFixed(4)}-${y.toFixed(4)}-${w.toFixed(4)}-${h.toFixed(4)}`
  page: number
  rect: Rect
  mime: "image/jpeg"
}

type StickerAnchor = {
  // Legacy fields (keep for backward compat)
  textSnippet: string
  rect?: Rect | null

  // New field (optional)
  anchors?: Array<TextAnchor | ImageAnchor>
}
```

**Region ID Generation**:
```typescript
function generateRegionId(page: number, rect: Rect): string {
  return `${page}-${rect.x.toFixed(4)}-${rect.y.toFixed(4)}-${rect.width.toFixed(4)}-${rect.height.toFixed(4)}`
}
```

**Rendering Logic**:
```typescript
function getAnchors(sticker: Sticker): Array<TextAnchor | ImageAnchor> {
  if (sticker.anchor.anchors) {
    return sticker.anchor.anchors  // New format
  }
  // Legacy fallback
  return [{
    kind: "text",
    page: sticker.page,
    textSnippet: sticker.anchor.textSnippet,
    rect: sticker.anchor.rect
  }]
}
```

**Hover Matching**:
```typescript
// When hovering sticker:
const imageAnchors = getAnchors(sticker).filter(a => a.kind === 'image')
const regionIds = imageAnchors.map(a => a.id)
// Highlight regions by direct ID match (no geometry comparison)
```

**Trade-offs**:
- Slightly more complex data structure
- Benefit: No migration needed; reliable hover matching without floating-point issues

### 7. Reference Context Derivation (Cross-Page)

**Decision**: Use textual reference location ("see Fig 7") for context, not the image page itself.

**Rationale**:
- Academic PDFs often reference figures from other pages
- Context from the referring text is more relevant than image page text
- Example: "Figure 7 shows the architecture..." (page 12) vs bare diagram (page 13)

**Algorithm**:
1. **Label Extraction**: Infer label from image page text
   - Patterns: `Figure 7`, `Fig. 7`, `图7`, `Table 3`, etc.
   - Use caption text near image region if available

2. **Corpus Search**: Search all page texts for best reference
   - Match pattern: "see Figure 7", "shown in Fig. 7", "如图7所示"
   - Prefer body text over headers/footers
   - Return matched paragraph + previous paragraph

3. **Context Window**: Apply token limit (e.g., 3.2k tokens)

4. **Fallback**: If no match found, use image page local context

**Trade-offs**:
- Complex heuristic; may miss references
- Fallback ensures graceful degradation

### 8. Canvas Access Strategy (DOM Query + Registration)

**Decision**: Use DOM query (`container.querySelector('canvas')`) with a `Map<pageNumber, HTMLCanvasElement>` registration system instead of relying on react-pdf internal APIs.

**Rationale**:
- react-pdf's internal API for exposing canvas refs is unreliable across versions
- DOM structure (canvas existence) is relatively stable
- Direct DOM query + cleanup pattern has lowest coupling and highest control

**Implementation**:
```typescript
// In PdfPage component:
const containerRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!containerRef.current) return
  const canvas = containerRef.current.querySelector('canvas')
  if (canvas) {
    onCanvasReady?.(pageNumber, canvas)
  }
  return () => {
    onCanvasUnmount?.(pageNumber)
  }
}, [pageNumber, onCanvasReady, onCanvasUnmount])

// In PdfViewer (parent):
const canvasMap = useRef<Map<number, HTMLCanvasElement>>(new Map())

const handleCanvasReady = (page: number, canvas: HTMLCanvasElement) => {
  canvasMap.current.set(page, canvas)
}

const handleCanvasUnmount = (page: number) => {
  canvasMap.current.delete(page)
}
```

**Trade-offs**:
- Relies on DOM structure (but this is more stable than internal APIs)
- Slightly more manual cleanup required
- Benefit: Version-independent, full control over lifecycle

### 9. Eager JPEG Crop Caching (Mouse-Up Immediate Capture)

**Decision**: Extract and cache JPEG crops immediately on mouse-up (when region is drawn), not when generation is triggered.

**Rationale**:
- **Problem**: Virtual scrolling may unmount pages; canvas won't be available later
- **Solution**: Capture crop at the moment user finishes drawing, store in `Map<regionId, Blob>`
- Product requirement is "immediate generation on each draw," so canvas is guaranteed available at mouse-up

**Implementation**:
```typescript
// State:
const regionCrops = useRef<Map<string, Blob>>(new Map())

// On mouse-up (region drawn):
const handleRegionComplete = async (page: number, rect: Rect) => {
  const regionId = generateRegionId(page, rect)
  const canvas = canvasMap.current.get(page)
  if (!canvas) {
    console.error('Canvas not available for page', page)
    return
  }

  // Extract crop immediately:
  const cropBlob = await cropPageRegion(canvas, rect)
  regionCrops.current.set(regionId, cropBlob)

  // Add region to state:
  setDraftRegions(prev => [...prev, { id: regionId, page, rect, status: 'draft' }])

  // Trigger generation (debounced):
  triggerGeneration()
}

// When building multipart request:
const formData = new FormData()
formData.append('payload', JSON.stringify(payload))
draftRegions.forEach((region, index) => {
  const blob = regionCrops.current.get(region.id)
  if (blob) {
    formData.append(`image_${index}`, blob, `region-${region.id}.jpg`)
  }
})
```

**Cleanup**:
- On region delete: remove from `regionCrops` Map
- On mode exit: clear entire Map

**Trade-offs**:
- Memory overhead: stores JPEG blobs (typically 200-500KB each, max 8 = ~4MB)
- Benefit: No need for offscreen rendering; works regardless of virtual scrolling

### 10. Multipart Parsing with Next.js Built-in API

**Decision**: Use Next.js App Router's built-in `request.formData()` instead of external libraries like `formidable`.

**Rationale**:
- Next.js 13+ App Router provides native `formData()` support
- No external dependencies needed
- Works seamlessly with Route Handlers

**Implementation**:
```typescript
// In route.ts:
export const runtime = 'nodejs' // Ensure Node.js runtime (not Edge)

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type')

  if (contentType?.includes('multipart/form-data')) {
    // Parse multipart:
    const formData = await request.formData()

    // Extract JSON payload:
    const payloadString = formData.get('payload') as string
    const payload = JSON.parse(payloadString)

    // Extract image files:
    const images: Buffer[] = []
    let index = 0
    while (true) {
      const file = formData.get(`image_${index}`) as File | null
      if (!file) break
      const arrayBuffer = await file.arrayBuffer()
      images.push(Buffer.from(arrayBuffer))
      index++
    }

    // Validate:
    if (images.length !== payload.selectedImageRegions.length) {
      return errors.invalidInput('Image count mismatch')
    }

    // Process...
  } else {
    // Legacy JSON request handling...
  }
}
```

**Trade-offs**:
- Must use `runtime = 'nodejs'` (Edge runtime has limitations)
- Simpler than external parsers; maintained by Next.js team

### 11. Reference Context Token Limiting (Character-Based with Retry)

**Decision**: Use character-based truncation with safety buffer instead of precise token counting for MVP.

**Rationale**:
- Introducing `tiktoken` adds dependency weight and build complexity
- GPT-4o tokenizer may change; don't want to couple to specific encoding
- Character-based limits with conservative buffer work for 95% of cases
- Rare failures can be handled by retry-with-truncation

**Implementation**:
```typescript
function truncateReferenceContext(text: string, maxChars: number = 8000): string {
  if (text.length <= maxChars) return text

  // Prioritize matched paragraph (contains label reference)
  // Truncate previous paragraph if needed
  // Ensure we don't cut mid-sentence
  const truncated = text.substring(0, maxChars)
  const lastPeriod = truncated.lastIndexOf('.')
  return lastPeriod > maxChars * 0.8 ? truncated.substring(0, lastPeriod + 1) : truncated
}

// In API handler:
let referenceContext = deriveReferenceContext(...)
referenceContext = truncateReferenceContext(referenceContext, 8000)

try {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: buildMultimodalMessages(referenceContext, images),
    // ...
  })
} catch (error) {
  if (error.code === 'context_length_exceeded') {
    // Retry with half the context (one-time retry only):
    referenceContext = truncateReferenceContext(referenceContext, 4000)
    const response = await openai.chat.completions.create(...)
  }
  throw error
}
```

**When to introduce tiktoken**:
- After MVP, if you add complex multi-turn conversation history
- Or if context_length errors become frequent (>1% of requests)

**Trade-offs**:
- Less precise than token counting
- Benefit: Simpler, no extra dependencies, works for MVP

### 12. Quota on Cached Hits (Mode-Specific)

**Decision**: For `with_selected_images` mode, deduct quota even on cache hit.

**Rationale**:
- Product decision: user-directed selection is a premium interaction
- Prevents abuse via repeated cache hits
- Other modes (e.g., `with_images`) may keep current behavior (no deduction on hit)

**Implementation**:
```typescript
if (cacheHit && effectiveMode === 'with_selected_images') {
  await deductQuota(supabase, userId, 'autoExplain')
}
```

**Trade-offs**:
- Less attractive cache benefit for users
- Aligns with product intent (limit usage)

## Data Flow

### Frontend: Selection to Multipart Upload

```
User draws rectangle (page 13)
  ↓
Store normalized rect: { page: 13, rect: { x: 0.12, y: 0.33, w: 0.40, h: 0.28 } }
  ↓
Extract JPEG crop from page canvas (convert normalized → pixel rect)
  ↓
Build FormData:
  - payload: JSON({ courseId, fileId, page: rootPage, effectiveMode, selectedImageRegions, ... })
  - image_0: Blob (JPEG)
  ↓
POST /api/ai/explain-page (multipart/form-data)
```

### Backend: Multipart to Multimodal Prompt

```
Parse multipart request
  ↓
Validate: region count (≤8), bounds (0..1), scanned check
  ↓
Compute selection_hash (geometric)
  ↓
Check shared cache: (pdf_hash, page, prompt_version, locale, effective_mode, selection_hash)
  ↓
If miss:
  1. Derive reference context (label search)
  2. Build multimodal prompt: [text_message, image_message_0, image_message_1, ...]
  3. Call GPT-4o
  4. Parse response → stickers with anchor.anchors[]
  5. Store to shared cache + user stickers table
  6. Deduct quota
  ↓
Return: 200 (ready) or 202 (generating)
```

### Sticker Hover → Region Highlight

```
User hovers sticker card
  ↓
Parse sticker.anchor.anchors → filter kind="image"
  ↓
For each ImageAnchor: { page, rect }
  ↓
If page is currently rendered:
  - Find matching region overlay
  - Apply highlight style (border thicker or opacity bump)
  ↓
On mouse leave: Remove highlight
```

## Database Schema Changes

### Migration: shared_auto_stickers

```sql
-- Add selection_hash column (nullable for backward compat)
ALTER TABLE shared_auto_stickers
ADD COLUMN selection_hash VARCHAR(64) NULL;

-- Uniqueness for legacy rows (no selection)
CREATE UNIQUE INDEX ux_shared_auto_stickers_legacy
ON shared_auto_stickers (pdf_hash, page, prompt_version, locale, effective_mode)
WHERE selection_hash IS NULL;

-- Uniqueness for selection rows
CREATE UNIQUE INDEX ux_shared_auto_stickers_selection
ON shared_auto_stickers (pdf_hash, page, prompt_version, locale, effective_mode, selection_hash)
WHERE selection_hash IS NOT NULL;

-- Update effective_mode column if needed (must support 'with_selected_images')
-- Assuming column is VARCHAR(20) or larger
```

### No Changes to `stickers` Table

The `stickers.anchor_rect` column remains unchanged. The new `anchor.anchors[]` structure is stored in the existing JSONB format returned by the API and used in the frontend; database columns (`anchor_text`, `anchor_rect`) continue to work as before for backward compatibility.

## Component Design

### New Component: `PdfRegionOverlay`

**Purpose**: Render selection rectangles on top of PDF pages.

**Props**:
```typescript
interface PdfRegionOverlayProps {
  regions: Array<{
    id: string
    page: number
    rect: Rect  // normalized
    status: 'draft' | 'persisted'
  }>
  currentPage: number
  pageWidth: number
  pageHeight: number
  highlight: { regionIds: string[] } | null
  onDeleteRegion: (id: string) => void
}
```

**Rendering**:
- Position overlay using absolute positioning over PDF page canvas
- Convert normalized rect → pixel rect: `{ x: rect.x * pageWidth, y: rect.y * pageHeight, ... }`
- Apply CSS for border, fill, hover state

### Modified Component: `PdfToolbar`

**Changes**:
- Add "Select images" toggle button (icon: crosshair or bounding box)
- Toggle state: `selectionMode: boolean`
- When enabled: notify parent to activate selection behavior

### Modified Component: `PdfViewer`

**Changes**:
- Maintain selection state:
  ```typescript
  const [selectionMode, setSelectionMode] = useState(false)
  const [sessionRootPage, setSessionRootPage] = useState<number | null>(null)
  const [draftRegions, setDraftRegions] = useState<Region[]>([])
  ```
- On enter selection mode: capture `sessionRootPage = currentPage`
- Render `<PdfRegionOverlay>` when selection mode active
- Handle pointer events for drawing rectangles
- Trigger explain-page on region add/delete

### Modified Component: `StickerCard` (in StickerPanel)

**Changes**:
- Add hover handlers: `onMouseEnter` / `onMouseLeave`
- On enter: parse `sticker.anchor.anchors`, extract image anchors, notify parent
- Parent (Study page) → updates highlight state → PdfViewer re-renders overlays

## Error Handling

### Scanned PDF Detection
- If `file.is_scanned === true`, return `400 FILE_IS_SCANNED` before any processing
- Client shows user-friendly message: "Scanned PDFs do not support region selection"

### Invalid Region Coordinates
- Validate: `0 <= x, y, x+w, y+h <= 1` and `w, h > 0`
- Return `400 INVALID_INPUT` with details

### Region Count Limit
- Max 8 regions per request (MVP)
- Return `400 INVALID_INPUT: "Maximum 8 regions allowed"`

### Reference Context Not Found
- Fallback to image page context
- Log warning but continue generation
- Consider adding flag to sticker metadata: `reference_context_found: boolean`

## Performance Considerations

### 1. Multipart Upload Size
- JPEG quality: 0.85 (balance quality vs size)
- Typical crop: 200KB - 500KB per image
- Max 8 crops → ~4MB total (within Next.js default 4MB limit)

### 2. Canvas Crop Extraction
- Use offscreen canvas for crop rendering (no flicker)
- Reuse existing page canvas as source (no re-render)
- Async blob conversion to avoid blocking UI

### 3. Region Overlay Rendering
- Only render overlays for currently visible pages (virtual scrolling compatible)
- Use CSS transforms for smooth dragging (GPU accelerated)
- Debounce rect updates during drag (60fps)

### 4. Sticker Hover Highlight
- Direct DOM manipulation for highlight state (avoid full re-render)
- CSS transition for smooth visual feedback

## Testing Strategy

### Unit Tests
- [ ] `computeSelectionHash()` - consistent output for same input
- [ ] `normalizeRect()` - coordinate conversion accuracy
- [ ] `parseAnchors()` - backward compatibility with legacy format

### Integration Tests
- [ ] POST /api/ai/explain-page with multipart - validates all fields
- [ ] Scanned PDF rejection - returns correct error code
- [ ] Cache hit with selection_hash - quota deduction occurs

### E2E Tests
- [ ] Draw region → overlay appears at correct position
- [ ] Delete region → overlay removed, new request triggered
- [ ] Hover sticker → regions highlighted in PDF view
- [ ] Multi-page selection → all overlays persist across page switches

## Open Questions

1. **Should we show a "generation in progress" indicator per region?**
   - MVP: Single global loading state
   - Future: Per-region status (draft / generating / persisted)

2. **Should clicking a sticker auto-navigate to its first anchor page?**
   - MVP: No auto-navigation
   - Future enhancement: Optional jump behavior

3. **Should we support undo/redo for region operations?**
   - MVP: No (delete-only)
   - Future: Full undo stack

4. **What should happen if user exits selection mode with unsaved regions?**
   - Proposed: Keep persisted regions visible; clear draft-only regions
   - Alternative: Prompt user to confirm exit

## Migration Path

### Backward Compatibility
- No database migration for `stickers` table
- New `selection_hash` column is nullable (existing rows unaffected)
- Legacy stickers render correctly (fallback to old anchor format)

### Rollout
1. Deploy database migration (add column + indexes)
2. Deploy backend changes (multipart support, selection_hash)
3. Deploy frontend changes (selection mode UI)
4. Monitor: cache hit rate, quota consumption, error rate

### Rollback Plan
- Feature flag: `ENABLE_IMAGE_REGION_SELECTION` (default: false)
- If issues found: disable flag, no database rollback needed
- `selection_hash` column can remain (NULL for all rows)
