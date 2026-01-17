## MODIFIED Requirements

### Requirement: Word-Count-Based Sticker Generation
The system SHALL use different sticker generation strategies based on PDF type detection.

#### Scenario: PPT-type PDF generates exactly 1 full-page sticker
- **GIVEN** a PPT-type PDF page (avgCharsPerPage < 500 OR imageRatio > 0.6)
- **WHEN** auto-explain generates stickers for the page
- **THEN** system generates exactly 1 sticker for the page
- **AND** sticker.anchor.rect = { x: 0, y: 0, width: 1, height: 1 }
- **AND** sticker.anchor.isFullPage = true
- **AND** sticker content summarizes the entire slide

#### Scenario: Text-type PDF uses paragraph accumulation with 2-6 stickers
- **GIVEN** a text-type PDF page with 500+ words
- **WHEN** auto-explain generates stickers for the page
- **THEN** system generates 2-6 stickers based on paragraph structure
- **AND** each sticker.anchor.rect corresponds to the source paragraph region
- **AND** sticker.anchor.isFullPage is undefined or false
- **AND** old word-count tier logic is NOT used

---

## ADDED Requirements

### Requirement: Full-Page Sticker Anchor Marker
The system SHALL mark PPT-type stickers with an explicit full-page indicator in the anchor structure.

#### Scenario: PPT sticker has isFullPage flag set
- **GIVEN** a PPT-type PDF
- **WHEN** auto-explain generates a sticker
- **THEN** sticker.anchor.isFullPage = true
- **AND** sticker.anchor.rect = { x: 0, y: 0, width: 1, height: 1 }

#### Scenario: Text-type sticker has no isFullPage flag
- **GIVEN** a text-type PDF
- **WHEN** auto-explain generates stickers
- **THEN** sticker.anchor.isFullPage is undefined or false
- **AND** sticker.anchor.rect corresponds to paragraph boundaries

#### Scenario: Legacy stickers without isFullPage flag
- **GIVEN** an existing sticker created before this feature
- **WHEN** system reads the sticker
- **THEN** missing isFullPage is treated as false
- **AND** hover highlighting behavior applies normally

---

### Requirement: Bidirectional Hover-to-Source Highlighting
The system SHALL provide bidirectional hover highlighting between sticker cards and PDF paragraph regions for text-type PDFs.

#### Scenario: Hover sticker card highlights PDF region
- **GIVEN** a text-type PDF with paragraph-aligned stickers
- **AND** sticker has anchor.rect = { x: 0.1, y: 0.2, width: 0.8, height: 0.15 }
- **WHEN** user hovers over the sticker card
- **THEN** PDF viewer highlights the region at (x: 0.1, y: 0.2, width: 0.8, height: 0.15)
- **AND** highlight style is: border: 2px solid #3B82F6, background: rgba(59,130,246,0.1)
- **AND** transition animation is 150ms ease-in-out

#### Scenario: Hover PDF region highlights sticker card
- **GIVEN** a text-type PDF with paragraph-aligned stickers
- **AND** sticker has anchor.rect covering region R
- **WHEN** user hovers mouse over region R in PDF viewer
- **THEN** corresponding sticker card is highlighted
- **AND** highlight style is: border: 2px solid #3B82F6, background: rgba(59,130,246,0.05)
- **AND** transition animation is 150ms ease-in-out

#### Scenario: Multiple stickers covering same region all highlight
- **GIVEN** two stickers with overlapping anchor.rect regions
- **WHEN** user hovers over the overlapping PDF region
- **THEN** both sticker cards are highlighted simultaneously

#### Scenario: Full-page stickers skip hover highlighting
- **GIVEN** a PPT-type PDF with full-page sticker (anchor.isFullPage = true)
- **WHEN** user hovers over the sticker card
- **THEN** no PDF region highlight is shown
- **AND** no special highlighting occurs (full page is already visible)

#### Scenario: Mouse leaves highlighted element
- **GIVEN** a sticker card or PDF region is currently highlighted
- **WHEN** mouse leaves the trigger element
- **THEN** highlight fades out with 150ms transition
- **AND** both PDF and sticker return to normal state
