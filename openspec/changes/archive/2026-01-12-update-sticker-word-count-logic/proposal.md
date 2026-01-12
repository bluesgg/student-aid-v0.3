# Proposal: Update Sticker Word Count Logic and Add Image Analysis

## Change ID
`update-sticker-word-count-logic`

## Summary
1. Change the auto-sticker generation logic from a fixed count (2-6 stickers per page) to a word-count-based approach where the number of stickers is determined by page content density.
2. Add support for analyzing and explaining images/diagrams within PDF pages using GPT-4o Vision (with mode selection: text_only vs with_images).
3. Implement PDF structure parsing to provide chapter/section context using original PDF text (not previous stickers).
4. Support bilingual explanations (English and 简体中文 only for MVP).

## Problem Statement

### Problem 1: Fixed Sticker Count
The current auto-sticker generation produces a fixed 2-6 stickers per page regardless of content length. This approach doesn't scale well:
- Short pages (e.g., 100 words) may get over-explained with 4-6 stickers
- Long pages (e.g., 800 words) may be under-explained with only 6 stickers
- Dense pages with multiple paragraphs need paragraph-level breakdown

### Problem 2: No Image Analysis
The current system only extracts and analyzes text content from PDF pages. Images, diagrams, charts, and formulas rendered as images are completely ignored:
- Educational PDFs often contain critical diagrams (e.g., biology diagrams, physics illustrations, circuit diagrams)
- Mathematical formulas rendered as images are not explained
- Charts and graphs are not interpreted
- Students cannot get AI help understanding visual content

### Problem 3: Lack of Contextual Continuity
Each page's stickers are generated independently without considering previous pages:
- Students reading sequentially lose context between pages
- Concepts introduced on earlier pages are not referenced
- The AI doesn't understand the document flow
- Image explanations are isolated and don't connect to the broader narrative

### Problem 4: Lack of Document Structure Awareness
The current system treats each page as isolated text without understanding the document's structure:
- PDFs with chapters, sections, and subsections are not parsed
- AI cannot provide section-level or chapter-level context
- Cross-chapter references (e.g., "as defined in Chapter 2") are not understood
- Important structural information from bookmarks/TOC is ignored
- Explanations lack document-level coherence

## Proposed Solution

### Solution 1: Word-Count-Based Sticker Generation
Implement a word-count-based sticker generation strategy:

1. **Minimum requirement**: Every page must have at least 1 sticker
2. **Word count tiers**: Generate stickers based on page word count
   - 0-150 words: 1 sticker
   - 151-300 words: 2 stickers
   - 301-500 words: 3-4 stickers
   - 500+ words: Split by paragraphs, 1 sticker per major paragraph (max 8 stickers)
3. **Paragraph splitting**: For pages with 500+ words, the AI should identify logical paragraph boundaries and create one sticker per significant concept/paragraph

### Solution 2: Image Analysis with GPT-4o Vision (Mode Selection)
Add **mode-based** image extraction and analysis capabilities:

1. **Mode dimension**:
   - `text_only`: No image analysis, pure text-based stickers
   - `with_images`: Extract embedded images and perform multimodal analysis
2. **Extract embedded images from PDF** (when mode=with_images):
   - Use pdf-lib or pdfjs-dist to extract embedded images only
   - If no embedded images found, return empty array (no page rendering)
   - **Not applicable to scanned PDFs**: Pages without extractable images are processed as text-only
3. **Convert to base64**: Convert extracted images to base64 format for OpenAI API
4. **Upgrade to GPT-4o**: Use `gpt-4o` model for all requests (supports multimodal)
5. **Combined analysis**: Send both text and images to AI in a single request (when images exist)
6. **Image-based stickers**: AI generates stickers for important diagrams/charts/images when present
7. **Sticker allocation**: Images count toward total sticker count
   - If page has 3 images and 200 words → may generate 1 text sticker + 2 image stickers
   - Maintain max 8 stickers per page limit
   - Text-only pages (mode=text_only or no images) generate text-based stickers only

### Solution 3: Conversational Continuity Using PDF Original Text
Implement conversation history using PDF original content and document structure (NOT previous sticker text):

1. **PDF Structure Parsing** (Two-tier with confidence scoring):
   - **Primary**: Extract bookmarks/outline using pdf-lib
   - **Fallback**: Detect chapter/section titles using regex patterns:
     - Pattern matching: "Chapter N:", "Section N.M:", "Part N", etc.
     - Title numbering detection (1., 1.1, 1.1.1)
   - **Scanned PDFs**: Auto-detect and skip structure parsing entirely
   - If both methods fail: Set structure_confidence='low', use sliding window strategy
   - Map each page to its chapter and section
   - Build hierarchical document structure tree with confidence score
   - Store structure_confidence: 'high' | 'medium' | 'low'

2. **Image Summary Generation** (English-only, internal context):
   - Generate visual understanding summaries for all images on first auto-explain request
   - Store as structured JSON in English: `{type, title, summary, key_elements, labels_from_image, confidence}`
   - **labels_from_image**: Preserve original text labels as-is (may be mixed language)
   - Save to `image_summaries` table (per-user or per-file)
   - Used only as internal context for generating user-facing stickers

3. **Multi-Tier Context Building**: When generating stickers for page N, provide:
   - **Current page content**: Full original text + images from page N
   - **Section context**: Original text from section start to page N-1 (compressed if needed)
   - **Chapter context**: Chapter title + summary of previous sections in same chapter
   - **Image summaries**: English JSON summaries of images from previous pages (internal use only)
   - **Global glossary** (optional): Cross-chapter terms/symbols defined earlier in the document

4. **Context Token Management** (Hard limits with priority-based allocation):
   - **Hard upper limit**: 2000 tokens total (enforced by truncation)
   - **Priority-based budget allocation**:
     1. Current page: Always full (up to 1500 tokens max)
     2. Section context: Up to 1000 tokens (compressed summary, not raw text)
     3. Chapter context: Up to 500 tokens (high-level summary)
     4. Glossary: Up to 300 tokens (key terms only)
     5. Image summaries: Remaining budget
   - **Overflow handling**: Truncate from lowest priority upward
   - **Structured compression**: Section/chapter context must be extractive summaries (top-N sentences by TF-IDF), not raw PDF text
   - Include only relevant previous images (referenced or visually related)

5. **Referential Continuity**:
   - AI can reference earlier PDF content (not earlier explanations)
   - Stickers show awareness of document structure and flow
   - Image explanations can reference earlier diagrams using image summaries

### Solution 4: Bilingual Support (English + 简体中文 MVP)
Support explanations in two languages with native generation:

1. **Two Native Languages Only**:
   - **English (en)**: Native GPT-4o generation
   - **简体中文 (zh-Hans)**: Native GPT-4o generation
   - Each language stores separate stickers per user/file

2. **User Language Preferences**:
   - **User-level default**: Set in user settings, applies to all files
   - **Single-request override**: API accepts `locale` parameter to override default
   - **Auto-detect on first visit**: Parse browser `Accept-Language` header
     - `zh*` → `zh-Hans`
     - `en*` → `en`
     - Others → `en` (fallback)
   - Stored in `user_preferences.default_locale` (en | zh-Hans)

3. **Display Rules**:
   - Only show stickers matching current user's selected language
   - No mixed-language display on same page
   - Language switcher shows instant results if available, loading indicator if generating

4. **No Translation Layer** (MVP scope):
   - No automatic translation between languages
   - Each language generates fresh explanations natively
   - Future expansion: Add translation for other languages post-MVP

## Changes Required

### 0. Database Schema Updates

**A. Files table updates:**
```sql
ALTER TABLE files ADD COLUMN structure_parsed BOOLEAN DEFAULT FALSE;
ALTER TABLE files ADD COLUMN structure_data JSONB;
ALTER TABLE files ADD COLUMN structure_confidence VARCHAR(10); -- 'high', 'medium', 'low'

CREATE INDEX idx_files_structure_parsed ON files(structure_parsed) WHERE structure_parsed = FALSE;
```

**B. Image summaries table (per-file storage):**
```sql
CREATE TABLE image_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  image_index INTEGER NOT NULL,
  summary_json JSONB NOT NULL, -- {type, title, summary, key_elements, labels_from_image, confidence, bbox}
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(file_id, page, image_index)
);

CREATE INDEX idx_image_summaries_lookup ON image_summaries(file_id, page);
```

**C. User preferences table (simplified for bilingual MVP):**
```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  default_locale VARCHAR(10) DEFAULT 'en', -- 'en' | 'zh-Hans'
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_default_locale CHECK (default_locale ~ '^(en|zh-Hans)$')
);

CREATE INDEX idx_user_preferences_lookup ON user_preferences(user_id);
```

**D. Update existing stickers table for locale support:**
```sql
ALTER TABLE stickers ADD COLUMN locale VARCHAR(10) DEFAULT 'en';
ALTER TABLE stickers ADD COLUMN mode VARCHAR(20) DEFAULT 'with_images'; -- 'text_only' | 'with_images'

CREATE INDEX idx_stickers_locale ON stickers(file_id, page, locale);
```

**Migration strategy:**
- Add new columns to existing tables with NULL/default values
- Backfill locale='en' for existing stickers
- Structure parsing happens on-demand during first explain request
- Existing stickers remain functional

### 1. PDF Image Extraction (Optional - Mode-Based)
- Create `src/lib/pdf/extract-images.ts` module to:
  - Extract embedded images from a specific PDF page using pdf-lib
  - Only called when mode='with_images'
  - If no embedded images found, return empty array (no page rendering)
  - Convert extracted images to base64 format
  - Return array of base64 image strings (may be empty)
  - Add image compression if needed to stay under 20MB API limit

### 2. OpenAI Client Updates
- Update `src/lib/openai/client.ts`:
  - Change `DEFAULT_MODEL` to `gpt-4o` (supports vision, used for all requests)
  - Add pricing for `gpt-4o` model
  - Add support for multimodal messages (text + images)

### 3. PDF Structure Parsing Module
- Create `src/lib/pdf/structure-parser.ts` module to:
  - Extract bookmarks/outline from PDF using pdf-lib (high confidence)
  - Fallback to regex pattern matching for chapter/section titles (medium confidence)
  - Auto-detect scanned PDFs and skip parsing (low confidence)
  - Build hierarchical structure with page mappings
  - Store in `files.structure_data` and `files.structure_confidence`
- Create `src/lib/pdf/context-builder.ts` module to:
  - Retrieve PDF structure for a given file
  - Extract original text from previous pages in same section/chapter
  - Apply extractive summarization (TF-IDF) to compress context
  - Build multi-tier context with priority-based token allocation (hard 2000 token limit)
  - Return structured context object

### 4. Image Summary Generation Module
- Create `src/lib/pdf/image-summary.ts` module to:
  - Generate English-only visual understanding summaries for images
  - Use GPT-4o vision to analyze images
  - Extract structured JSON: {type, title, summary, key_elements, labels_from_image, confidence}
  - **labels_from_image**: Preserve original text labels from image (may be mixed language)
  - Store in `image_summaries` table per file
  - Cache per file (used as internal context only)

### 5. Bilingual Support Infrastructure (MVP - No Translation)
- Create `src/lib/i18n/locale-detection.ts` helper to:
  - Parse `Accept-Language` header for auto-detection (prefix matching)
  - Resolve user's effective locale: request override > user default > auto-detected > 'en'
  - Validate locale against supported languages (en, zh-Hans)
- Update `src/lib/stickers/get-stickers.ts`:
  - Filter stickers by locale when fetching for display
  - Only show stickers matching user's current language

### 6. AI Prompt Updates (Bilingual + Mode-Aware)
- Update `buildExplainPagePrompt()` in `src/lib/openai/prompts/explain-page.ts` to:
  - Accept new parameters:
    - `pageText`: Current page text
    - `images`: Array of base64 images (optional - may be empty, only when mode='with_images')
    - `pdfContext`: Multi-tier context object from context-builder
    - `imageSummaries`: English JSON summaries from previous pages (internal context)
    - `locale`: User's selected language ('en' | 'zh-Hans')
    - `mode`: Generation mode ('text_only' | 'with_images')
  - Calculate word count from `pageText`
  - Determine target sticker count based on word count tiers + image count
  - Build multimodal messages array:
    - System prompt with word count guidance and locale instruction
    - Section/chapter context from PDF original text
    - Image summaries from earlier pages (if relevant)
    - User message with current page text + images (if mode='with_images')
  - Instruct AI to generate explanations in target locale (native for en/zh-Hans)
  - Return complete conversation messages array ready for OpenAI API

### 7. API Route Updates
- Update `src/app/api/ai/explain-page/route.ts` with workflow:

**A. Resolve user's effective locale:**
  - Check request-level override (`locale` query param)
  - Fall back to user default in `user_preferences.default_locale`
  - Fall back to auto-detected from `Accept-Language` header
  - Default to 'en' if all fail

**B. Check mode parameter:**
  - Accept `mode` query param ('text_only' | 'with_images')
  - Default to 'with_images' if not specified

**C. Check existing stickers:**
  - Query stickers table for (file_id, page, locale, mode)
  - If found: Return immediately
  - If not found: Proceed to generation

**D. Parse PDF structure (if not already done):**
  - Check `files.structure_parsed` flag
  - If false: Parse structure and store in `files.structure_data`
  - Update `files.structure_parsed = TRUE`

**E. Extract embedded images (only if mode='with_images'):**
  - Call `extractPageImages(pdfBuffer, page)` - returns empty array if none found
  - Text-only mode skips this step entirely

**F. Generate/retrieve image summaries (only if images exist):**
  - Call `getOrCreateImageSummaries(file_id, page, images)`
  - Load summaries for previous pages (if relevant)
  - Use as internal context (English-only)

**G. Build PDF context:**
  - Call `buildContext(file.id, page, file.structure_data)`
  - Get section/chapter context from PDF original text

**H. Generate stickers:**
  - Pass to `buildExplainPagePrompt(pageText, images, pdfContext, imageSummaries, locale, mode)`
  - Generate natively in target locale (en or zh-Hans)
  - Call OpenAI API with messages array

**I. Store and return:**
  - Insert into stickers table with locale and mode
  - Deduct quota
  - Return stickers to user

### 8. Response Parsing
- Update `parseExplainPageResponse()` to:
  - Handle variable sticker counts (1-8 instead of 2-6)
  - Ensure at least 1 sticker is always returned

### 9. Frontend Updates
- Update Study page to support:
  - Language switcher (en / 中文)
  - Mode selector (text only / with images) - optional
  - Display stickers filtered by current language
  - Show loading state when switching languages
- Add user settings page:
  - Default language preference
  - Mode preference

### 10. Documentation
- Update `docs/sticker-generation-logic.md`:
  - Word-count-based logic
  - Mode dimension (text_only vs with_images)
  - Bilingual support (en, zh-Hans)
  - PDF structure parsing and context building
  - Image summaries (internal context)
- Update `docs/03_api_design.md`:
  - Document mode parameter
  - Document locale parameter
  - Document bilingual locale resolution

## Affected Components

**NEW Modules:**
- `src/lib/supabase/migrations/` - Database schema updates (structure fields, image_summaries, user_preferences)
- `src/lib/pdf/structure-parser.ts` - PDF structure parsing (2-tier with confidence)
- `src/lib/pdf/context-builder.ts` - Multi-tier context building with extractive summarization
- `src/lib/pdf/extract-images.ts` - Optional embedded image extraction (mode-based)
- `src/lib/pdf/image-summary.ts` - English-only image summary generation
- `src/lib/i18n/locale-detection.ts` - Locale resolution (en, zh-Hans only)

**MODIFIED Modules:**
- `src/lib/openai/client.ts` - Model upgrade to GPT-4o
- `src/lib/openai/prompts/explain-page.ts` - Bilingual prompts with mode awareness
- `src/lib/stickers/get-stickers.ts` - Locale-filtered retrieval
- `src/app/api/courses/[courseId]/files/route.ts` - Structure parsing trigger
- `src/app/api/ai/explain-page/route.ts` - Full workflow with locale and mode support
- `src/app/study/[fileId]/page.tsx` - Language switcher + mode selector
- `docs/sticker-generation-logic.md` - Documentation updates
- `docs/03_api_design.md` - API documentation updates

**REMOVED Modules:**
- ❌ `src/lib/i18n/translation.ts` - No translation layer in MVP

## Acceptance Criteria

### Word Count Logic
- [ ] Pages with <150 words generate exactly 1 sticker
- [ ] Pages with 151-300 words generate 2 stickers
- [ ] Pages with 301-500 words generate 3-4 stickers
- [ ] Pages with 500+ words generate stickers per paragraph (max 8)
- [ ] All pages generate at least 1 sticker

### Image Analysis (Mode-Based)
- [ ] mode='with_images': Extract embedded images and encode as base64
- [ ] mode='text_only': Skip image extraction entirely
- [ ] Pages without embedded images return empty array (no page rendering)
- [ ] AI receives text + images in multimodal format (when mode='with_images' and images available)
- [ ] AI generates stickers explaining diagrams/charts (when images present)
- [ ] Scanned PDFs without extractable images process as text-only

### Conversational Continuity (PDF Original Text)
- [ ] Generating stickers for page N includes PDF original text from section/chapter
- [ ] AI can reference concepts from earlier pages using original PDF content
- [ ] Stickers show awareness of document structure (chapters/sections)
- [ ] Image explanations use English image summaries as internal context
- [ ] Context uses PDF text, NOT previous sticker explanations
- [ ] Context limited to 2000 tokens (hard limit with truncation)
- [ ] Page 1 works correctly without section/chapter context

### PDF Structure Parsing
- [ ] Bookmarks/outline extracted if available (high confidence)
- [ ] Chapter/section titles detected via regex (medium confidence)
- [ ] Scanned PDFs auto-detected and skip parsing (low confidence)
- [ ] Structure stored in `files.structure_data` and `files.structure_confidence`

### Image Summaries
- [ ] English-only image summaries generated on first auto-explain
- [ ] Summaries stored in `image_summaries` table
- [ ] labels_from_image preserves original mixed-language text
- [ ] Used as internal context only (not user-facing)

### Bilingual Support (MVP - en, zh-Hans only)
- [ ] Users can set default language in settings (en | zh-Hans)
- [ ] Auto-detect language from browser on first visit (prefix matching)
- [ ] Native generation for English and 简体中文
- [ ] Stickers stored with locale field per user/file
- [ ] Only current language stickers displayed (no mixed languages)
- [ ] Language switcher triggers generation if not available

### Compatibility
- [ ] Existing stickers remain functional (backfilled with locale='en')
- [ ] No breaking changes to API response format
- [ ] Scanned PDFs processed as text-only (no FILE_IS_SCANNED error)

## Risks & Mitigation

### Word Count Risks
- **Risk**: AI may not always respect word count guidance
  - **Mitigation**: Add validation to enforce min/max bounds in response parser
- **Risk**: Paragraph detection may fail for some PDF formats
  - **Mitigation**: Fall back to word count-based splitting

### Image Analysis Risks
- **Risk**: GPT-4o is more expensive (~3x for pages with images)
  - **Mitigation**: Mode selection allows users to choose text_only; acceptable for MVP
- **Risk**: Image extraction may fail for some PDF formats
  - **Mitigation**: Return empty array and proceed as text-only (graceful degradation)
- **Risk**: Processing time increases with images (2-5 seconds per image)
  - **Mitigation**: Show loading state in UI

### PDF Structure & Context Risks
- **Risk**: PDF structure parsing may fail for poorly formatted PDFs
  - **Mitigation**: Use 2-tier fallback (bookmarks → regex); skip scanned PDFs
- **Risk**: Including context may exceed token limits
  - **Mitigation**: Hard 2000 token limit with priority-based allocation; extractive summarization
- **Risk**: Context building adds latency
  - **Mitigation**: Parse structure on file upload or first access
- **Risk**: Some PDFs have no clear structure
  - **Mitigation**: Auto-detect scanned PDFs; use structure_confidence='low'

### Image Summary Risks
- **Risk**: Generating image summaries adds latency
  - **Mitigation**: Generate only on first auto-explain; cache per file
- **Risk**: Image summary quality may vary
  - **Mitigation**: Include confidence score; acceptable for MVP

### Bilingual Risks (MVP - Simplified)
- **Risk**: Limited to 2 languages may frustrate some users
  - **Mitigation**: Clear communication; post-MVP expansion planned
- **Risk**: Native generation costs double for same content (en + zh-Hans)
  - **Mitigation**: Acceptable trade-off for quality; users choose language

## Testing Strategy

### Word Count Testing
- Test with pages of varying word counts: 50, 150, 250, 400, 600, 800 words
- Verify paragraph splitting works for multi-paragraph pages
- Ensure minimum 1 sticker requirement is enforced

### Image Analysis Testing (Mode-Based)
- Test mode='with_images': Extract embedded images, generate multimodal stickers
- Test mode='text_only': Skip image extraction, generate text-only stickers
- Test with pages containing embedded diagrams, charts, formulas
- Test with text-only pages (no embedded images)
- Test with scanned PDFs (process as text-only)
- Measure API response time (expect 2-5 seconds for pages with images)

### PDF Structure Parsing Testing
- Test PDFs with bookmarks/TOC (confidence='high')
- Test PDFs without bookmarks (regex fallback, confidence='medium')
- Test scanned PDFs (auto-detect, confidence='low')
- Verify structure stored correctly
- Test parsing performance (<5s)

### Image Summary Testing
- Test generation of English-only image summaries
- Verify JSON structure matches schema
- Verify labels_from_image preserves mixed-language text
- Test caching in `image_summaries` table
- Measure generation time (expect 2-4s per image)

### PDF Context Building Testing
- Test section context extraction from PDF original text
- Verify context uses PDF text, not sticker text
- Test token limit enforcement (max 2000 tokens)
- Test extractive summarization compression
- Verify page 1 works without context

### Bilingual Testing (en, zh-Hans)
- Test native generation for en and zh-Hans
- Test user-level default language setting
- Test auto-detection from Accept-Language header (prefix matching)
- Verify locale-filtered sticker retrieval
- Test language switcher (generation if not available)
- Verify no mixed-language display

### Compatibility Testing
- Verify existing stickers still work (backfilled with locale='en')
- Verify quota deduction still works
- Verify no breaking changes to API response format

**Overall Validation**:
- All test scenarios pass
- No regression in existing functionality
- Image analysis produces meaningful explanations (when mode='with_images')
- Bilingual support works correctly (en, zh-Hans)
- PDF structure context enhances explanations

## Related Changes
None

## Dependencies
- Existing dependencies in package.json are sufficient: `pdf-lib`, `pdfjs-dist`, `openai`
- No new external dependencies required
- Database migrations required for new columns/tables
