# Design: Auto Image Detection

## Context

Users currently draw rectangles to select images for explanation. This is cumbersome and error-prone. We want to enable **click anywhere on an image** to automatically detect and explain it.

### Constraints
- Must work client-side for speed (no round-trip for basic detection)
- Must support cross-user caching (same PDF = shared explanations)
- Must handle false positives gracefully (feedback mechanism)
- Budget: <$0.01 per page for detection costs
- Must handle two distinct PDF types: PPT-converted and textbook-style

### PDF Type Characteristics

| Aspect | PPT-converted PDF | Textbook PDF |
|--------|------------------|--------------|
| **Image density** | High (1-5 per page) | Low-Medium (0-2 per page) |
| **Image size** | Large, centered | Variable, often inline |
| **Background** | Often has gradients/decorative | Usually clean/white |
| **Layout** | Single-column, slides | Multi-column, dense text |
| **Common false positives** | Decorative backgrounds, logos | Headers, footers, watermarks |

## Goals / Non-Goals

**Goals:**
- Single-click image explanation (no drawing)
- Image extraction on PDF upload (≤50 pages) or lazy (>50 pages)
- Always-on hover highlights (no mode toggle)
- Cross-user cache sharing for same PDF file
- Graceful degradation when detection fails
- Handle both PPT-converted and textbook PDFs effectively
- Clear extraction progress UI for large PDFs

**Non-Goals:**
- AI-based content classification (decorative vs content)
- AI-based detection fallback (DETR etc.)
- Vector graphics detection
- Cross-PDF deduplication
- Same-PDF image deduplication (no pHash)
- User-configurable sensitivity
- Auto-generation of explanations (must be user-triggered)

## Decisions

### Decision 1: Primary Detection Method

**Choice**: PDF.js `getOperatorList()` with `OPS.paintImageXObject`

**Rationale**:
- Zero external API cost
- Works client-side (fast)
- Accurate for raster images
- Already available in our pdf.js setup

**Alternatives considered**:
- Cloudflare Workers AI DETR: $0.0001/image, but adds latency and cost
- Canvas pixel analysis: Complex, inaccurate for PDFs with background colors
- PDF.js text layer intersection: Only works for images with alt text

### Decision 2: Detection Timing

**Choice**: Hybrid extraction based on PDF size (50-page threshold)

**Rationale**:
- Small PDFs (≤50 pages): Extract all at upload for zero-latency viewing
- Large PDFs (>50 pages): Extract first 50 pages at upload, remaining pages lazily
- Balances upload speed with viewing experience
- Most users read sequentially, giving time for background extraction

**Implementation**:
- **≤50 pages**: Extract all pages during upload (same step as context extraction)
- **>50 pages**:
  - Extract pages 1-50 during upload
  - Track `extraction_status` on file: `partial` | `complete`
  - When viewing page >50 that's not extracted, trigger lazy extraction
  - Background extraction continues while user reads
- Client shows extraction progress indicator for partially-extracted PDFs

### Decision 3: Fallback Detection

**Choice**: "Add Image" button triggers manual rectangle drawing

**Rationale**:
- Avoids external AI dependency and cost
- Reuses existing rectangle drawing code
- User provides feedback that improves detection data
- Simpler implementation, can add AI fallback later if needed

**Implementation**:
- User clicks "Add Image" button in toolbar
- Existing rectangle drawing UI activates
- User draws rectangle around missed image
- Image added to `detected_images` with `detection_method='manual'`

### Decision 4: Cross-User Deduplication

**Choice**: PDF binary hash + per-image content hash

**Rationale**:
- Same PDF file uploaded by different users = identical structure
- Perceptual hash (pHash) catches visually identical images even with minor differences
- Enables 60-80% cache hit rate for popular textbooks

**Cache key structure**:
```
pdf_hash:page:image_index → detected_image_id
detected_image_id:locale → explanation
```

Note: Cross-user sharing works because same PDF binary produces same `pdf_hash`, and images are identified by page and render order.

### Decision 5: No In-PDF Image Deduplication

**Choice**: Each image within a PDF is treated independently (no pHash)

**Rationale**:
- Simplifies implementation significantly (no DCT, no hash comparison)
- Identical images in same PDF are relatively rare
- Users may want different explanations for same image in different contexts
- Can add deduplication later if needed based on usage data

**Implementation**:
- Cache key: `pdf_hash:page:image_index` (position-based only)
- No `content_hash` field needed in database
- Each image click triggers its own explanation (or cache lookup by position)

### Decision 6: Click-Miss Behavior

**Choice**: Highlight all detected images on page

**Rationale**:
- Teaches users what's clickable
- No need for separate "show images" button
- Non-intrusive (appears only on miss)

**Implementation**:
- Click event fires
- Hit-test against all detected image rects
- If no hit: add 2-second highlight overlay to all images
- Highlight: 2px dashed border + "Click on an image" tooltip

### Decision 7: Overlapping Images

**Choice**: Topmost wins (by z-index from PDF rendering order)

**Rationale**:
- Matches visual expectation (click what you see)
- PDF operator list is ordered by render sequence
- Simple implementation

### Decision 8: Explanation Trigger Flow

**Choice**: User-triggered explanation with shared cache lookup

**Rationale**:
- Avoids unnecessary AI costs (user may not want all images explained)
- Consistent with existing explain-page flow
- Allows lazy generation on demand

**Flow**:
1. Hover highlights always visible on detected images (no mode toggle)
2. User clicks on an image
3. System checks shared cache for existing explanation (by `pdf_hash:page:image_index`)
4. If cache hit → display immediately
5. If cache miss → trigger explanation generation → display when ready
6. Cache explanation for future users with same PDF

### Decision 9: Privacy Settings

**Choice**: Reuse existing `share_to_cache` user preference

**Rationale**:
- Users already opted in/out for sticker sharing
- Same mental model applies to image explanations
- No additional settings UI needed

### Decision 10: PDF Type Detection & Filtering

**Choice**: Heuristic-based PDF type detection with type-specific filtering

**Rationale**:
- PPT-converted and textbook PDFs have different image characteristics
- Single set of filtering rules would either miss content images or include too much decoration
- Simple heuristics can detect PDF type without AI

**PDF Type Detection Heuristics**:
```typescript
function detectPdfType(page: PDFPageProxy): 'ppt' | 'textbook' {
  // PPT indicators:
  // - Low text density (< 200 characters per page)
  // - Single-column layout
  // - Consistent page dimensions matching common slide ratios (16:9, 4:3)
  // - Large centered images

  // Textbook indicators:
  // - High text density (> 500 characters per page)
  // - Multi-column layout
  // - Variable image sizes
  // - Images inline with text
}
```

**Type-Specific Filtering**:

| Filter | PPT PDF | Textbook PDF |
|--------|---------|--------------|
| Min image area | 3% of page | 2% of page |
| Header/footer zone | Top/bottom 5% | Top/bottom 8% |
| Full-width banner filter | Width > 80% in zone | Width > 60% in zone |
| Background detection | Skip page-sized images | N/A |

## Data Model

### files table (add column)
```sql
ALTER TABLE files ADD COLUMN image_extraction_status TEXT DEFAULT 'pending';
-- Values: 'pending' | 'partial' | 'complete' | 'failed'

ALTER TABLE files ADD COLUMN image_extraction_progress INTEGER DEFAULT 0;
-- Number of pages with images extracted (for progress UI)
```

### detected_images table
```sql
CREATE TABLE detected_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash TEXT NOT NULL,                    -- SHA-256 of PDF file
  page INTEGER NOT NULL,                     -- 1-indexed page number
  image_index INTEGER NOT NULL,              -- Order on page (0-indexed)
  rect JSONB NOT NULL,                       -- { x, y, width, height } normalized 0..1
  detection_method TEXT NOT NULL,            -- 'ops' | 'manual'
  pdf_type TEXT,                             -- 'ppt' | 'textbook' | null (detected type)
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(pdf_hash, page, image_index)
);

CREATE INDEX idx_detected_images_lookup
  ON detected_images(pdf_hash, page);
```

### image_feedback table
```sql
CREATE TABLE image_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_image_id UUID REFERENCES detected_images(id),
  user_id UUID REFERENCES auth.users(id),
  feedback_type TEXT NOT NULL,      -- 'wrong_boundary' | 'missed_image' | 'false_positive'
  correct_rect JSONB,               -- User-provided correction (if applicable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| PDF.js OPS doesn't detect all images | "Add Image" button for manual fallback + feedback collection |
| Upload time increases for large PDFs | 50-page threshold + lazy extraction for remaining pages |
| User views unextracted page (>50) | Show brief loading, trigger lazy extraction, cache for next view |
| PDF type detection incorrect | Conservative defaults, feedback improves over time |
| User expects decorative images too | Click-miss highlights all detected images |
| Some PDFs use non-standard image embedding | Collect feedback data to inform future improvements |
| Identical images get separate explanations | Acceptable trade-off for simpler implementation |

## Migration Plan

1. **Phase 1**: Add image detection infrastructure + upload-time extraction
2. **Phase 2**: Add always-on hover highlights for detected images
3. **Phase 3**: Add "Add Image" button, replace mode toggle with click-to-select
4. **Phase 4**: Remove old mode toggle code (after validation)

Rollback: Feature flag `ENABLE_AUTO_IMAGE_DETECTION` defaults to false initially.

## Open Questions

*None remaining - all decisions made.*
