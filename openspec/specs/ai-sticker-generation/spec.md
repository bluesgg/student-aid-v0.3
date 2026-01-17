# ai-sticker-generation Specification

## Purpose
Defines the behavior of automatic sticker generation for PDF pages using AI-powered content analysis.
## Requirements
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

### Requirement: Minimum Sticker Guarantee
The system SHALL always generate at least one sticker per page.

#### Scenario: Empty or minimal content page
- **GIVEN** a PDF page with less than 50 words but at least some text
- **WHEN** user requests auto-explanation for the page
- **THEN** the system generates exactly 1 sticker
- **AND** the sticker summarizes the available content

#### Scenario: AI returns zero stickers
- **GIVEN** the AI model returns an empty explanations array
- **WHEN** the response is parsed
- **THEN** the parser creates 1 fallback sticker
- **AND** the fallback sticker contains the raw AI response content

### Requirement: Paragraph-Based Splitting
For pages exceeding 500 words, the system SHALL use paragraph structure to determine sticker placement.

#### Scenario: Multi-paragraph dense page
- **GIVEN** a PDF page with 600 words across 4 distinct paragraphs
- **WHEN** user requests auto-explanation
- **THEN** AI identifies the 4 paragraph boundaries
- **AND** generates 1 sticker for each paragraph's main concept
- **AND** total sticker count is 4

#### Scenario: Maximum sticker limit enforcement
- **GIVEN** a PDF page with 1000 words across 12 paragraphs
- **WHEN** user requests auto-explanation
- **THEN** AI prioritizes the most important 8 paragraphs
- **AND** generates exactly 8 stickers (maximum limit)
- **AND** stickers cover the most critical concepts

### Requirement: Word Count Calculation
The system SHALL calculate word count accurately before generating the AI prompt.

#### Scenario: Word count determines sticker target
- **GIVEN** a page text with "Hello world this is a test document"
- **WHEN** the system calculates word count
- **THEN** word count is 8 words
- **AND** system determines target sticker count is 1 (0-150 tier)

#### Scenario: Word count included in AI prompt
- **GIVEN** a page with calculated word count
- **WHEN** building the AI prompt
- **THEN** prompt includes the word count value
- **AND** prompt specifies the target number of stickers to generate

### Requirement: Image Extraction from PDF (MANDATORY)
The system SHALL extract or render images from EVERY PDF page for AI analysis.

#### Scenario: Extract embedded images from page with diagrams
- **GIVEN** a PDF page containing 3 embedded images
- **WHEN** the system extracts images from the page
- **THEN** 3 embedded images are extracted
- **AND** each image is converted to base64 format
- **AND** images are ready to be sent to AI

#### Scenario: Mandatory page rendering fallback
- **GIVEN** a PDF page with no extractable embedded images
- **WHEN** the system attempts to extract images
- **THEN** the entire page is rendered as a canvas image
- **AND** the rendered image is converted to base64
- **AND** at least 1 image (the rendered page) is returned
- **AND** the system proceeds with image analysis

#### Scenario: Scanned PDF page rendering
- **GIVEN** a scanned PDF page (image-based, no text layer)
- **WHEN** the system processes the page
- **THEN** the page is rendered as an image
- **AND** at least 1 image is returned to AI
- **AND** FILE_IS_SCANNED error is NOT thrown
- **AND** AI can analyze the visual content

#### Scenario: Image compression for large pages
- **GIVEN** a rendered page that exceeds 5MB in size
- **WHEN** the system compresses the image
- **THEN** the image is converted to JPEG format
- **AND** the image is resized to max 2048px width
- **AND** the compressed image is under 5MB
- **AND** the image quality remains usable for AI analysis

### Requirement: Multimodal AI Analysis
The system SHALL send both text and images to GPT-4 Vision for comprehensive analysis.

#### Scenario: Combined text and image analysis
- **GIVEN** a PDF page with 200 words of text and 2 diagrams
- **WHEN** the system generates stickers
- **THEN** AI receives both text content and 2 images
- **AND** AI generates stickers explaining both text concepts and diagrams
- **AND** total sticker count does not exceed 8

#### Scenario: Image-only page analysis
- **GIVEN** a PDF page with only images (no readable text)
- **WHEN** the system generates stickers
- **THEN** AI analyzes the images
- **AND** at least 1 sticker is generated explaining the visual content

#### Scenario: Diagram interpretation in stickers
- **GIVEN** a PDF page with a biology diagram
- **WHEN** AI analyzes the page
- **THEN** at least one sticker explains the diagram
- **AND** the sticker describes what the diagram represents
- **AND** the sticker identifies key components in the diagram

### Requirement: GPT-4 Vision Model Usage
The system SHALL use GPT-4o model for multimodal analysis.

#### Scenario: Model upgrade for vision support
- **GIVEN** the explain-page API is called
- **WHEN** the system sends a request to OpenAI
- **THEN** the model used is `gpt-4o`
- **AND** the request format supports multimodal messages

#### Scenario: Every page receives visual analysis
- **GIVEN** any PDF page (scanned or digital)
- **WHEN** the system builds the AI prompt
- **THEN** at least one image is included in the request
- **AND** GPT-4o receives both text and visual content
- **AND** AI can analyze visual elements on the page

### Requirement: Conversational Continuity Across Pages
The system SHALL maintain conversation context across sequential pages of a document.

#### Scenario: First page has no history
- **GIVEN** the user requests stickers for page 1 of a document
- **WHEN** the system builds the AI prompt
- **THEN** no conversation history is included
- **AND** the AI generates stickers based solely on page 1 content

#### Scenario: Subsequent pages include previous context
- **GIVEN** the user requests stickers for page 5 of a document
- **AND** pages 1-4 already have auto-stickers generated
- **WHEN** the system builds the AI prompt
- **THEN** conversation history from pages 1-4 is retrieved
- **AND** history is included in the OpenAI messages array
- **AND** AI can reference concepts from earlier pages

#### Scenario: History token limit enforcement
- **GIVEN** a document with 20 pages of previous stickers
- **WHEN** generating stickers for page 21
- **THEN** conversation history is limited to last 3-5 pages or 2000 tokens
- **AND** older pages are summarized or omitted
- **AND** total context stays within API limits

#### Scenario: AI references previous pages
- **GIVEN** page 2 introduces a concept related to page 1
- **WHEN** AI generates stickers for page 2
- **THEN** stickers may reference page 1 content
- **AND** explanations show awareness of document flow
- **AND** students can follow the narrative progression

#### Scenario: Conversation history with images
- **GIVEN** page 3 contains a diagram building on page 1's diagram
- **WHEN** AI generates stickers for page 3
- **THEN** AI can reference the earlier diagram from page 1
- **AND** image explanations maintain continuity
- **AND** visual concepts are connected across pages

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

### Requirement: Context-Enhanced Auto-Explanation
The system SHALL inject relevant context from the course library when generating auto-stickers.

#### Scenario: Auto-explain with context injection
- **GIVEN** a user clicks "Explain this page" on page 15 of Lecture05.pdf
- **AND** page 15 contains text "using the chain rule to differentiate composite functions"
- **AND** Lecture03.pdf has a context entry for "Chain Rule" formula
- **WHEN** the system builds the auto-explain prompt
- **THEN** context retrieval extracts keywords ["chain rule", "differentiate", "composite functions"]
- **AND** retrieves the "Chain Rule" formula from Lecture03
- **AND** the AI prompt includes:
  ```
  <knowledge-base>
  [
    {
      "type": "formula",
      "title": "Chain Rule",
      "content": "If f(x) = g(h(x)), then f'(x) = g'(h(x)) · h'(x)",
      "source": "Lecture03.pdf, page 8"
    }
  ]
  </knowledge-base>

  Current page text: ...using the chain rule to differentiate composite functions...
  ```
- **AND** the generated sticker may reference the formula from Lecture03

#### Scenario: Auto-explain cites previous definitions
- **GIVEN** page 20 mentions "risky asset hedging"
- **AND** Lecture05.pdf page 12 has a principle about risk-free rates for hedged portfolios
- **WHEN** the system generates auto-stickers for page 20
- **THEN** the sticker content includes "According to the principle from page 12, when a risky asset is perfectly hedged..."
- **AND** the citation helps students connect concepts across pages

#### Scenario: Graceful fallback when context unavailable
- **GIVEN** context retrieval fails due to database error
- **WHEN** auto-explain is called
- **THEN** the system logs the error
- **AND** proceeds with original prompt (no context)
- **AND** stickers are still generated successfully
- **AND** user is not notified of degradation

### Requirement: Context-Enhanced Selection Explanation
The system SHALL inject relevant context when explaining user-selected text or images.

#### Scenario: Selection-explain with definition context
- **GIVEN** a user selects text "partial derivative" on page 18
- **AND** Lecture02.pdf has a definition entry for "Partial Derivative"
- **WHEN** the system generates the explanation
- **THEN** the prompt includes the definition from Lecture02
- **AND** the explanation sticker uses the formal definition as foundation
- **AND** adds clarification specific to the selected text

#### Scenario: Image selection with theorem context
- **GIVEN** a user selects a diagram showing the Mean Value Theorem
- **AND** Lecture04.pdf has a theorem entry for "Mean Value Theorem"
- **WHEN** the system generates explanation for the selected image
- **THEN** reference context is derived from nearby text (existing behavior)
- **AND** theorem definition is retrieved from context library
- **AND** the explanation connects the diagram to the formal theorem statement

---

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

