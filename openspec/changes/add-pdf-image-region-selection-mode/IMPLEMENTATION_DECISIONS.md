# Implementation Decisions Summary

This document captures key implementation decisions made during proposal review.

**Status**: ✅ All decisions finalized (2026-01-12)
**Ready to implement**: Yes

## 1. Canvas Access Strategy

**Decision**: DOM Query + Registration Pattern

**Approach**:
```typescript
// In PdfPage: Query canvas from rendered DOM
const canvas = containerRef.current.querySelector('canvas')
onCanvasReady(pageNumber, canvas)

// In PdfViewer: Maintain canvas registry
const canvasMap = useRef<Map<number, HTMLCanvasElement>>(new Map())
```

**Rationale**:
- react-pdf internal APIs are unreliable across versions
- DOM query is more stable and version-independent
- Full control over lifecycle management

---

## 2. Unrendered Page Handling

**Decision**: Eager JPEG Crop Caching (Mouse-Up Immediate Capture)

**Approach**:
```typescript
// Extract crop immediately when user completes drawing:
const handleRegionComplete = async (page, rect) => {
  const regionId = generateRegionId(page, rect)
  const canvas = canvasMap.current.get(page)
  const cropBlob = await cropPageRegion(canvas, rect)
  regionCrops.current.set(regionId, cropBlob)  // Cache immediately
  triggerGeneration()
}
```

**Rationale**:
- Virtual scrolling may unmount pages; canvas won't be available later
- Product requirement: "immediate generation" means canvas is guaranteed available at mouse-up
- No need for offscreen rendering or complex re-rendering logic
- Memory overhead acceptable: max 8 regions × ~500KB = ~4MB

---

## 3. Session Root Page Lifecycle

**Decision**: Session-Scoped (Cleared on Mode Exit)

**Lifecycle**:
- **Mode entry**: Capture `sessionRootPage = currentViewerPage`
- **During session**: Root page remains fixed (user can navigate to other pages)
- **Mode exit**: Clear `sessionRootPage` (null)
- **Re-entry**: New session; capture new root page

**Rationale**:
- Predictable: user always knows which page is being "explained"
- Avoids stale state and cross-session confusion
- Simpler than document-scoped persistence

---

## 4. Region ID Matching

**Decision**: Deterministic Geometric ID

**Format**:
```typescript
function generateRegionId(page: number, rect: Rect): string {
  return `${page}-${rect.x.toFixed(4)}-${rect.y.toFixed(4)}-${rect.width.toFixed(4)}-${rect.height.toFixed(4)}`
}

type ImageAnchor = {
  kind: "image"
  id: string  // Stored explicitly
  page: number
  rect: Rect
  mime: "image/jpeg"
}
```

**Usage**:
```typescript
// Hover highlighting: Direct ID match (no geometry comparison)
const regionIds = imageAnchors.map(a => a.id)
const matchedRegions = draftRegions.filter(r => regionIds.includes(r.id))
```

**Rationale**:
- Floating-point rect comparison is unreliable (rounding errors)
- ID-based matching is fast and precise
- ID needed for deletion operations anyway

---

## 5. Multipart Parsing

**Decision**: Next.js Built-in `formData()` API

**Approach**:
```typescript
export const runtime = 'nodejs'  // Required for file handling

export async function POST(request: NextRequest) {
  if (contentType?.includes('multipart/form-data')) {
    const formData = await request.formData()
    const payloadString = formData.get('payload') as string
    const payload = JSON.parse(payloadString)

    const images: Buffer[] = []
    let index = 0
    while (true) {
      const file = formData.get(`image_${index}`) as File | null
      if (!file) break
      images.push(Buffer.from(await file.arrayBuffer()))
      index++
    }
  }
}
```

**Rationale**:
- Next.js 13+ App Router has native multipart support
- No external dependencies (formidable, multer, etc.)
- Must use `runtime = 'nodejs'` (Edge runtime has limitations)

---

## 6. Reference Context Token Limiting

**Decision**: Character-Based Truncation with Retry

**Approach**:
```typescript
function truncateReferenceContext(text: string, maxChars = 8000): string {
  if (text.length <= maxChars) return text
  const truncated = text.substring(0, maxChars)
  const lastPeriod = truncated.lastIndexOf('.')
  return lastPeriod > maxChars * 0.8 ? truncated.substring(0, lastPeriod + 1) : truncated
}

// With retry on context_length_exceeded:
try {
  const response = await openai.chat.completions.create(...)
} catch (error) {
  if (error.code === 'context_length_exceeded') {
    referenceContext = truncateReferenceContext(referenceContext, 4000)
    const response = await openai.chat.completions.create(...)  // Retry once
  }
}
```

**Rationale**:
- No external dependencies (`tiktoken` adds weight + complexity)
- Character-based limits work for 95% of cases
- Rare failures handled by one-time retry with halved context
- If context_length errors become frequent (>1%), then introduce `tiktoken`

---

## 7. High-Frequency Request Handling

**Decision**: Client-Side Debounce (200ms) + Server-Side Idempotency

**Client-Side**:
```typescript
const triggerGeneration = useDebouncedCallback(() => {
  requestVersion++
  // Build FormData and call API
}, 200)  // 200ms debounce
```

**Server-Side**:
```typescript
// For identical (pdf_hash, root_page, selection_hash, prompt_version, locale):
// - Check if generation already in progress
// - Return existing generationId (202) or cached result (200)
// - Use DB constraint or FOR UPDATE SKIP LOCKED pattern
```

**Rationale**:
- Product requirement: "immediate generation" on each edit
- 200ms delay feels instant but merges rapid edits
- Server-side dedup prevents duplicate OpenAI calls (saves quota)
- Reduces API load from ~10 requests to ~1-2 requests for typical user workflow

---

## 8. Memory Management

**Lifecycle**:
```typescript
// On region drawn: Store JPEG blob
regionCrops.current.set(regionId, blob)

// On region deleted: Remove blob
regionCrops.current.delete(regionId)

// On mode exit: Clear all
regionCrops.current.clear()
canvasMap.current.clear()
```

**Memory Budget**:
- Max 8 regions
- Each JPEG crop: ~200-500KB
- Total: ~4MB (acceptable for modern browsers)

---

## Additional Critical Decisions (Finalized 2026-01-12)

### 8. Reference Context Pattern (Enhanced)

**Decision**: Hardened basic pattern for MVP with comprehensive telemetry.

**MVP Pattern**:
```typescript
const LABEL_PATTERNS = {
  en: /(?:Figure|Fig\.?|Table|Equation|Eq\.?|Algorithm|Alg\.?)\s*[:#]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/gi,
  zh: /(?:图|表|公式|算法)\s*[:：]?\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/g,
  zh_ord: /第\s*(\d+(?:\.\d+)?)\s*(?:图|表|式|公式)/g
};
```

**Rationale**:
- Covers 85%+ academic cases (numbers and decimals only)
- `zh_ord` pattern captures common Chinese textbook format ("第7图")
- Robustness additions: optional colons, parentheses, abbreviations (Fig., Eq., Alg.)

**Required Telemetry**:
```typescript
{
  label_extracted: boolean,
  ref_match_found: boolean,
  label_type: 'figure' | 'table' | 'equation' | 'algorithm',
  label_value: string,  // e.g., "7" or "3.2"
  fallback_used: boolean
}
```

**Post-MVP Trigger**: Extend patterns only if `miss_rate > 10%` after 2 weeks of data.

---

### 9. Scanned PDF Check - No Pre-flight

**Decision**: Accept bandwidth cost; check AFTER formData parsing for MVP.

**Rationale**:
- `request.formData()` already loads body into memory; true bandwidth saving requires streaming parser
- Bandwidth waste: ~4MB × rejection_rate (assume 5%) = 200KB per request
- Streaming parser adds complexity and dependencies (formidable, busboy)
- **MVP priority: Simplicity and correctness over optimization**

**Implementation**:
```typescript
const formData = await request.formData();
const payload = JSON.parse(formData.get("payload") as string);

const file = await getFileMetadata(payload.fileId);
if (file.is_scanned && payload.effectiveMode === "with_selected_images") {
  logEvent("scanned_pdf_rejected_after_upload", {
    fileId: payload.fileId,
    total_upload_bytes: request.headers.get("content-length")
  });
  return error("FILE_IS_SCANNED");
}
```

**Post-MVP Trigger**:
- If `rejected_rate > 10%` OR `wasted_bandwidth > X GB/day`
- **Preferred optimization**: Frontend pre-check (query file metadata before upload) rather than streaming parser

---

### 10. Missing Crop Error Handling - Always Abort

**Decision**: ABORT entire request if ANY crop is missing. Do NOT skip regions or send partial data.

**Rationale**:
- **Correctness over availability**: Skipping a region causes index mismatch between `selectedImageRegions[]` and `image_i` files
- Mismatched indices lead to AI explaining wrong images → serious correctness bug
- UX acceptable: User can delete problematic region and redraw (no resize/undo in MVP anyway)

**Implementation**:
```typescript
for (let i = 0; i < regions.length; i++) {
  const blob = regionCrops.current.get(regions[i].id);
  if (!blob) {
    logError("missing_crop", {
      regionId: regions[i].id,
      page: regions[i].page,
      totalRegions: regions.length,
      cachedCrops: regionCrops.current.size
    });
    showToast("某个选区截图失败，请删除该选区并重新框选");
    return; // ABORT: do not send request
  }
  formData.append(`image_${i}`, blob);
}
```

---

### 11. Canvas Registration - MutationObserver Primary

**Decision**: Use `MutationObserver` as primary mechanism with 5-second timeout protection.

**Implementation**:
```typescript
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  const tryRegister = () => {
    const canvas = el.querySelector("canvas");
    if (canvas) {
      onCanvasReady(pageNumber, canvas as HTMLCanvasElement);
      return true;
    }
    return false;
  };

  if (tryRegister()) return;

  const obs = new MutationObserver(() => {
    if (tryRegister()) {
      obs.disconnect();
      clearTimeout(timeoutId);
    }
  });

  const timeoutId = setTimeout(() => {
    obs.disconnect();
    console.warn(`Canvas registration timeout for page ${pageNumber}`);
  }, 5000);

  obs.observe(el, { childList: true, subtree: true });
  return () => {
    obs.disconnect();
    clearTimeout(timeoutId);
  };
}, [pageNumber]);
```

**Rationale**:
- MutationObserver is event-driven; captures canvas as soon as it appears
- More reliable than `setTimeout` retry guessing
- 5-second timeout prevents infinite waiting

---

### 12. Quota on Cache Hit - No Changes

**Decision**: Keep original design. Cache hits for `with_selected_images` mode consume quota.

**Rationale**:
- Product decision: User-directed selection is premium interaction
- Prevents abuse via repeated cache hits
- Consistent with product intent (limit usage)

**Post-MVP**: Monitor user feedback; if complaints > 5%, consider adjustment options (reduced cost or cache indicator UI).

---

## Implementation Priority

These decisions are **non-negotiable for MVP**:
1. Canvas access with MutationObserver (3.3) - Required for crop extraction
2. Eager caching (3.4) - Solves virtual scrolling issue
3. Region IDs (1.3, 5.3) - Required for hover highlighting
4. Debounce 200ms (4.3) - Prevents API spam
5. **Missing crop abort (4.2)** - Prevents correctness bugs
6. **Hardened label patterns with telemetry (2.4)** - Enables data-driven iteration

These can be adjusted post-MVP:
- Character-based truncation (can add tiktoken later)
- Debounce timing (200ms can be tuned)
- Memory management (can add eviction policy if needed)
- Scanned PDF pre-flight check (can add if waste > threshold)

---

## Migration Notes

**No Breaking Changes**:
- `selection_hash` column is nullable (existing rows unaffected)
- `anchor.anchors` is optional (legacy format still works)
- Multipart detection is content-type based (JSON requests still work)

**Rollback Safety**:
- Feature can be disabled via flag without database rollback
- `selection_hash` column can remain NULL for all rows
