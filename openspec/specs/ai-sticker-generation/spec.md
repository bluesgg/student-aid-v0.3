# ai-sticker-generation Specification

## Purpose
Defines the behavior of automatic sticker generation for PDF pages using AI-powered content analysis.

## Requirements

### Requirement: Word-Count-Based Sticker Generation
The system SHALL generate stickers based on page word count rather than a fixed count.

#### Scenario: Short page (0-150 words)
- **GIVEN** a PDF page with 0-150 words of text content
- **WHEN** user requests auto-explanation for the page
- **THEN** the system generates exactly 1 sticker
- **AND** the sticker explains the main concept on the page

#### Scenario: Medium page (151-300 words)
- **GIVEN** a PDF page with 151-300 words of text content
- **WHEN** user requests auto-explanation for the page
- **THEN** the system generates exactly 2 stickers
- **AND** stickers cover 2 distinct key concepts

#### Scenario: Long page (301-500 words)
- **GIVEN** a PDF page with 301-500 words of text content
- **WHEN** user requests auto-explanation for the page
- **THEN** the system generates 3-4 stickers
- **AND** stickers are distributed across major concepts

#### Scenario: Very long page (500+ words)
- **GIVEN** a PDF page with more than 500 words of text content
- **WHEN** user requests auto-explanation for the page
- **THEN** the system identifies paragraph boundaries
- **AND** generates 1 sticker per significant paragraph
- **AND** generates no more than 8 stickers total
- **AND** each sticker corresponds to a logical content section

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
