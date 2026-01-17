# Design: Update Sticker Generation Strategy

## Context
Users reading PPT-style lecture slides want a single comprehensive explanation per page, while users reading dense academic text need multiple targeted explanations with the ability to trace each explanation back to its source paragraph.

## Goals / Non-Goals
**Goals:**
- PPT PDFs: 1 full-page sticker per page for cleaner UI
- Text PDFs: 2-6 paragraph-aligned stickers with bidirectional hover highlighting
- Maintain backward compatibility with existing stickers

**Non-Goals:**
- Changing the PDF type detection algorithm (keep existing: avgCharsPerPage < 500 OR imageRatio > 0.6)
- Adding aspect ratio detection (16:9)
- Implementing hover highlighting for PPT-type PDFs (not needed for full-page stickers)

## Decisions

### 1. Anchor Structure Extension
**Decision**: Add `isFullPage?: boolean` to anchor structure instead of inferring from rect values.

**Rationale**: Explicit flag is clearer than checking `rect.x === 0 && rect.width === 1`. Also enables future flexibility if we need partial-page "full coverage" stickers.

```typescript
interface Anchor {
  textSnippet?: string
  rect?: { x: number; y: number; width: number; height: number }
  isFullPage?: boolean  // NEW: true for PPT-type full-page stickers
  anchors?: AnchorItem[]
}
```

### 2. Hover State Management
**Decision**: Use React Context for bidirectional hover state instead of prop drilling.

**Rationale**: PDF viewer and sticker panel are siblings in component tree. Context enables clean state sharing without complex prop chains.

```typescript
interface HoverHighlightContext {
  hoveredStickerId: string | null
  setHoveredStickerId: (id: string | null) => void
  hoveredPdfRegion: { page: number; rect: Rect } | null
  setHoveredPdfRegion: (region: { page: number; rect: Rect } | null) => void
}
```

### 3. PDF Region Hit Detection
**Decision**: Use normalized coordinates (0-1) for hit testing to avoid scale-dependent calculations.

**Rationale**: PDF viewer zoom level changes pixel coordinates, but normalized coordinates remain stable.

```typescript
function isPointInRegion(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}
```

### 4. Hover Highlighting Skip Condition
**Decision**: Skip hover highlighting when `anchor.isFullPage === true`.

**Rationale**: Full-page stickers already correspond to the entire visible page; highlighting the whole page adds no value and may feel jarring.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Performance: frequent mousemove events | Throttle to 50ms, only track when stickers have anchors. Hit detection is O(n) where n ≤ 6 stickers/page, acceptable for MVP. |
| Overlapping anchor regions | Highlight all matching stickers when multiple share same region |
| Existing stickers lack `isFullPage` | Treat `undefined` as `false` (default behavior) |

## Migration Plan
1. Deploy backend changes (anchor.isFullPage support) - backward compatible
2. Deploy frontend hover highlighting - only activates for text-type PDFs
3. No data migration needed - existing stickers continue to work

## Open Questions
- None at this time (user confirmed: anchor覆盖整页, 双向联动, 沿用现有检测逻辑)
