## RETAINED Requirements

### Requirement: Rectangle Drawing (as fallback)
**Reason**: Retained for "Report missed image" functionality when auto-detection fails.
**Usage**: Only activated when user clicks "Report missed image" button.

---

## ADDED Requirements

### Requirement: Auto Image Detection
The system SHALL automatically detect and extract image positions from PDF pages using PDF.js operator parsing.

#### Scenario: Detect images on PDF upload (small PDF ≤50 pages)
- **GIVEN** user uploads a PDF file with 50 or fewer pages
- **WHEN** file extraction process runs (alongside context extraction)
- **THEN** system extracts image positions from ALL pages using `getOperatorList()` with `OPS.paintImageXObject`
- **AND** detects PDF type (PPT-converted vs textbook) using heuristics
- **AND** applies type-specific filtering rules
- **AND** stores detected images with normalized coordinates (0..1)
- **AND** sets file `image_extraction_status` to `complete`
- **AND** caches results for all users uploading the same PDF

#### Scenario: Detect images on PDF upload (large PDF >50 pages)
- **GIVEN** user uploads a PDF file with more than 50 pages
- **WHEN** file extraction process runs
- **THEN** system extracts image positions from first 50 pages only
- **AND** sets file `image_extraction_status` to `partial`
- **AND** sets `image_extraction_progress` to 50
- **AND** shows progress indicator: "Image detection: 50/N pages"

#### Scenario: Lazy extraction when viewing unextracted page
- **GIVEN** PDF has >50 pages and `image_extraction_status` is `partial`
- **AND** user navigates to page 60 (not yet extracted)
- **WHEN** page loads
- **THEN** system triggers lazy extraction for page 60
- **AND** shows brief loading indicator on page
- **AND** hover highlights appear when extraction completes
- **AND** updates `image_extraction_progress`

#### Scenario: OPS detection finds no images
- **GIVEN** PDF.js OPS detection finds no images on a page
- **WHEN** user attempts to explain an image via "Report missed image"
- **THEN** system activates manual rectangle drawing mode
- **AND** user draws rectangle around missed image
- **AND** image is added with `detection_method='manual'`

#### Scenario: Filter decorative images by size (textbook PDF)
- **GIVEN** PDF is detected as textbook type
- **AND** image detection finds an image with area < 2% of page
- **WHEN** filtering is applied
- **THEN** image is excluded from clickable images
- **AND** image is not highlighted on hover

#### Scenario: Filter decorative images by size (PPT PDF)
- **GIVEN** PDF is detected as PPT type
- **AND** image detection finds an image with area < 3% of page
- **WHEN** filtering is applied
- **THEN** image is excluded from clickable images

#### Scenario: Filter page-sized background images (PPT PDF)
- **GIVEN** PDF is detected as PPT type
- **AND** image detection finds an image covering > 90% of page
- **WHEN** filtering is applied
- **THEN** image is excluded (likely decorative slide background)

#### Scenario: Filter images in header/footer zones (textbook PDF)
- **GIVEN** PDF is detected as textbook type
- **AND** image detection finds an image in top 8% or bottom 8% of page
- **AND** image width spans > 60% of page width
- **WHEN** filtering is applied
- **THEN** image is excluded (likely decorative banner/header)

#### Scenario: Filter images in header/footer zones (PPT PDF)
- **GIVEN** PDF is detected as PPT type
- **AND** image detection finds an image in top 5% or bottom 5% of page
- **AND** image width spans > 80% of page width
- **WHEN** filtering is applied
- **THEN** image is excluded (likely slide header/footer)

### Requirement: Image Hover Highlight (Always-On)
The system SHALL display subtle hover highlights on detected images to indicate they are clickable. Highlights are always enabled (no mode toggle required).

#### Scenario: Hover over detected image
- **GIVEN** user is viewing a PDF page with 3 detected content images
- **WHEN** user hovers mouse over one of the images
- **THEN** image boundary shows subtle border (2px solid, theme color, 40% opacity)
- **AND** cursor changes to pointer

#### Scenario: Mouse leaves image
- **GIVEN** image is highlighted on hover
- **WHEN** mouse moves outside image boundary
- **THEN** highlight is removed
- **AND** cursor returns to default

#### Scenario: No highlight for excluded images
- **GIVEN** image was filtered out (too small or in header/footer)
- **WHEN** user hovers over that area
- **THEN** no highlight appears
- **AND** click does nothing

#### Scenario: Highlights visible without mode toggle
- **GIVEN** user opens a PDF that has completed image extraction
- **WHEN** user views any page
- **THEN** hovering over detected images shows highlights immediately
- **AND** no "Explain Images" mode button is required

#### Scenario: Extraction status indicator for large PDFs
- **GIVEN** user is viewing a PDF with 100 pages
- **AND** `image_extraction_status` is `partial` (50/100 pages extracted)
- **WHEN** user views the PDF toolbar
- **THEN** small indicator shows: "Images: 50/100 pages scanned"
- **AND** indicator updates as background extraction progresses
- **AND** indicator disappears when extraction is complete

### Requirement: Click-to-Explain Image
The system SHALL trigger image explanation when user clicks on a detected image.

#### Scenario: Click on detected image (cache hit)
- **GIVEN** page 5 has detected image at index 2
- **AND** shared cache has explanation for `pdf_hash:5:2`
- **WHEN** user clicks on the image
- **THEN** system looks up explanation by `pdf_hash:page:image_index` in shared cache
- **AND** displays cached explanation immediately in sticker panel

#### Scenario: Click on detected image (cache miss)
- **GIVEN** page has detected image at normalized rect { x: 0.2, y: 0.3, w: 0.4, h: 0.3 }
- **AND** no cached explanation exists for this image position
- **WHEN** user clicks on the image
- **THEN** system highlights clicked image with solid border (selected state)
- **AND** displays loading indicator: "Generating explanation..."
- **AND** extracts JPEG crop of the image region
- **AND** sends image + page text context to AI for explanation
- **AND** shows sticker panel with explanation when ready
- **AND** caches explanation by `pdf_hash:page:image_index` for future users

#### Scenario: Click on overlapping images (topmost wins)
- **GIVEN** two detected images overlap
- **AND** image A was rendered after image B (higher z-index)
- **WHEN** user clicks in the overlapping area
- **THEN** image A is selected (topmost by render order)
- **AND** image B is ignored

#### Scenario: Click-miss shows all detected images
- **GIVEN** page has 4 detected content images
- **WHEN** user clicks on a non-image area
- **THEN** all 4 images are highlighted with dashed border (2px, theme color)
- **AND** tooltip appears: "Click on an image to explain it"
- **AND** highlights fade after 2 seconds

### Requirement: Cross-User Image Cache
The system SHALL share detected image explanations across users who upload the same PDF file.

#### Scenario: Cache hit for same PDF
- **GIVEN** User A uploaded PDF with hash "abc123" and explained image on page 5
- **WHEN** User B uploads the same PDF (same binary hash "abc123")
- **AND** User B views page 5
- **THEN** detected images are loaded from cache (not re-detected)
- **AND** existing explanations are available immediately

#### Scenario: Cache miss for different PDF
- **GIVEN** User A has explanations for PDF hash "abc123"
- **WHEN** User B uploads a different PDF with hash "xyz789"
- **THEN** no cache hit occurs
- **AND** images are detected fresh for User B's PDF

#### Scenario: Same image on different pages (no deduplication)
- **GIVEN** PDF has same diagram on pages 3 and 15
- **WHEN** user explains image on page 3
- **AND** later navigates to page 15 and clicks the same-looking image
- **THEN** system treats page 15 image as a separate image
- **AND** generates new explanation (or uses cache if same PDF was explained by another user)

### Requirement: Detection Feedback Collection
The system SHALL collect user feedback when image detection is incorrect.

#### Scenario: Report wrong image boundary
- **GIVEN** user clicked on an image and received explanation
- **WHEN** user clicks "Report issue" on sticker
- **AND** selects "Wrong image boundary"
- **THEN** system records feedback with detected_image_id and feedback_type='wrong_boundary'
- **AND** shows confirmation: "Thanks for your feedback"

#### Scenario: Report missed image
- **GIVEN** user sees an image that is not highlighted on hover
- **WHEN** user clicks "Report missed image" in toolbar
- **AND** draws rectangle around missed image
- **THEN** system records feedback with feedback_type='missed_image' and correct_rect
- **AND** image is added to detected_images with detection_method='manual'

## MODIFIED Requirements

### Requirement: Add Image Button (Manual Fallback)
The system SHALL provide a toolbar button to manually add images that were not auto-detected.

#### Scenario: Click "Add Image" button
- **GIVEN** user is viewing a PDF page
- **AND** an image was not auto-detected (no hover highlight)
- **WHEN** user clicks "Add Image" toolbar button
- **THEN** rectangle drawing mode is activated
- **AND** cursor changes to crosshair
- **AND** instructions tooltip appears: "Draw a rectangle around the image"

#### Scenario: Complete manual image selection
- **GIVEN** user is in rectangle drawing mode
- **WHEN** user draws a rectangle around an image
- **THEN** rectangle is saved with `detection_method='manual'`
- **AND** drawing mode is deactivated
- **AND** image becomes clickable for explanation

#### Scenario: Cancel manual image selection
- **GIVEN** user is in rectangle drawing mode
- **WHEN** user presses Escape or clicks "Add Image" button again
- **THEN** drawing mode is deactivated
- **AND** no image is added
