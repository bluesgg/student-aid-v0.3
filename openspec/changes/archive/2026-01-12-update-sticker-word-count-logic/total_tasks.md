# Implementation Tasks

## Overview
These tasks implement:
1. Word-count-based sticker generation logic
2. Image extraction and analysis with GPT-4o Vision (mode-based: text_only vs with_images)
3. PDF structure parsing for chapter/section context
4. English-only image summaries for internal context
5. Bilingual support (English and 简体中文 only - MVP)
6. Cross-user content deduplication with single-flight generation
7. Revision tracking and manual regeneration with audit logging
8. PDF context building using original text (not previous stickers)
9. Monitoring dashboard for cache performance and system health

## Task List

### 1. Create PDF Image Extraction Module (Optional - Mode-Based)
- [ ] Create `src/lib/pdf/extract-images.ts` file
- [ ] Implement `extractPageImages(buffer: Buffer, pageNumber: number)` function:
  - [ ] Only called when mode='with_images'
  - [ ] Use pdf-lib to extract embedded images from page
  - [ ] If no embedded images found, return empty array (no page rendering)
  - [ ] Convert extracted images to base64 format
  - [ ] Add image size validation and compression to stay under 20MB
  - [ ] Return array of base64 image strings (may be empty)
- [ ] Add TypeScript types for image extraction results

**Files**: `src/lib/pdf/extract-images.ts` (NEW)

**Validation**:
- Run `pnpm typecheck` to ensure no type errors
- Test with PDFs containing embedded images (should extract images)
- Test with PDFs without embedded images (should return empty array)
- Test with scanned PDFs (should return empty array, process as text-only)
- Test with encrypted PDFs (graceful degradation to empty array)
- Verify image compression works for large embedded images

### 2. Create Database Schema Migrations
- [ ] Create migration file `src/lib/supabase/migrations/00X_sticker_improvements.sql`

**A. Create canonical documents infrastructure:**
- [ ] Create `canonical_documents` table (global PDF registry)
  - [ ] Columns: pdf_hash (PK), first_seen_at, last_accessed_at, last_reference_at, reference_count, total_pages, metadata
  - [ ] Add indexes for last_accessed_at and reference_count
- [ ] Create `canonical_document_refs` table (reference edges)
  - [ ] Columns: id (PK), pdf_hash, ref_type, ref_id, created_at
  - [ ] Add FK to canonical_documents (ON DELETE CASCADE)
  - [ ] Add UNIQUE constraint on (ref_type, ref_id) for idempotency
  - [ ] Add indexes for pdf_hash and (ref_type, ref_id)

**B. Update files table:**
- [ ] Add `content_hash`, `structure_parsed`, `structure_data`, `structure_confidence` columns to `files` table
- [ ] Add FK from `files.content_hash` to `canonical_documents.pdf_hash` (ON DELETE SET NULL)
- [ ] Add indexes for content_hash and structure_parsed

**C. Create shared_auto_stickers table with mode dimension and revision tracking:**
- [ ] Create status enum `sticker_status` ('generating', 'ready', 'failed')
- [ ] Create `shared_auto_stickers` table:
  - [ ] Columns: id, pdf_hash, page, prompt_version, locale, mode
  - [ ] Revision tracking: revision, is_active, superseded_by, superseded_at
  - [ ] Status and content: status (enum), stickers (JSONB), created_at, updated_at, last_accessed_at, generation_time_ms, error_message
  - [ ] Add FK to canonical_documents (ON DELETE CASCADE)
  - [ ] Add locale validation CHECK (locale ~ '^(en|zh-Hans)$')
  - [ ] Add mode validation CHECK (mode IN ('text_only', 'with_images'))
  - [ ] Create UNIQUE INDEX on (pdf_hash, page, prompt_version, locale, mode) WHERE is_active = TRUE
  - [ ] Add indexes for lookup, cleanup, and inactive revisions

**D. Create shared_image_summaries table (English-only, internal context):**
- [ ] Create table with: id, pdf_hash, page, image_index, summary_json (JSONB), created_at
- [ ] Add FK to canonical_documents (ON DELETE CASCADE)
- [ ] Add UNIQUE constraint on (pdf_hash, page, image_index)
- [ ] Add index for (pdf_hash, page)

**E. Create user_preferences table (simplified for bilingual MVP):**
- [ ] Create table with: user_id (PK), default_locale ('en' | 'zh-Hans'), share_to_cache (BOOLEAN), updated_at
- [ ] Add locale validation CHECK (default_locale ~ '^(en|zh-Hans)$')
- [ ] Add index for user_id

**F. Create regenerate_audit_logs table:**
- [ ] Create table with columns:
  - [ ] Basic: id, user_id, pdf_hash, page, locale, prompt_version, mode
  - [ ] Audit: reason, quota_deducted, cache_hit, generation_time_ms
  - [ ] Cost: model_used, input_tokens, output_tokens
  - [ ] Status: status, error_code
  - [ ] Revision: old_revision_id, new_revision_id
  - [ ] created_at
- [ ] Add indexes for (user_id, created_at), (pdf_hash, page), (status, created_at)

**G. Create sticker_metrics table:**
- [ ] Create table with columns:
  - [ ] Dimensions: metric_date, metric_hour, pdf_hash, locale, mode
  - [ ] Metrics: cache_hits, cache_misses, generations_started/completed/failed, zombie_cleanups
  - [ ] Latency: total_generation_time_ms, p95_generation_time_ms
  - [ ] Tokens: total_input_tokens, total_output_tokens
  - [ ] Errors: error_counts (JSONB)
  - [ ] Timestamps: created_at, updated_at
- [ ] Add UNIQUE constraint on (metric_date, metric_hour, pdf_hash, locale, mode)
- [ ] Add indexes for date/hour and pdf_hash/date

**Files**: `src/lib/supabase/migrations/00X_sticker_improvements.sql` (NEW)

**Validation**:
- Run migration against dev database
- Verify all tables created successfully
- Verify status enum created
- Check all indexes exist
- Test unique constraints work
- Test FK constraints (CASCADE deletes)
- Test locale and mode validation checks

### 3. Create PDF Structure Parsing Module (Two-tier with confidence scoring)
- [ ] Create `src/lib/pdf/structure-parser.ts` file
- [ ] Implement `parseStructure(pdfBuffer: Buffer)` function:
  - [ ] Detect if PDF is scanned (isScanned=true) and skip parsing entirely
  - [ ] **Primary**: Extract bookmarks/outline using pdf-lib (confidence='high')
  - [ ] **Fallback**: Detect chapter/section titles using regex patterns (confidence='medium'):
    - [ ] Pattern matching: "Chapter N:", "Section N.M:", "Part N", etc.
    - [ ] Title numbering detection (1., 1.1, 1.1.1)
  - [ ] If both fail: Return structure_confidence='low', structure_data=null
  - [ ] Map each page to its chapter and section
  - [ ] Build hierarchical structure tree: `{chapters: [{title, pages, sections: [{title, pages}]}]}`
- [ ] Return: `{structure, confidence: 'high'|'medium'|'low'}` or null
- [ ] Add TypeScript types for structure data

**Files**: `src/lib/pdf/structure-parser.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test with PDFs having bookmarks (should return confidence='high')
- Test with PDFs without bookmarks (should use regex with confidence='medium')
- Test with scanned PDFs (should auto-detect and skip parsing)
- Test with no clear structure (should return confidence='low' and null)
- Verify parsing completes within 5 seconds

### 4. Create PDF Context Builder Module (Hard token limits with extractive summarization)
- [ ] Create `src/lib/pdf/context-builder.ts` file
- [ ] Implement `buildContext(fileId, currentPage, structure)` function:
  - [ ] Retrieve PDF structure for the file
  - [ ] Extract original text from previous pages in same section/chapter
  - [ ] **Compress using extractive summarization** (not raw text):
    - [ ] Calculate TF-IDF scores for sentences
    - [ ] Select top-N sentences that fit token budget
    - [ ] Preserve sentence order from original
  - [ ] Build multi-tier context with priority-based token allocation:
    - [ ] Current page: up to 1500 tokens (always full, validate token count)
    - [ ] Section summary: up to 1000 tokens (compressed)
    - [ ] Chapter summary: up to 500 tokens (high-level)
    - [ ] Glossary: up to 300 tokens (key terms)
  - [ ] **Hard limit**: 2000 tokens total, truncate from lowest priority upward
  - [ ] Return structured context object: `{currentPage, sectionSummary, chapterSummary, glossary, tokenCount}`
- [ ] Implement token counting helper function (don't assume char count = token count)
- [ ] Add TypeScript types for context object

**Files**: `src/lib/pdf/context-builder.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test with page 1 (should return empty/minimal context)
- Test with page 5 (should include section summary)
- Verify token limit enforcement (hard max 2000 tokens)
- Verify current page token validation (if >1500 tokens, compress it too)
- Verify context uses extractive summarization, not raw PDF text
- Verify truncation works from lowest priority
- Test with long sections (verify compression works)

### 5. Create Image Summary Generation Module (English-Only, Internal Context)
- [ ] Create `src/lib/pdf/image-summary.ts` file
- [ ] Implement `generateImageSummary(imageBase64: string)` function:
  - [ ] Call GPT-4o vision with image
  - [ ] Extract structured data in **English only**: type, title, summary, key_elements, labels_from_image, confidence, bbox
  - [ ] **labels_from_image**: Preserve original text labels from image as-is (may be mixed language)
  - [ ] Return language-agnostic JSON object (English text with preserved labels)
- [ ] Implement `getOrCreateImageSummaries(pdfHash, page, images)`:
  - [ ] Check `shared_image_summaries` for existing summaries
  - [ ] If not found, generate summaries for all images (in English)
  - [ ] Store in database with (pdf_hash, page, image_index) key
  - [ ] Return array of summary JSON objects
- [ ] Add TypeScript types for image summary JSON

**Files**: `src/lib/pdf/image-summary.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test with diagram images (expect type="diagram")
- Test with chart images (expect type="chart")
- Verify JSON structure matches schema
- Verify all text fields generated in English
- Verify labels_from_image preserves original mixed-language text
- Test database storage and retrieval
- Measure generation time (expect 2-4s per image)

### 6. Create PDF Content Hashing Module
- [ ] Create `src/lib/pdf/hash.ts` file
- [ ] Implement `calculatePDFHash(pdfBuffer: Buffer)` function:
  - [ ] Use Node.js crypto module to calculate SHA-256 hash
  - [ ] Return hex string representation
- [ ] Add TypeScript types

**Files**: `src/lib/pdf/hash.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test hash consistency (same PDF = same hash)
- Test hash uniqueness (different PDFs = different hashes)

### 7. Create Shared Cache with Async Single-Flight Logic and Revision Tracking
- [ ] Create `src/lib/stickers/shared-cache.ts` file
- [ ] Implement user preference functions:
  - [ ] `checkUserSharePreference(userId)`: Check if user opted out (user_preferences.share_to_cache)
- [ ] Implement async single-flight functions:
  - [ ] `checkSharedCache(pdfHash, page, locale, mode)`: Query for active stickers, returns `{status, stickers?, generationId?}`
  - [ ] `tryStartGeneration(pdfHash, page, locale, mode)`: INSERT with status='generating', returns `{started: boolean, generationId}`
  - [ ] `getGenerationStatus(generationId)`: Poll endpoint for clients to check status
  - [ ] `completeGeneration(generationId, stickers)`: Update to status='ready'
  - [ ] `failGeneration(generationId, error)`: Update to status='failed'
- [ ] Implement revision management functions:
  - [ ] `createRevision(oldRevisionId, newStickers, auditData)`: Create new revision, mark old as superseded
  - [ ] `getActiveRevision(pdfHash, page, locale, mode)`: Retrieve latest active revision
  - [ ] `cleanupOldRevisions(pdfHash, page, locale, mode)`: Keep only最近 3 revisions
- [ ] Handle 202 responses with generation_id for async tracking
- [ ] Add TypeScript types

**Files**: `src/lib/stickers/shared-cache.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test opt-out: users with share_to_cache=false skip shared cache
- Test single-flight: concurrent requests receive 202 with same generationId
- Test unique constraint prevents duplicate entries
- Test status transitions (generating→ready, generating→failed)
- Test getGenerationStatus() polling endpoint
- Test async workflow (no blocking)
- Test revision creation (old marked superseded, new is active)
- Test최근 3 revisions cleanup

### 8. Create Bilingual Support Infrastructure (MVP - en, zh-Hans Only)
- [ ] Create `src/lib/i18n/locale-detection.ts` file:
  - [ ] `detectLocale(acceptLanguageHeader)`: Parse Accept-Language with prefix matching
    - [ ] `zh*` → `zh-Hans`
    - [ ] `en*` → `en`
    - [ ] Others → `en` (fallback)
  - [ ] `resolveEffectiveLocale(userId, requestLocale, acceptLanguage)`: Resolve request override > user default > auto-detect > 'en'
  - [ ] `isValidLocale(locale)`: Check if locale is 'en' or 'zh-Hans'
- [ ] Add TypeScript types

**Files**: `src/lib/i18n/locale-detection.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test locale detection from Accept-Language header (zh*, en*, others)
- Test effective locale resolution (request > user > auto > default)
- Verify only en and zh-Hans allowed

### 9. Upgrade OpenAI Model to GPT-4o
- [ ] Update `DEFAULT_MODEL` in `src/lib/openai/client.ts` to `gpt-4o`
- [ ] Add pricing for `gpt-4o` in `TOKEN_PRICING` constant
- [ ] Verify OpenAI client supports multimodal messages

**Files**: `src/lib/openai/client.ts`

**Validation**:
- Run `pnpm typecheck`
- Verify pricing information is accurate

### 10. Update AI Prompt Logic (Bilingual + Mode-Aware)
- [ ] Add word count calculation helper function in `src/lib/openai/prompts/explain-page.ts`
- [ ] Add sticker count determination logic based on word count tiers + image count
- [ ] Update `ExplainPageContext` interface to include:
  - [ ] `images: string[]` (base64) - Optional (may be empty, only when mode='with_images')
  - [ ] `pdfContext: PDFContext` (section/chapter from original text)
  - [ ] `imageSummaries: ImageSummary[]` (English-only, only if images exist and mode='with_images')
  - [ ] `locale: 'en' | 'zh-Hans'` (target language for stickers)
  - [ ] `mode: 'text_only' | 'with_images'`
  - [ ] `currentPage: number`
- [ ] Update `buildExplainPagePrompt()` to:
  - [ ] Accept PDF context (section/chapter text, NOT previous stickers)
  - [ ] Accept English image summaries from previous pages (when mode='with_images')
  - [ ] Accept locale parameter ('en' | 'zh-Hans')
  - [ ] Accept mode parameter
  - [ ] Build multimodal messages array: [system with locale instruction, section/chapter context, user+images]
  - [ ] Include instructions for analyzing images/diagrams/charts (when mode='with_images')
  - [ ] Include word count and target sticker count in system prompt
  - [ ] Instruct AI to generate in target locale (native for en/zh-Hans)
  - [ ] Handle paragraph-based splitting for 500+ word pages
  - [ ] Enforce minimum 1 sticker requirement
  - [ ] Skip image-related instructions when mode='text_only'
- [ ] Return complete conversation messages array (not just user message)

**Files**: `src/lib/openai/prompts/explain-page.ts`

**Validation**:
- Run `pnpm typecheck` to ensure no type errors
- Manually verify message array structure is correct
- Verify PDF context included (section/chapter text)
- Verify image summaries included and in English (when mode='with_images')
- Verify locale instruction in system prompt
- Verify mode-specific instructions

### 11. Update File Upload Route for Hashing, Canonical Documents, and Structure Parsing
- [ ] Update `src/app/api/courses/[courseId]/files/route.ts`
- [ ] After uploading PDF to storage:
  - [ ] Calculate content hash with `calculatePDFHash(pdfBuffer)`
  - [ ] UPSERT to `canonical_documents` table:
    - [ ] INSERT if not exists (set reference_count=0, first_seen_at=NOW, last_reference_at=NOW)
    - [ ] UPDATE last_accessed_at=NOW and last_reference_at=NOW if exists
  - [ ] INSERT to `canonical_document_refs` (idempotent, UNIQUE on ref_type+ref_id):
    - [ ] If INSERT succeeds: INCREMENT canonical_documents.reference_count
    - [ ] If conflict (already exists): Do nothing
  - [ ] Store hash in `files.content_hash`
  - [ ] Trigger structure parsing:
    - [ ] Call `parseStructure(pdfBuffer)` and store result in `files.structure_data`
    - [ ] Store confidence in `files.structure_confidence`
    - [ ] Mark `files.structure_parsed = TRUE`

**Files**: `src/app/api/courses/[courseId]/files/route.ts`

**Validation**:
- Run `pnpm typecheck`
- Test file upload with bookmarked PDF (verify structure parsed with confidence='high')
- Test file upload with plain PDF (verify regex fallback with confidence='medium')
- Test with scanned PDF (verify skipped with confidence='low')
- Verify content_hash stored correctly
- Verify canonical_documents UPSERT works
- Verify canonical_document_refs idempotent INSERT works
- Verify reference_count increments correctly
- Test concurrent uploads of same PDF (verify canonical_documents handles it)

### 12. Update Explain-Page API Route (Complete Async Workflow + Regenerate + Mode)
- [ ] Update `src/app/api/ai/explain-page/route.ts` with full workflow:

**A. Resolve effective locale:**
  - [ ] Import `resolveEffectiveLocale` from locale-detection
  - [ ] Check request-level override (`locale` query param)
  - [ ] Fall back to user default > Accept-Language > 'en'

**A2. Check mode parameter:**
  - [ ] Accept `mode` query param ('text_only' | 'with_images')
  - [ ] Default to 'with_images' if not specified

**A3. Check for regenerate request:**
  - [ ] Accept `force_regenerate=true` query param
  - [ ] Accept optional `reason` parameter ('quality_not_good' | 'outdated' | 'test' | 'other')
  - [ ] If regenerate: Skip cache check, create new revision, log to audit table

**A4. Check user share preference (opt-out):**
  - [ ] Import `checkUserSharePreference` from shared-cache
  - [ ] Call `checkUserSharePreference(userId)`
  - [ ] If opted out: Skip shared cache entirely, generate in user-specific table
  - [ ] If opted in: Proceed to shared cache flow

**B. Check shared cache (async non-blocking):**
  - [ ] Import `checkSharedCache` from shared-cache
  - [ ] Call `checkSharedCache(file.content_hash, page, locale, mode)`
  - [ ] If status='ready': Deduct quota, return 200 with stickers
  - [ ] If status='generating': Return 202 with existing generationId for client polling
  - [ ] If status='failed' or not found: Proceed to generation

**C. Start async generation:**
  - [ ] Call `tryStartGeneration(file.content_hash, page, locale, mode)`
  - [ ] If started=false: Another request started, return 202 with existing generationId
  - [ ] If started=true: Trigger background job, return 202 with new generationId

**D. Extract embedded images (only if mode='with_images'):**
  - [ ] Import `extractPageImages` from extract-images
  - [ ] If mode='with_images': Call `extractPageImages(pdfBuffer, page)` - returns empty array if no embedded images
  - [ ] If mode='text_only': Skip this step entirely, set images=[]

**E. Generate/retrieve image summaries (only if mode='with_images' and images exist):**
  - [ ] Import `getOrCreateImageSummaries` from image-summary
  - [ ] If mode='with_images' and images array is not empty:
    - [ ] Call `getOrCreateImageSummaries(file.content_hash, page, images)` (generates in English)
    - [ ] Load English summaries from previous pages (if relevant)
  - [ ] If mode='text_only' or no images: Skip this step

**F. Build PDF context:**
  - [ ] Import `buildContext` from context-builder
  - [ ] Call `buildContext(file.id, page, file.structure_data)`
  - [ ] Get section/chapter context from PDF original text

**G. Generate stickers:**
  - [ ] Import updated `buildExplainPagePrompt` from prompts
  - [ ] Pass pageText, images, pdfContext, imageSummaries (English), locale, mode
  - [ ] Generate natively in target locale (en or zh-Hans)
  - [ ] Call OpenAI API with messages array
  - [ ] Track input_tokens and output_tokens for audit logging
  - [ ] Parse response

**H. Store and return:**
  - [ ] If regenerate: Call `createRevision(oldRevisionId, stickers, auditData)`, log to regenerate_audit_logs
  - [ ] Else: Call `completeGeneration(file.content_hash, page, locale, stickers)`
  - [ ] Deduct quota (always, even for cache hits)
  - [ ] Update sticker_metrics table (cache hit/miss, tokens, latency, etc.)
  - [ ] Return stickers to user with `cached: boolean` flag

**I. Error handling:**
  - [ ] On failure: Call `failGeneration(generationId, error)` with error
  - [ ] Update sticker_metrics with error_code
  - [ ] Log to regenerate_audit_logs if regenerate request
  - [ ] Implement retry logic with exponential backoff
  - [ ] Zombie cleanup job handles stuck generations (every 5min)

**J. New API endpoints:**
  - [ ] Create `src/app/api/ai/explain-page/status/[generationId]/route.ts`
    - [ ] GET endpoint: Returns `{status, stickers?, error?, progress?}`
    - [ ] Client polls this every 2s until status != 'generating'

**Files**:
- `src/app/api/ai/explain-page/route.ts`
- `src/app/api/ai/explain-page/status/[generationId]/route.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test opt-out: users with share_to_cache=false skip shared cache
- Test with page 1, native locale (en/zh-Hans)
- Test with page 5 (should include PDF context)
- Test with both locales (en and zh-Hans)
- Test with mode='text_only' (should skip image extraction)
- Test with mode='with_images' and embedded images (should include in multimodal prompt)
- Test with mode='with_images' and text-only pages (should generate text-based stickers)
- Test regenerate request (should create new revision, log audit)
- Test concurrent requests (verify 202 responses with same generationId)
- Test cache hit (verify 200 response with quota deducted)
- Test client polling workflow (/status/:generationId)
- Test async generation completes in background
- Verify scanned PDFs work as text-only (no FILE_IS_SCANNED error)
- Verify metrics collected correctly

### 13. Update Response Parser
- [ ] Update `parseExplainPageResponse()` to handle 1-8 stickers (instead of 2-6)
- [ ] Add validation to ensure at least 1 sticker is always returned
- [ ] Add fallback logic if AI returns 0 stickers

**Files**: `src/lib/openai/prompts/explain-page.ts`

**Validation**:
- Run `pnpm typecheck`
- Unit test with mock responses containing 0, 1, 4, 8, and 10 stickers

### 14. Update Sticker Retrieval for Locale Filtering (Simplified for Bilingual)
- [ ] Update `src/lib/stickers/get-stickers.ts`
- [ ] Filter stickers by user's effective locale for the file
- [ ] Only return active stickers (is_active=TRUE) matching current language and mode
- [ ] No mixed-language display

**Files**: `src/lib/stickers/get-stickers.ts`

**Validation**:
- Run `pnpm typecheck`
- Test retrieval with both locales in database
- Verify only matching locale stickers returned
- Verify only active revisions returned

### 15. Update Frontend for Async Workflow (MVP Required)
- [ ] **Handle 202 responses with polling**:
  - [ ] Update `src/features/stickers/hooks/use-explain-page.ts` to detect 202 status
  - [ ] Implement polling logic: fetch `/api/ai/explain-page/status/:generationId` every 2s
  - [ ] Stop polling when status changes to 'ready' or 'failed'
  - [ ] Add timeout: stop polling after 5 minutes (show error)

- [ ] **Loading states**:
  - [ ] Show "Generating stickers..." with spinner during polling
  - [ ] Optional: Show progress percentage if API returns it
  - [ ] Disable navigation away from page during generation (warn user)

- [ ] **Cache hit indicator**:
  - [ ] Add `cached: boolean` field to API response
  - [ ] Show badge/icon on stickers: "📦 Cached result"
  - [ ] Tooltip: "This explanation was previously generated. Quota still deducted."

- [ ] **Manual regeneration button**:
  - [ ] Add "🔄 Regenerate" button in Study page toolbar
  - [ ] Confirmation dialog: "This will use X tokens from your quota. Continue?"
  - [ ] Optional reason selection dropdown ('quality_not_good', 'outdated', 'test', 'other')
  - [ ] Call API with `?force_regenerate=true&reason=<selected>`
  - [ ] Clear cached stickers and trigger new generation

- [ ] **Mode selection** (optional for MVP):
  - [ ] Add mode toggle: "Text Only" vs "With Images"
  - [ ] Save user preference per file
  - [ ] Clear cache when switching modes

- [ ] **Error handling**:
  - [ ] Show user-friendly error for 'failed' status
  - [ ] Distinguish between timeout vs API error vs parsing error
  - [ ] Offer "Try again" button

**Files**:
- `src/features/stickers/hooks/use-explain-page.ts` (UPDATE)
- `src/app/study/[fileId]/page.tsx` (UPDATE - add regenerate button)
- `src/components/sticker-list.tsx` (UPDATE - add cache indicator)

**Validation**:
- 202 polling works correctly
- Loading state shows during generation
- Cache hit badge displays when `cached: true`
- Regenerate button triggers new generation with new revision
- Regeneration with reason logged to audit table
- Error states display properly
- Polling timeout works (5 min)

### 16. Add Monitoring and Metrics Dashboard
- [ ] **Create sticker_metrics collection logic**:
  - [ ] Create `src/lib/monitoring/sticker-metrics.ts` file
  - [ ] Implement `recordMetric(data)` function:
    - [ ] Accept: metric_date, metric_hour, pdf_hash, locale, mode, cache_hit, generation_time_ms, tokens, status, error_code
    - [ ] INSERT ... ON CONFLICT DO UPDATE to sticker_metrics table
    - [ ] Aggregate: cache_hits, cache_misses, generations_started/completed/failed
    - [ ] Track: total_generation_time_ms, input/output tokens
    - [ ] Store: error_counts as JSONB (increment by error_code)
  - [ ] Implement `calculateP95Latency(metricId)` function (update p95_generation_time_ms)

- [ ] **Create admin dashboard**:
  - [ ] Create `/admin/metrics` page with Next.js + Recharts
  - [ ] Add admin access control:
    - [ ] Option A: Environment variable allowlist (comma-separated emails)
    - [ ] Option B: `is_admin` flag in user_preferences table
    - [ ] Middleware to check access
  - [ ] Display yesterday's summary:
    - [ ] Total cache hits vs misses
    - [ ] Total generations (started, completed, failed)
    - [ ] Average latency
    - [ ] Total tokens consumed
  - [ ] Display cache performance charts:
    - [ ] Hit rate by PDF (top 10 PDFs)
    - [ ] Hit rate by language (en vs zh-Hans)
    - [ ] Hit rate by mode (text_only vs with_images)
  - [ ] Display generation metrics:
    - [ ] p95 latency by mode (line chart, last 7 days)
    - [ ] Token usage distribution (histogram)
  - [ ] Display error analysis:
    - [ ] Failure rate trend (last 7 days)
    - [ ] Error type distribution (pie chart)
    - [ ] Zombie cleanup frequency
  - [ ] Display reference counting health:
    - [ ] Canonical documents count
    - [ ] Total reference_count
    - [ ] Alert if any reference_count < 0 (anomaly)

- [ ] **Integrate metrics collection into API routes**:
  - [ ] Update `src/app/api/ai/explain-page/route.ts` to call `recordMetric()` on each request
  - [ ] Track cache hit/miss, generation time, tokens, status, error_code

**Files**:
- `src/lib/monitoring/sticker-metrics.ts` (NEW)
- `src/app/admin/metrics/page.tsx` (NEW)
- `src/app/api/ai/explain-page/route.ts` (UPDATE)

**Validation**:
- Admin access control works (only allowlisted users can access)
- Yesterday's summary displays correctly
- Charts render with correct data
- Cache performance metrics by PDF/language/mode
- Latency metrics by mode (p95)
- Error analysis shows failure reasons
- Reference counting health indicators
- No real-time alerts in MVP (dashboard only)

### 17. Create Backfill Task for Existing Files
- [ ] **One-time backfill job**:
  - [ ] Create script: `src/scripts/backfill-content-hashes.ts`
  - [ ] Query files WHERE content_hash IS NULL (batch of 100)
  - [ ] For each file:
    - [ ] Download PDF from storage
    - [ ] Calculate SHA-256 hash with `calculatePDFHash()`
    - [ ] UPSERT to canonical_documents:
      ```sql
      INSERT INTO canonical_documents (pdf_hash, reference_count, first_seen_at, last_accessed_at, last_reference_at)
      VALUES ($hash, 0, NOW(), NOW(), NOW())
      ON CONFLICT (pdf_hash) DO UPDATE SET
        last_accessed_at = NOW(),
        last_reference_at = NOW();
      ```
    - [ ] INSERT to canonical_document_refs (idempotent):
      ```sql
      INSERT INTO canonical_document_refs (pdf_hash, ref_type, ref_id)
      VALUES ($hash, 'file', $fileId)
      ON CONFLICT (ref_type, ref_id) DO NOTHING;
      ```
    - [ ] UPDATE canonical_documents SET reference_count = (SELECT COUNT(*) FROM canonical_document_refs WHERE pdf_hash = $hash)
    - [ ] UPDATE files SET content_hash = $hash, structure_parsed = FALSE
  - [ ] Add progress logging every 10 files
  - [ ] Handle errors gracefully (log and continue)

- [ ] **Lazy補齐（API layer fallback）**:
  - [ ] In `explain-page/route.ts`:
    ```typescript
    if (!file.content_hash) {
      // Lazy backfill
      const pdfBuffer = await downloadPDF(file.storage_path);
      const hash = calculatePDFHash(pdfBuffer);

      // Atomic UPSERT canonical
      await upsertCanonicalDocument(hash);

      // Idempotent insert ref
      await insertCanonicalRef(hash, 'file', file.id);

      // Update file
      await updateFile(file.id, { content_hash: hash, structure_parsed: false });
    }
    ```

**Files**:
- `src/scripts/backfill-content-hashes.ts` (NEW)
- `src/app/api/ai/explain-page/route.ts` (UPDATE - add lazy backfill)

**Validation**:
- Backfill job completes without errors
- All existing files have content_hash after job
- reference_count matches actual refs count (via canonical_document_refs)
- Lazy backfill works for edge cases (job missed files, new uploads during job)
- No duplicate canonical_document_refs entries
- Idempotent operations (running backfill twice is safe)

### 18. Create Cleanup Jobs (MVP Scope)
- [ ] Create cleanup jobs for database maintenance:

**A. Zombie generation cleanup (every 5 minutes):**
  - [ ] UPDATE shared_auto_stickers SET status='failed', error_message='Generation timeout'
        WHERE status='generating' AND updated_at < NOW() - INTERVAL '2 minutes'
  - [ ] Log to sticker_metrics (zombie_cleanups count)

**B. Failed records cleanup (daily):**
  - [ ] DELETE FROM shared_auto_stickers
        WHERE status='failed' AND updated_at < NOW() - INTERVAL '30 days'

**C. Old revisions cleanup (daily):**
  - [ ] For each (pdf_hash, page, prompt_version, locale, mode) group:
    - [ ] Keep only最近 3 revisions (by created_at DESC)
    - [ ] DELETE older revisions WHERE is_active=FALSE

**D. Metrics aggregation (hourly):**
  - [ ] Calculate p95_generation_time_ms for completed metrics

**Files**: Cleanup job scripts (cron/scheduled, deployment-specific)

**Validation**:
- Test zombie cleanup (create stuck generation, verify it's marked failed)
- Test failed records cleanup (verify 30-day retention)
- Test old revisions cleanup (verify최근 3 retained, older deleted)
- Test metrics aggregation (verify p95 calculated correctly)
- Monitor cleanup metrics (records deleted, execution time)

### 19. Update Documentation
- [ ] Update `docs/sticker-generation-logic.md`:
  - [ ] Section 3 (Auto Sticker) - word-count-based logic
  - [ ] NEW section on mode dimension (text_only vs with_images)
  - [ ] NEW section on optional embedded image extraction (no page rendering)
  - [ ] NEW section on PDF structure parsing and context building (using original text)
  - [ ] NEW section on English-only image summaries as internal context
  - [ ] NEW section on bilingual support (en, zh-Hans)
  - [ ] NEW section on revision tracking and manual regeneration
  - [ ] Update prompt structure to include word count tiers, images (when mode='with_images'), and PDF context
  - [ ] Add examples of image-based stickers (when mode='with_images')
  - [ ] Document that scanned PDFs are now supported (text-only)
  - [ ] Document cross-user deduplication and shared cache
  - [ ] Document async single-flight generation logic with 202 responses
  - [ ] Remove stale-while-revalidate documentation

- [ ] Update `docs/03_api_design.md`:
  - [ ] Section 3.3 - remove FILE_IS_SCANNED error documentation
  - [ ] Document bilingual locale resolution (en, zh-Hans)
  - [ ] Document mode parameter (text_only vs with_images)
  - [ ] Document PDF context mechanism (section/chapter from original text)
  - [ ] Document GPT-4o model upgrade and cost implications
  - [ ] Document quota deduction for cache hits (transparency)
  - [ ] Update examples to show PDF context and bilingual support
  - [ ] Document shared cache behavior with mode dimension
  - [ ] Document revision tracking and manual regeneration endpoint
  - [ ] Document 202 async workflow and polling endpoint
  - [ ] Document audit logging for regeneration

**Files**:
- `docs/sticker-generation-logic.md`
- `docs/03_api_design.md`

**Validation**:
- Review documentation for clarity and accuracy
- Ensure all new features are documented
- Verify examples are correct

### 20. Integration Testing
#### Word Count Testing
- [ ] Test with PDF pages containing ~50 words (expect 1 sticker)
- [ ] Test with PDF pages containing ~200 words (expect 2 stickers)
- [ ] Test with PDF pages containing ~400 words (expect 3-4 stickers)
- [ ] Test with PDF pages containing ~700 words (expect 5-8 paragraph-based stickers)

#### Image Analysis Testing (Mode-Based)
- [ ] Test mode='with_images' + pages containing embedded diagrams (expect stickers explaining diagrams)
- [ ] Test mode='with_images' + pages containing charts/graphs (expect data interpretation stickers)
- [ ] Test mode='with_images' + pages containing mix of text and images
- [ ] Test mode='text_only' (expect pure text stickers, no image extraction)
- [ ] Test mode='with_images' + pages with no embedded images (expect text-only stickers)
- [ ] Test with scanned PDFs (MUST succeed by processing as text-only)
- [ ] Verify every page with mode='with_images' attempts image extraction

#### PDF Structure Parsing Testing
- [ ] Test with PDFs having bookmarks/TOC (verify extraction with confidence='high')
- [ ] Test with PDFs without bookmarks (verify pattern matching fallback with confidence='medium')
- [ ] Test with PDFs with chapter/section titles (verify detection)
- [ ] Test with scanned PDFs (verify graceful degradation to confidence='low')
- [ ] Verify structure stored in `files.structure_data`
- [ ] Measure parsing performance (expect <5s)

#### Image Summary Testing (English-Only, Internal Context)
- [ ] Test generation of English-only image summaries
- [ ] Verify JSON structure matches schema (type, title, summary, key_elements, labels_from_image, confidence)
- [ ] Test with diagrams, charts, formulas, illustrations
- [ ] Verify labels_from_image preserves mixed-language text from image
- [ ] Verify summaries cached in `shared_image_summaries`
- [ ] Verify image summaries used as internal context (not user-facing)
- [ ] Measure generation time (expect 2-4s per image)

#### PDF Context Building Testing
- [ ] Test section context extraction from PDF original text
- [ ] Test chapter summary generation
- [ ] Verify context uses PDF text, NOT sticker text
- [ ] Test token limit enforcement (max 2000 tokens)
- [ ] Test current page token validation (if >1500 tokens, compress it)
- [ ] Test context compression for long sections (extractive summarization)
- [ ] Verify page 1 works without context
- [ ] Test that explanations reference earlier PDF content

#### Bilingual Testing (en, zh-Hans)
- [ ] Test native generation for en and zh-Hans
- [ ] Test user-level default language setting
- [ ] Test request-level locale override
- [ ] Test auto-detection from Accept-Language header (zh*, en*, others)
- [ ] Verify locale-filtered sticker retrieval
- [ ] Verify no mixed-language display
- [ ] Test language switcher (instant for cached, loading for new)

#### Cross-User Deduplication Testing
- [ ] Test SHA-256 hash calculation consistency
- [ ] Test shared cache lookup with mode dimension
- [ ] Test single-flight: concurrent requests receive 202 with same generationId
- [ ] Verify unique constraint prevents duplicates (with mode)
- [ ] Test status transitions (generating→ready, generating→failed)
- [ ] Verify quota deducted even for cache hits
- [ ] Test with same PDF uploaded by multiple users
- [ ] Measure cache hit rate on popular documents

#### Revision Tracking + Manual Regeneration Testing
- [ ] Test manual regeneration creates new revision
- [ ] Test old revision marked as superseded (is_active=FALSE)
- [ ] Test최근 3 revisions retained, older deleted
- [ ] Test audit logging captures all context (user, reason, quota, mode, model, tokens, status)
- [ ] Test regeneration with different modes (text_only vs with_images)
- [ ] Verify prompt_version vs revision distinction
- [ ] Test revision cleanup job

#### Reference Counting Testing
- [ ] Test canonical_document_refs idempotent INSERTs (UNIQUE constraint)
- [ ] Test reference_count accuracy with concurrent file uploads
- [ ] Test reference_count increments correctly on file upload
- [ ] Test reference_count decrements correctly on file delete
- [ ] Verify no negative reference_count (monitoring alert)
- [ ] Test reference counting health monitoring in dashboard

#### Monitoring Dashboard Testing
- [ ] Test admin access control (allowlist or is_admin flag)
- [ ] Verify yesterday's summary displays correctly
- [ ] Test cache performance metrics by PDF/language/mode
- [ ] Test latency metrics by mode (p95)
- [ ] Test token usage distribution
- [ ] Test error analysis displays failure reasons
- [ ] Test reference counting health indicators
- [ ] Verify no real-time alerts in MVP (dashboard only)

#### Compatibility Testing
- [ ] Verify existing user-specific stickers still work
- [ ] Verify quota deduction still works as expected
- [ ] Verify no breaking changes to API response format (200 for ready, 202 for generating)
- [ ] Test migration path for existing files (backfill content_hash calculation)
- [ ] Test lazy補齐 for edge cases

**Validation**:
- All test scenarios pass
- No regression in existing functionality
- Image analysis produces meaningful explanations (when mode='with_images')
- Bilingual support works correctly (en, zh-Hans)
- Cross-user deduplication saves API costs
- PDF structure context enhances explanations
- Revision tracking provides quality control
- Monitoring provides operational visibility

### 21. Final Verification
- [ ] Run `pnpm lint` and fix any issues
- [ ] Run `pnpm typecheck` and fix any type errors
- [ ] Run database migrations against dev/staging
- [ ] Verify no breaking changes to API response format (200 for ready, 202 for generating)
- [ ] Check that all acceptance criteria in proposal.md are met
- [ ] Measure API response time:
  - [ ] mode='text_only': <2s (p95)
  - [ ] mode='with_images' (no images): <2s (p95)
  - [ ] mode='with_images' (1-3 images): <5s (p95)
  - [ ] mode='with_images' (4+ images): <8s (p95)
- [ ] Verify GPT-4o API costs are within acceptable range
- [ ] Verify scanned PDFs work as text-only
- [ ] Verify PDF context continuity works (using original text with extractive summarization)
- [ ] Verify bilingual support works for en and zh-Hans
- [ ] Verify opt-out mechanism works (share_to_cache preference)
- [ ] Verify cross-user deduplication reduces API costs
- [ ] Verify async single-flight works (202 responses, client polling)
- [ ] Verify revision tracking works (최근 3 retained)
- [ ] Verify audit logging works (regenerate_audit_logs)
- [ ] Verify cleanup jobs maintain database health
- [ ] Verify canonical_documents reference counting works correctly
- [ ] Verify monitoring dashboard displays metrics correctly

## Dependency Notes
- **Task 2 (Database migrations)** must be completed FIRST (includes canonical_documents, refs, revision fields, enums, audit, metrics)
- **Task 1 (PDF image extraction)** must be completed before task 12 (API route updates)
- **Task 3 (PDF structure parsing)** must be completed before task 4 (context builder)
- **Task 4 (PDF context builder)** must be completed before task 12 (API route updates)
- **Task 5 (Image summary generation)** must be completed before task 12 (API route updates)
- **Task 6 (PDF hashing)** must be completed before tasks 7, 11, 12
- **Task 7 (Shared cache with async + revision)** must be completed before task 12 (API route updates)
- **Task 8 (Bilingual infrastructure)** must be completed before tasks 10, 12
- **Task 9 (OpenAI model upgrade)** must be completed before task 10 (prompt updates)
- **Tasks 1-10** must be completed before task 12 (API route updates)
- **Task 11 (File upload route)** can be done in parallel with tasks 1-10 (but requires Task 2)
- **Task 12 (API route updates)** creates new endpoint for async polling
- **Task 13 (Response parser)** can be done in parallel with task 10
- **Task 14 (Sticker retrieval)** can be done in parallel with tasks 1-14
- **Task 15 (Frontend updates)** requires task 12 to be complete
- **Task 16 (Monitoring dashboard)** requires task 2 (metrics table) to be complete
- **Task 17 (Backfill)** requires task 2 (canonical tables) to be complete
- **Task 18 (Cleanup jobs)** requires task 2 (database migrations) to be complete
- **Task 19 (Documentation)** can be done in parallel with tasks 1-18
- **Task 20 (Integration testing)** requires tasks 1-18 to be complete
- **Task 21 (Final verification)** must be done last

## Estimated Scope
- **Extra Large**: Adds mode dimension, embedded image extraction (optional), 2-tier PDF structure parsing, image summaries (English-only), context building with extractive summarization, bilingual support (en, zh-Hans), canonical documents architecture, async single-flight with 202 responses, revision tracking, manual regeneration, audit logging, monitoring dashboard, opt-out mechanism, reference edges, cleanup jobs, word-count logic
- **Medium-High risk**:
  - Cost increase controlled (mode selection, only pages with images use vision)
  - Performance impact moderate (2-5s for pages with images, async 202 responses)
  - High complexity (10+ new modules, 8 new database tables, background jobs)
  - Major architectural changes (canonical_documents + refs, async cache, revision tracking, bilingual, metrics, cleanup jobs)
- **Backward compatible**:
  - Existing user-specific stickers remain valid
  - API contract extended (200 for ready, 202 for generating)
  - Graceful degradation for PDFs without structure or images
- **Performance impact**:
  - Text-only pages: Minimal increase (async processing)
  - mode='text_only': Skip image extraction entirely
  - mode='with_images' + pages with images: 2-5 seconds (image analysis)
  - First request per PDF: Structure parsing (background or inline)
  - Subsequent requests: Faster (shared cache, async 202)
  - Client-side polling required for async generations
- **Behavioral changes**:
  - Scanned PDFs processed as text-only (no FILE_IS_SCANNED error)
  - Quota deducted for cache hits (transparency via UI indicator)
  - Users can opt-out of sharing (share_to_cache preference)
  - Async 202 responses for in-progress generations
  - Users can manually regenerate with revision tracking
- **Major features**:
  - Canonical documents with reference edges and idempotent operations
  - 2-tier PDF structure parsing (bookmarks → regex, with confidence)
  - Context building with extractive summarization (hard 2000 token limit)
  - Mode dimension (text_only vs with_images)
  - Optional embedded image extraction (no page rendering)
  - English-only image summaries as internal context
  - Bilingual support (en, zh-Hans only - MVP)
  - Cross-user content deduplication with opt-out
  - Async single-flight (DB unique constraint with mode, 202 responses, client polling)
  - Revision tracking with manual regeneration
  - Audit logging for regeneration
  - Monitoring dashboard for cache performance and system health
  - Database cleanup jobs (zombie, failed, old revisions)
