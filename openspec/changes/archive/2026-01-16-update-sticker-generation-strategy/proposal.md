# Change: Update Sticker Generation Strategy by PDF Type

## Why
Current implementation generates 2-6 stickers per page for all PDF types. PPT-style PDFs (presentations) should have a single full-page sticker for better readability, while text-dense PDFs need multi-sticker layout with bidirectional hover-to-source highlighting to help users locate the explained content in the original document.

## What Changes
- **PPT-style PDF**: Generate exactly 1 sticker per page with `anchor.rect` covering the entire page (`{x:0, y:0, width:1, height:1}`) and `anchor.isFullPage: true`
- **Text-dense PDF**: Generate 2-6 stickers per page with paragraph-aligned anchors (changed from previous 1-2 range), add bidirectional hover highlighting between sticker cards and PDF regions
- **Data model**: Add `isFullPage?: boolean` field to sticker anchor structure
- **UI interaction**: Add hover-to-source feature for text-dense PDFs (sticker hover highlights PDF region, PDF region hover highlights sticker card)

## Impact
- Affected specs: `ai-sticker-generation` (merge changes into `openspec/specs/ai-sticker-generation/spec.md`)
- Affected code:
  - `src/app/api/ai/explain-page/route.ts` - modify sticker generation logic
  - `src/features/stickers/components/sticker-panel.tsx` - add hover state management
  - `src/features/reader/components/pdf-viewer.tsx` - add region highlight overlay
  - `src/lib/stickers/types.ts` - update anchor type definition
- Affected docs: `01_light_prd.md`, `02_page_and_flow_design.md`, `03_api_design.md`, `04_tech_and_code_style.md` (already updated, including `isFullPage` in anchor structure)
