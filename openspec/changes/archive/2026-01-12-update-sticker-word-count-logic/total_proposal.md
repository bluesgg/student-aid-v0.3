# Proposal: Update Sticker Word Count Logic and Add Image Analysis

## Change ID
`update-sticker-word-count-logic`

## Summary
1. Change the auto-sticker generation logic from a fixed count (2-6 stickers per page) to a word-count-based approach where the number of stickers is determined by page content density.
2. Add support for analyzing and explaining images/diagrams within PDF pages using GPT-4o Vision (with mode selection: text_only vs with_images).
3. Implement PDF structure parsing to provide chapter/section context using original PDF text (not previous stickers).
4. Add cross-user content deduplication with single-flight generation and manual regeneration.
5. Support bilingual explanations (English and 简体中文 only for MVP).
6. Implement revision tracking and audit logging for manual regeneration.
7. Add monitoring dashboard for cache performance and system health.

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

### Problem 4: Duplicate AI Processing Across Users
When multiple users upload the same PDF (e.g., same textbook, same lecture slides):
- Each user triggers separate AI processing for the same content
- Identical pages are analyzed multiple times, wasting API costs
- Response time is slow for common educational materials
- No benefit from previous users' AI-generated explanations

### Problem 5: Lack of Document Structure Awareness
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
   - Save to `shared_image_summaries` table indexed by (pdf_hash, page, image_index)
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

### Solution 4: Cross-User Content Deduplication with Manual Regeneration
Implement shared auto-sticker cache based on PDF content hash with manual control:

1. **PDF Content Hashing**: Calculate SHA-256 hash of PDF file content to uniquely identify documents

2. **Shared Sticker Cache** (per-language + per-mode):
   - Store auto-stickers indexed by `(pdf_hash, page, prompt_version, locale, mode)`
   - Supported locales: `en`, `zh-Hans` only (MVP scope)
   - Modes: `text_only`, `with_images`
   - Only share AUTO stickers (AI-generated), never MANUAL stickers (user-initiated)

3. **Single-Flight Generation** (Async non-blocking):
   - Use database unique constraint on `(pdf_hash, page, prompt_version, locale, mode)` to prevent duplicate generation
   - State machine: `generating` → `ready` (or `failed`)
   - When cache miss occurs:
     - Try to INSERT with status=`generating`
     - If unique constraint violation: Return 202 with existing generation_id
     - If INSERT succeeds: Start background generation, return 202 with new generation_id
   - Client receives 202 response:
     - Response includes: `{status: "generating", generation_id: "...", estimated_time: 8}`
     - Client polls GET /api/ai/explain-page/status/:generation_id every 2s
     - Or use SSE: GET /api/ai/explain-page/stream/:generation_id (optional)
   - Timeout handling: Zombie cleanup job marks stuck generations as failed (every 5min)

4. **Revision Tracking & Manual Regeneration** (MVP - No Automatic Refresh):
   - **Manual regeneration only**: Users click "🔄 Regenerate" button to trigger new generation
   - **Revision mechanism**:
     - Each regeneration creates a new `revision` (1, 2, 3, ...)
     - Old revisions marked as `is_active = FALSE` and `superseded_by = <new_revision_id>`
     - Only the latest active revision is returned by default
     - Keep **最近 3 个 revision** (oldest revisions deleted during cleanup)
   - **prompt_version vs revision**:
     - `prompt_version`: System version (e.g., 'v1', 'v2') - only changes when we upgrade prompts/model
     - `revision`: User-initiated regeneration counter within same prompt_version
   - **Audit logging**: Every regeneration logged to `regenerate_audit_logs` with:
     - Who triggered it, when, why (optional reason enum)
     - Quota deducted, cache hit status, mode, model used, tokens consumed
   - **No automatic refresh**: Stale cache is acceptable; users control when to regenerate

5. **Quota Deduction Policy**:
   - **ALWAYS deduct quota** even when using cached stickers
   - Explanation: Users consume value regardless of cache hit/miss
   - Quota amount same as fresh generation

6. **Privacy & User Control**:
   - **Opt-out available**: Users can disable sharing in settings (`share_to_cache` preference)
   - When opt-out enabled:
     - Stickers stored ONLY in user-specific `stickers` table
     - No contribution to `shared_auto_stickers`
     - User pays full quota (no benefit from shared cache)
   - When opt-in (default):
     - Stickers stored in `shared_auto_stickers`
     - Benefit from cache hits (instant results)
     - Still pay quota for cache hits (fair value exchange)
   - **Transparency**: Show cache hit indicator in UI
   - Only AUTO stickers are shared; MANUAL stickers remain private

7. **Benefits**:
   - **Cost savings**: Avoid redundant API calls for popular documents
   - **Speed**: Instant sticker delivery for previously processed pages
   - **Quality control**: Users can regenerate when unsatisfied
   - **Auditability**: Track regeneration patterns and quota usage
   - **Scalability**: Single-flight prevents thundering herd

### Solution 5: Bilingual Support (English + 简体中文 MVP)
Support explanations in two languages with native generation:

1. **Two Native Languages Only**:
   - **English (en)**: Native GPT-4o generation
   - **简体中文 (zh-Hans)**: Native GPT-4o generation
   - Each language has separate shared cache: `(pdf_hash, page, prompt_version, locale, mode)`

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
   - Language switcher shows instant results if cached, loading indicator if generating

4. **No Translation Layer** (MVP scope):
   - No automatic translation between languages
   - Each language generates fresh explanations natively
   - Future expansion: Add translation for other languages post-MVP

### Solution 6: Monitoring Dashboard
Add observability for cache performance and system health:

1. **Metrics Collection** (Database-backed):
   - Store metrics in `sticker_metrics` table
   - Track per request:
     - Cache hit rate (by PDF, by language, by mode)
     - Generation latency p95 (text-only vs with-images)
     - Failure rate and error type distribution
     - Zombie generation frequency
     - Reference counting health (detect anomalies)

2. **Admin Dashboard** (`/admin/metrics`):
   - Built with Next.js + Recharts
   - Access control: Admin allowlist (environment variable or `is_admin` flag)
   - Displays:
     - **Yesterday's summary**: Cache hits, generations, failures, avg latency
     - **Cache performance**: Hit rate by PDF/language/mode
     - **Generation metrics**: p95 latency by mode, token usage distribution
     - **Error analysis**: Failure reasons, zombie frequency
     - **Reference counting**: Canonical documents health, anomaly detection

3. **No Real-Time Alerts** (MVP scope):
   - No email/Slack notifications
   - Dashboard-only monitoring
   - Manual review of daily summaries
   - Post-MVP: Add alerts for zombie spike (>10/hour) and reference_count anomalies

## Changes Required

### 0. Database Schema Updates
Comprehensive schema updates for mode dimension, revision tracking, reference edges, and monitoring:

**A. Canonical documents table (global PDF registry with reference counting):**
```sql
CREATE TABLE canonical_documents (
  pdf_hash VARCHAR(64) PRIMARY KEY,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  last_reference_at TIMESTAMPTZ DEFAULT NOW(), -- Last time a new reference was added
  reference_count INTEGER DEFAULT 0,
  total_pages INTEGER,
  metadata JSONB
);

CREATE INDEX idx_canonical_last_accessed ON canonical_documents(last_accessed_at);
CREATE INDEX idx_canonical_ref_count ON canonical_documents(reference_count) WHERE reference_count = 0;
```

**B. Canonical document references table (reference edges for atomic operations):**
```sql
CREATE TABLE canonical_document_refs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pdf_hash VARCHAR(64) NOT NULL,
  ref_type VARCHAR(20) NOT NULL DEFAULT 'file',
  ref_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_refs_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  UNIQUE(ref_type, ref_id)  -- Idempotency guarantee
);

CREATE INDEX idx_refs_lookup ON canonical_document_refs(pdf_hash);
CREATE INDEX idx_refs_reverse ON canonical_document_refs(ref_type, ref_id);
```

**C. Files table updates:**
```sql
ALTER TABLE files ADD COLUMN content_hash VARCHAR(64);
ALTER TABLE files ADD COLUMN structure_parsed BOOLEAN DEFAULT FALSE;
ALTER TABLE files ADD COLUMN structure_data JSONB;
ALTER TABLE files ADD COLUMN structure_confidence VARCHAR(10); -- 'high', 'medium', 'low'

-- Soft reference to canonical_documents (allows orphaned files after user deletion)
ALTER TABLE files ADD CONSTRAINT fk_files_canonical
  FOREIGN KEY (content_hash) REFERENCES canonical_documents(pdf_hash)
  ON DELETE SET NULL;

CREATE INDEX idx_files_content_hash ON files(content_hash);
CREATE INDEX idx_files_structure_parsed ON files(structure_parsed) WHERE structure_parsed = FALSE;
```

**D. Shared auto-stickers table (with mode dimension and revision tracking):**
```sql
-- Create status enum
CREATE TYPE sticker_status AS ENUM ('generating', 'ready', 'failed');

CREATE TABLE shared_auto_stickers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  prompt_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  locale VARCHAR(10) NOT NULL, -- 'en' | 'zh-Hans'
  mode VARCHAR(20) NOT NULL DEFAULT 'with_images', -- 'text_only' | 'with_images'

  -- Revision tracking
  revision INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by UUID, -- Points to newer revision's id
  superseded_at TIMESTAMPTZ,

  -- Status and content
  status sticker_status NOT NULL DEFAULT 'generating',
  stickers JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  generation_time_ms INTEGER,
  error_message TEXT,

  -- Reference canonical_documents (CASCADE delete when PDF is GC'd)
  CONSTRAINT fk_stickers_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  -- Locale format validation
  CONSTRAINT check_locale_format CHECK (locale ~ '^(en|zh-Hans)$'),

  -- Mode validation
  CONSTRAINT check_mode_format CHECK (mode IN ('text_only', 'with_images'))
);

-- Unique constraint only for active revisions
CREATE UNIQUE INDEX unique_active_sticker
  ON shared_auto_stickers(pdf_hash, page, prompt_version, locale, mode)
  WHERE is_active = TRUE;

-- Performance indexes
CREATE INDEX idx_shared_stickers_lookup ON shared_auto_stickers(pdf_hash, page, locale, mode) WHERE status = 'ready' AND is_active = TRUE;
CREATE INDEX idx_shared_stickers_hash_status ON shared_auto_stickers(pdf_hash, status);
CREATE INDEX idx_failed_cleanup ON shared_auto_stickers(status, updated_at) WHERE status = 'failed';
CREATE INDEX idx_inactive_revisions ON shared_auto_stickers(is_active, created_at) WHERE is_active = FALSE;
```

**E. Shared image summaries table (English-only, internal context):**
```sql
CREATE TABLE shared_image_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  image_index INTEGER NOT NULL,
  summary_json JSONB NOT NULL, -- {type, title, summary, key_elements, labels_from_image, confidence, bbox}
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_images_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  UNIQUE(pdf_hash, page, image_index)
);

CREATE INDEX idx_image_summaries_lookup ON shared_image_summaries(pdf_hash, page);
```

**F. User preferences table (simplified for bilingual MVP):**
```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  default_locale VARCHAR(10) DEFAULT 'en', -- 'en' | 'zh-Hans'
  share_to_cache BOOLEAN DEFAULT TRUE, -- Opt-out mechanism
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_default_locale CHECK (default_locale ~ '^(en|zh-Hans)$')
);

CREATE INDEX idx_user_preferences_lookup ON user_preferences(user_id);
```

**G. Regenerate audit logs table:**
```sql
CREATE TABLE regenerate_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  locale VARCHAR(10) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  mode VARCHAR(20) NOT NULL,

  -- Audit information
  reason VARCHAR(30), -- 'quality_not_good' | 'outdated' | 'test' | 'other' | NULL
  quota_deducted INTEGER NOT NULL,
  cache_hit BOOLEAN NOT NULL,
  generation_time_ms INTEGER,

  -- Cost analysis
  model_used VARCHAR(50) NOT NULL, -- 'gpt-4o'
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL, -- 'success' | 'failed'
  error_code VARCHAR(50),

  -- Revision tracking
  old_revision_id UUID, -- Previous revision (if exists)
  new_revision_id UUID NOT NULL, -- Newly generated revision

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user_time ON regenerate_audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_pdf_page ON regenerate_audit_logs(pdf_hash, page);
CREATE INDEX idx_audit_status ON regenerate_audit_logs(status, created_at);
```

**H. Sticker metrics table:**
```sql
CREATE TABLE sticker_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_date DATE NOT NULL,
  metric_hour INTEGER NOT NULL, -- 0-23 for hourly aggregation

  -- Dimensions
  pdf_hash VARCHAR(64),
  locale VARCHAR(10), -- 'en' | 'zh-Hans'
  mode VARCHAR(20), -- 'text_only' | 'with_images'

  -- Metrics
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  generations_started INTEGER DEFAULT 0,
  generations_completed INTEGER DEFAULT 0,
  generations_failed INTEGER DEFAULT 0,
  zombie_cleanups INTEGER DEFAULT 0,

  -- Latency (in milliseconds)
  total_generation_time_ms BIGINT DEFAULT 0,
  p95_generation_time_ms INTEGER,

  -- Token usage
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- Error tracking
  error_counts JSONB, -- {error_code: count}

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(metric_date, metric_hour, pdf_hash, locale, mode)
);

CREATE INDEX idx_metrics_date ON sticker_metrics(metric_date DESC, metric_hour DESC);
CREATE INDEX idx_metrics_pdf ON sticker_metrics(pdf_hash, metric_date);
```

**Migration strategy:**
- Create canonical_documents and canonical_document_refs first
- Add new columns to existing tables with NULL defaults
- Backfill job to calculate content_hash and populate canonical tables
- Lazy補齐 in API layer for edge cases
- Existing stickers remain in user-specific `stickers` table
- New auto-stickers go to `shared_auto_stickers` table

**Cleanup strategy (MVP scope):**
- **Zombie cleanup** (every 5 min): Mark stuck generations as failed (2 min timeout)
- **Failed records cleanup** (daily): DELETE failed records after 30 days
- **Old revisions cleanup** (daily): Keep only 3 most recent revisions per (pdf_hash, page, prompt_version, locale, mode)
- **Canonical GC** (post-MVP): Delete canonical_documents with reference_count=0 after dual 30-day condition

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

### 3. PDF Content Hashing
- Create `src/lib/pdf/hash.ts` module to:
  - Calculate SHA-256 hash of PDF file buffer
  - Return hex string representation of hash
  - Use Node.js crypto module for hashing
- Update file upload flow in `src/app/api/courses/[courseId]/files/route.ts`:
  - Calculate content hash after uploading to storage
  - UPSERT to `canonical_documents`
  - INSERT to `canonical_document_refs` (idempotent)
  - Update `reference_count` atomically
  - Store hash in `files.content_hash` field

### 4. PDF Structure Parsing Module
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

### 5. Image Summary Generation Module
- Create `src/lib/pdf/image-summary.ts` module to:
  - Generate English-only visual understanding summaries for images
  - Use GPT-4o vision to analyze images
  - Extract structured JSON: {type, title, summary, key_elements, labels_from_image, confidence}
  - **labels_from_image**: Preserve original text labels from image (may be mixed language)
  - Store in `shared_image_summaries` table
  - Cache indefinitely (language-agnostic, used as internal context only)

### 6. Shared Sticker Cache Management (Async + Revision Tracking)
- Create `src/lib/stickers/shared-cache.ts` module to:
  - `checkUserSharePreference(userId)`: Check opt-out status
  - `checkSharedCache(pdfHash, page, locale, mode)`: Query for active stickers, returns `{status, stickers?, generationId?}`
  - `tryStartGeneration(pdfHash, page, locale, mode)`: Attempt INSERT with status='generating', returns `{started: boolean, generationId}`
  - `getGenerationStatus(generationId)`: Poll endpoint for clients
  - `completeGeneration(generationId, stickers)`: Update status to 'ready'
  - `failGeneration(generationId, error)`: Update status to 'failed'
  - `createRevision(oldRevisionId, newStickers)`: Create new revision, mark old as superseded
  - Handle single-flight logic with DB unique constraint
  - Return 202 responses with generation_id for async tracking
- Privacy enforcement:
  - Only AUTO stickers go to `shared_auto_stickers`
  - MANUAL stickers stay in user-specific `stickers` table

### 7. Bilingual Support Infrastructure (MVP - No Translation)
- Create `src/lib/i18n/locale-detection.ts` helper to:
  - Parse `Accept-Language` header for auto-detection (prefix matching)
  - Resolve user's effective locale: request override > user default > auto-detected > 'en'
  - Validate locale against supported languages (en, zh-Hans)
- Update `src/lib/stickers/get-stickers.ts`:
  - Filter stickers by locale when fetching for display
  - Only show stickers matching user's current language

### 8. AI Prompt Updates (Bilingual + Mode-Aware)
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

### 9. API Route Updates (Async + Regenerate + Revision)
- Update `src/app/api/ai/explain-page/route.ts` with complete workflow:

**A. Resolve user's effective locale:**
  - Check request-level override (`locale` query param)
  - Fall back to user default in `user_preferences.default_locale`
  - Fall back to auto-detected from `Accept-Language` header
  - Default to 'en' if all fail

**A2. Check user share preference:**
  - Call `checkUserSharePreference(userId)`
  - If opted out: Skip shared cache, generate in user-specific table
  - If opted in: Proceed to shared cache flow

**B. Check mode parameter:**
  - Accept `mode` query param ('text_only' | 'with_images')
  - Default to 'with_images' if not specified

**C. Check for regenerate request:**
  - Accept `force_regenerate=true` query param
  - If true: Skip cache check, create new revision, log to audit table

**D. Check shared cache (async non-blocking):**
  - Call `checkSharedCache(file.content_hash, page, locale, mode)`
  - If status='ready': Deduct quota, return 200 with stickers immediately
  - If status='generating': Return 202 with existing generationId
  - If status='failed' or not found: Proceed to generation

**E. Start async generation:**
  - Call `tryStartGeneration(file.content_hash, page, locale, mode)`
  - If started=false: Return 202 with existing generationId
  - If started=true: Trigger background job, return 202 with new generationId

**F. Extract embedded images (only if mode='with_images'):**
  - Call `extractPageImages(pdfBuffer, page)` - returns empty array if none found
  - Text-only mode skips this step entirely

**G. Generate/retrieve image summaries (only if images exist):**
  - Call `getOrCreateImageSummaries(file.content_hash, page, images)`
  - Load summaries for previous pages (if relevant)
  - Use as internal context (English-only)

**H. Build PDF context:**
  - Call `buildContext(file.id, page, file.structure_data)`
  - Get section/chapter context from PDF original text

**I. Generate stickers:**
  - Pass to `buildExplainPagePrompt(pageText, images, pdfContext, imageSummaries, locale, mode)`
  - Generate natively in target locale (en or zh-Hans)
  - Call OpenAI API with messages array

**J. Store and return:**
  - If regenerate: Call `createRevision(oldRevisionId, stickers)`, log to audit table
  - Else: Call `completeGeneration(generationId, stickers)`
  - Deduct quota (always, even for cache hits)
  - Return stickers to user

**K. Error handling:**
  - On failure: Call `failGeneration(generationId, error)`
  - Zombie cleanup job handles stuck generations

**L. New API endpoints:**
  - **GET /api/ai/explain-page/status/:generationId**
    - Returns: `{status, stickers?, error?, progress?}`
    - Client polls every 2s until status != 'generating'
  - **POST /api/ai/explain-page/regenerate**
    - Triggers manual regeneration with audit logging
    - Accepts optional `reason` parameter

### 10. Response Parsing
- Update `parseExplainPageResponse()` to:
  - Handle variable sticker counts (1-8 instead of 2-6)
  - Ensure at least 1 sticker is always returned

### 11. Frontend Updates (MVP Required)
- Create `src/features/stickers/hooks/use-explain-page.ts` updates:
  - Handle 202 responses with polling logic
  - Poll `/api/ai/explain-page/status/:generationId` every 2s
  - Stop polling after 5 minutes (timeout)
- Add regenerate functionality:
  - "🔄 Regenerate" button in Study page toolbar
  - Confirmation dialog with quota warning
  - Optional reason selection (dropdown)
  - Call API with `force_regenerate=true`
- Add cache hit indicator:
  - Show "📦 Cached" badge on stickers
  - Tooltip explaining quota still deducted
- Add loading states:
  - "Generating stickers..." spinner during polling
  - Optional progress percentage

### 12. Monitoring Dashboard
- Create `/admin/metrics` page:
  - Built with Next.js + Recharts
  - Admin access control (allowlist or `is_admin` flag)
- Display metrics:
  - Yesterday's summary (cache hits, generations, failures, latency)
  - Cache performance by PDF/language/mode
  - Generation latency p95 by mode
  - Token usage distribution
  - Error analysis (failure reasons, zombie frequency)
  - Reference counting health
- Metrics collection:
  - Update `sticker_metrics` table on each request
  - Aggregate hourly for performance

### 13. Backfill Task
- Create `src/scripts/backfill-content-hashes.ts`:
  - One-time job to calculate hashes for existing files
  - Batch processing (100 files at a time)
  - UPSERT to canonical_documents
  - INSERT to canonical_document_refs (idempotent)
  - Update files.content_hash
- Add lazy補齐 in API layer:
  - If file.content_hash is NULL, calculate on-demand
  - Update canonical tables atomically

### 14. Documentation
- Update `docs/sticker-generation-logic.md`:
  - Word-count-based logic
  - Mode dimension (text_only vs with_images)
  - Revision tracking and manual regeneration
  - Bilingual support (en, zh-Hans)
  - PDF structure parsing and context building
  - Image summaries (internal context)
- Update `docs/03_api_design.md`:
  - Document mode parameter
  - Document regenerate endpoint
  - Document 202 async workflow
  - Document bilingual locale resolution

## Affected Components

**NEW Modules:**
- `src/lib/supabase/migrations/` - Database schema migrations (canonical_documents + refs + revisions + audit + metrics)
- `src/lib/pdf/hash.ts` - PDF content hashing
- `src/lib/pdf/structure-parser.ts` - PDF structure parsing (2-tier with confidence)
- `src/lib/pdf/context-builder.ts` - Multi-tier context building with extractive summarization
- `src/lib/pdf/extract-images.ts` - Optional embedded image extraction (mode-based)
- `src/lib/pdf/image-summary.ts` - English-only image summary generation
- `src/lib/stickers/shared-cache.ts` - Async shared cache with revision tracking
- `src/lib/i18n/locale-detection.ts` - Locale resolution (en, zh-Hans only)
- `src/app/admin/metrics/page.tsx` - Monitoring dashboard (NEW)
- `src/lib/monitoring/sticker-metrics.ts` - Metrics collection (NEW)
- `src/scripts/backfill-content-hashes.ts` - One-time backfill job (NEW)
- Background jobs - Zombie cleanup (5min), failed records cleanup (daily), old revisions cleanup (daily)

**MODIFIED Modules:**
- `src/lib/openai/client.ts` - Model upgrade to GPT-4o
- `src/lib/openai/prompts/explain-page.ts` - Bilingual prompts with mode awareness
- `src/lib/stickers/get-stickers.ts` - Locale-filtered retrieval
- `src/app/api/courses/[courseId]/files/route.ts` - Content hash + canonical refs + structure parsing
- `src/app/api/ai/explain-page/route.ts` - Async workflow + regenerate + revision tracking
- `src/app/api/ai/explain-page/status/[generationId]/route.ts` - Polling endpoint (NEW)
- `src/app/api/ai/explain-page/regenerate/route.ts` - Manual regeneration endpoint (NEW)
- `src/features/stickers/hooks/use-explain-page.ts` - 202 polling + regenerate logic
- `src/app/study/[fileId]/page.tsx` - Regenerate button + cache indicator
- `docs/sticker-generation-logic.md` - Documentation updates
- `docs/03_api_design.md` - API documentation updates

**REMOVED Modules:**
- ❌ `src/lib/i18n/translation.ts` - No translation layer in MVP
- ❌ `src/lib/ai/translate-image-summary.ts` - No translation needed
- ❌ Background refresh worker - No automatic refresh in MVP

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
- [ ] Summaries stored in `shared_image_summaries` table
- [ ] labels_from_image preserves original mixed-language text
- [ ] Used as internal context only (not user-facing)

### Bilingual Support (MVP - en, zh-Hans only)
- [ ] Users can set default language in settings (en | zh-Hans)
- [ ] Users can set share_to_cache preference (opt-out mechanism)
- [ ] Auto-detect language from browser on first visit (prefix matching)
- [ ] Native generation for English and 简体中文
- [ ] Shared cache has separate entries per language
- [ ] Only current language stickers displayed (no mixed languages)
- [ ] Language switcher triggers generation if not cached

### Cross-User Deduplication + Revision Tracking
- [ ] SHA-256 content hash calculated for all PDFs
- [ ] canonical_documents manages global PDF registry
- [ ] canonical_document_refs provides idempotent reference tracking
- [ ] Shared cache checked before generation (if user opted in)
- [ ] Opt-out users skip shared cache entirely
- [ ] Single-flight logic prevents duplicate generation (DB unique constraint with mode)
- [ ] Status machine (generating/ready/failed) works correctly
- [ ] Concurrent requests receive 202 with generationId
- [ ] Clients poll /status/:generationId endpoint every 2s
- [ ] Quota deducted even for cache hits

### Manual Regeneration + Revision Tracking
- [ ] "Regenerate" button triggers new revision
- [ ] Old revision marked as superseded (is_active=FALSE)
- [ ] Keep最近 3 revisions, delete older ones
- [ ] Regeneration logged to regenerate_audit_logs with full context
- [ ] Audit logs track: user, reason, quota, mode, model, tokens, status
- [ ] prompt_version only changes on system upgrades
- [ ] revision increments on user regeneration

### Monitoring Dashboard (MVP)
- [ ] /admin/metrics page accessible to admins only
- [ ] Yesterday's summary displayed (cache hits, generations, failures, latency)
- [ ] Cache performance by PDF/language/mode
- [ ] Generation latency p95 by mode
- [ ] Token usage distribution
- [ ] Error analysis (failure reasons, zombie frequency)
- [ ] Reference counting health monitoring
- [ ] No real-time alerts (dashboard-only for MVP)

### Cleanup Jobs (MVP)
- [ ] Zombie cleanup runs every 5 min (2 min timeout)
- [ ] Failed records cleanup daily (30-day retention)
- [ ] Old revisions cleanup daily (keep최근 3)
- [ ] Metrics aggregated hourly

### Compatibility
- [ ] Existing user-specific stickers remain functional
- [ ] No breaking changes to API response format (200 for ready, 202 for generating)
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
  - **Mitigation**: Async 202 responses; client polling; show loading state

### PDF Structure & Context Risks
- **Risk**: PDF structure parsing may fail for poorly formatted PDFs
  - **Mitigation**: Use 2-tier fallback (bookmarks → regex); skip scanned PDFs
- **Risk**: Including context may exceed token limits
  - **Mitigation**: Hard 2000 token limit with priority-based allocation; extractive summarization
- **Risk**: Context building adds latency
  - **Mitigation**: Parse structure on file upload; async 202 responses
- **Risk**: Some PDFs have no clear structure
  - **Mitigation**: Auto-detect scanned PDFs; use structure_confidence='low'

### Image Summary Risks
- **Risk**: Generating image summaries adds latency
  - **Mitigation**: Generate only on first auto-explain; cache indefinitely
- **Risk**: Image summary quality may vary
  - **Mitigation**: Include confidence score; acceptable for MVP

### Bilingual Risks (MVP - Simplified)
- **Risk**: Limited to 2 languages may frustrate some users
  - **Mitigation**: Clear communication; post-MVP expansion planned
- **Risk**: Native generation costs double for same content (en + zh-Hans)
  - **Mitigation**: Acceptable trade-off for quality; cache reduces redundancy

### Cross-User Deduplication + Revision Risks
- **Risk**: Single-flight DB logic may cause lock contention
  - **Mitigation**: Async 202 responses (non-blocking); unique constraint (atomic)
- **Risk**: Reference counting may have race conditions
  - **Mitigation**: Use canonical_document_refs with idempotent INSERTs; atomic operations
- **Risk**: Revision tracking increases storage
  - **Mitigation**: Keep only최근 3 revisions; daily cleanup job
- **Risk**: Quota deduction for cached hits may confuse users
  - **Mitigation**: Show cache hit indicator in UI (transparency)

### Monitoring Risks
- **Risk**: Metrics collection adds write load
  - **Mitigation**: Aggregate hourly; use INSERT ... ON CONFLICT for upserts
- **Risk**: Dashboard performance with large datasets
  - **Mitigation**: Limit queries to last 30 days; add pagination

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
- Test caching in `shared_image_summaries` table
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
- Test language switcher (instant for cached, loading for new)
- Verify no mixed-language display

### Cross-User Deduplication Testing
- Test SHA-256 hash calculation consistency
- Test shared cache lookup with mode dimension
- Test single-flight generation (concurrent requests with same mode)
- Verify unique constraint prevents duplicates
- Test status machine transitions (generating→ready, generating→failed)
- Verify quota deducted for cache hits
- Test with same PDF uploaded by multiple users
- Measure cache hit rate

### Revision Tracking + Regeneration Testing
- Test manual regeneration creates new revision
- Test old revision marked as superseded
- Test최근 3 revisions retained, older deleted
- Test audit logging captures all context
- Test regeneration with different modes
- Verify prompt_version vs revision distinction

### Reference Counting Testing
- Test canonical_document_refs idempotent INSERTs
- Test reference_count accuracy with concurrent uploads
- Test reference_count decrements on file delete
- Verify no negative reference_count
- Test reference counting health monitoring

### Monitoring Dashboard Testing
- Test admin access control (allowlist)
- Verify yesterday's summary displays correctly
- Test cache performance metrics by PDF/language/mode
- Test latency metrics by mode
- Test error analysis displays failure reasons
- Test reference counting health indicators
- Verify no real-time alerts in MVP

### Cleanup Jobs Testing
- Test zombie cleanup (2 min timeout, every 5 min)
- Test failed records cleanup (30-day retention, daily)
- Test old revisions cleanup (keep최근 3, daily)
- Verify cleanup jobs don't impact active generations

### Compatibility Testing
- Verify existing user-specific stickers still work
- Verify quota deduction still works
- Verify no breaking changes to API response format
- Test backfill for existing files (content_hash calculation)
- Test lazy補齐 in API layer

**Overall Validation**:
- All test scenarios pass
- No regression in existing functionality
- Image analysis produces meaningful explanations (when mode='with_images')
- Bilingual support works correctly (en, zh-Hans)
- Cross-user deduplication saves API costs
- Revision tracking provides quality control
- Monitoring dashboard provides operational visibility
- PDF structure context enhances explanations

## Related Changes
None

## Dependencies
- Existing dependencies in package.json are sufficient: `pdf-lib`, `pdfjs-dist`, `openai`
- No new external dependencies required
- Database migrations required for new tables/columns
- Admin dashboard requires Recharts (already in package.json)
