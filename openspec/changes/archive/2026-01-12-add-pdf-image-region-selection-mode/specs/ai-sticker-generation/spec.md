# ai-sticker-generation Specification Delta

## Purpose
Extends automatic sticker generation to support user-selected image regions with multimodal analysis.

---

## ADDED Requirements

### Requirement: User-Selected Image Region Mode
The system SHALL support generating stickers based on user-selected rectangular regions.

#### Scenario: Generate with single selected region
- **GIVEN** user has selected 1 rectangular region on page 13 (root page 12)
- **AND** the region contains a diagram
- **WHEN** system generates auto-stickers with effectiveMode='with_selected_images'
- **THEN** system extracts JPEG crop from the selected region
- **AND** sends the crop to GPT-4o with reference context text
- **AND** generates at least 1 sticker explaining the diagram
- **AND** sticker anchor includes both TextAnchor (reference) and ImageAnchor (region)

#### Scenario: Generate with multiple regions across pages
- **GIVEN** user has selected 3 regions: 2 on page 13, 1 on page 14 (root page 12)
- **WHEN** system generates auto-stickers
- **THEN** system extracts 3 JPEG crops
- **AND** sends all crops with reference context in single multimodal request
- **AND** generates stickers covering all selected regions
- **AND** total sticker count does not exceed 8

#### Scenario: Region addition triggers new generation
- **GIVEN** user has 2 selected regions with generated stickers
- **WHEN** user adds a 3rd region
- **THEN** system immediately triggers new generation with all 3 regions
- **AND** previous stickers are replaced with new stickers covering all 3 regions

#### Scenario: Region deletion triggers updated generation
- **GIVEN** user has 3 selected regions with generated stickers
- **WHEN** user deletes 1 region
- **THEN** system immediately triggers new generation with remaining 2 regions
- **AND** stickers are updated to reflect only the 2 remaining regions

### Requirement: Extended Anchor Data Structure
The system SHALL support multi-anchor sticker binding while maintaining backward compatibility.

#### Scenario: New sticker with multiple anchors
- **GIVEN** system generates a sticker for selected image regions
- **WHEN** sticker is stored
- **THEN** anchor contains `anchors` array with:
  - 1 TextAnchor for reference context (page, textSnippet, rect?)
  - N ImageAnchor entries (one per selected region)
- **AND** each ImageAnchor includes: kind='image', page, rect, mime='image/jpeg'

#### Scenario: Legacy sticker without anchors array
- **GIVEN** a sticker stored before this feature (no `anchors` field)
- **WHEN** system parses the sticker anchor
- **THEN** system constructs backward-compatible TextAnchor from `textSnippet` and `rect` fields
- **AND** rendering continues to work correctly

#### Scenario: Sticker with image anchors enables hover highlighting
- **GIVEN** a sticker with 2 ImageAnchor entries in `anchor.anchors`
- **WHEN** user hovers over the sticker card
- **THEN** system identifies the 2 bound regions
- **AND** highlights them in the PDF viewer

### Requirement: Selection-Based Cache Isolation
The system SHALL prevent cache collisions between different user selections using selection_hash.

#### Scenario: Same PDF, same page, different selections
- **GIVEN** User A selects regions [R1, R2] on page 12
- **AND** User B selects regions [R3, R4] on page 12 of the same PDF
- **WHEN** both users request generation
- **THEN** system computes different selection_hash values
- **AND** both requests generate independently (no cache collision)

#### Scenario: Same selections yield cache hit across users
- **GIVEN** User A selects regions [R1, R2] on page 12 (geometry: page 13 rect[0.1, 0.2, 0.3, 0.4], page 13 rect[0.5, 0.6, 0.2, 0.3])
- **AND** User B selects identical regions on the same PDF (same normalized coordinates)
- **WHEN** User B requests generation after User A
- **THEN** system computes identical selection_hash
- **AND** returns cached stickers from User A's generation
- **AND** quota is still deducted for User B (mode-specific policy)

#### Scenario: Cache key includes root page and locale
- **GIVEN** User A selects regions on page 13 with root page 12, locale='en'
- **AND** User B selects identical regions but root page 14, locale='en'
- **WHEN** cache lookup occurs
- **THEN** selection_hash differs due to different root_page
- **AND** both generate independently

#### Scenario: Coordinate precision tolerance
- **GIVEN** User A selects region with rect { x: 0.12345678, y: 0.3 }
- **AND** User B selects region with rect { x: 0.12346789, y: 0.3 }
- **WHEN** system computes selection_hash (rounds to 4 decimals)
- **THEN** both normalize to { x: 0.1235, y: 0.3000 }
- **AND** selection_hash matches (cache hit)

### Requirement: Reference Context Derivation
The system SHALL derive reference context from textual references rather than image page content.

#### Scenario: Label found in reference text
- **GIVEN** page 12 text contains "as shown in Figure 7"
- **AND** user selects a region on page 13 (where Figure 7 is located)
- **WHEN** system derives reference context
- **THEN** system extracts label "Figure 7" from image page
- **AND** searches corpus for "Figure 7" reference
- **AND** finds match on page 12: "as shown in Figure 7"
- **AND** returns matched paragraph + previous paragraph as context

#### Scenario: Multiple label patterns (English)
- **GIVEN** page text contains various references:
  - "see Figure 3"
  - "shown in Fig. 5"
  - "Table 2 summarizes"
  - "Equation (7) defines"
- **WHEN** system searches for labels
- **THEN** regex patterns match: `Figure|Fig\.|Table|Equation` + number
- **AND** extracts corresponding reference context

#### Scenario: Multiple label patterns (Chinese)
- **GIVEN** page text contains: "如图7所示" or "见表3" or "公式(5)表示"
- **WHEN** system searches for labels
- **THEN** regex patterns match: `图|表|公式` + number
- **AND** extracts corresponding reference context

#### Scenario: Label not found - fallback to image page
- **GIVEN** selected region is on page 13
- **AND** system cannot extract a recognizable label
- **WHEN** reference context derivation runs
- **THEN** system falls back to using page 13 local context
- **AND** generation proceeds normally

#### Scenario: Token limit enforcement
- **GIVEN** matched context is 5000 tokens (reference paragraph + previous)
- **WHEN** system applies context window limit (e.g., 3200 tokens)
- **THEN** context is truncated to fit limit
- **AND** truncation prioritizes matched paragraph over previous

### Requirement: Quota Deduction on Cache Hit (Mode-Specific)
The system SHALL deduct quota for cached results when effectiveMode='with_selected_images'.

#### Scenario: Cache hit for selected-images mode
- **GIVEN** User A generates stickers for selected regions (cache miss, quota deducted)
- **AND** User B requests identical selection (cache hit)
- **WHEN** system returns cached stickers with effectiveMode='with_selected_images'
- **THEN** system deducts 1 autoExplain quota from User B
- **AND** response includes `cached: true` and `source: 'shared'`

#### Scenario: Other effective modes unchanged
- **GIVEN** a cache hit for effectiveMode='with_images' (not selected-images)
- **WHEN** system returns cached stickers
- **THEN** quota is NOT deducted (existing behavior)
- **AND** only 'with_selected_images' mode has this special policy

### Requirement: Scanned PDF Rejection
The system SHALL reject selected-images requests for scanned PDFs.

#### Scenario: Scanned PDF detection
- **GIVEN** a PDF file with `is_scanned: true`
- **WHEN** user attempts to generate stickers with selected regions
- **THEN** system returns 400 error with code 'FILE_IS_SCANNED'
- **AND** error message is "Scanned PDFs do not support image region selection"
- **AND** no generation is started

---

## ADDED Requirements (continued)

### Requirement: Multimodal Prompt Construction for Selected Regions
The system SHALL construct multimodal prompts for selected image regions.

#### Scenario: Prompt with selected regions and reference context
- **GIVEN** user selected 2 regions on page 13
- **AND** reference context derived: "Figure 7 shows the network architecture..."
- **WHEN** system builds multimodal prompt
- **THEN** prompt includes:
  - Text message with reference context
  - Image message for region 1 (JPEG base64)
  - Image message for region 2 (JPEG base64)
- **AND** system prompt instructs: "Explain the images selected by the user"
- **AND** model used is `gpt-4o`

#### Scenario: Optional text selection included
- **GIVEN** user selected 2 image regions
- **AND** user also has text selected: "as shown in Figure 7" (page 12)
- **WHEN** system builds prompt
- **THEN** prompt includes text selection as additional context
- **AND** resulting sticker anchor.anchors includes extra TextAnchor for user text selection

---

## REMOVED Requirements

None. This change is additive and does not remove existing functionality.

---

## Notes

### Backward Compatibility
- Legacy stickers (single `textSnippet` + `rect`) remain supported
- `getAnchors(sticker)` helper provides unified parsing
- No database migration required for `stickers` table

### New Effective Mode
- `with_selected_images`: User-directed image region mode
- Existing modes (`text_only`, `with_images`) unchanged

### Shared Cache Schema
- New column: `selection_hash VARCHAR(64) NULL`
- Partial unique indexes prevent collision between selection and non-selection entries
