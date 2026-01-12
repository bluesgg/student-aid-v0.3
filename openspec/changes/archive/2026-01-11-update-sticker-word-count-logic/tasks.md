# Implementation Tasks: Cross-User Content Deduplication with Shared Cache

## Change ID
`cross-user-content-deduplication`

## Overview
These tasks implement a shared cache system for cross-user content deduplication, including:
1. PDF content hashing with SHA-256
2. Canonical documents layer with reference edges
3. Page-level metadata for effective_mode determination
4. Shared auto-stickers cache with DB-backed job queue
5. Atomic quota management with auto-refund on failure
6. Background worker with retry strategy and adaptive timeout
7. User opt-out mechanism
8. Performance monitoring with latency samples
9. Admin dashboard for operational visibility

**Key MVP Decisions**:
- No backfill of existing files (deferred to post-MVP)
- Quota charged at 202 response, auto-refunded on failure
- Worker runs every 1 minute via cron, processes 10 jobs max
- Dynamic deadline: 60s + 25s*images + 15s*chunks (max 300s)
- Prompt version as server constant for cache invalidation

**Note**: This module focuses on the caching and deduplication infrastructure. It assumes the core sticker generation logic (AI prompts, OpenAI integration, etc.) already exists or is being developed separately.

## Task List

### 1. Create Database Schema Migrations

- [ ] Create migration file `src/lib/supabase/migrations/002_cross_user_content_deduplication.sql`

**A. Create canonical documents infrastructure:**
- [ ] Create `canonical_documents` table (global PDF registry)
  - [ ] Columns: pdf_hash (PK), first_seen_at, last_accessed_at, last_reference_at, reference_count, total_pages, metadata
  - [ ] Add indexes for last_accessed_at and reference_count (WHERE reference_count = 0)

- [ ] Create `canonical_document_refs` table (reference edges)
  - [ ] Columns: id (PK), pdf_hash, ref_type, ref_id, created_at
  - [ ] Add FK to canonical_documents (ON DELETE CASCADE)
  - [ ] Add UNIQUE constraint on (ref_type, ref_id) for idempotency
  - [ ] Add indexes for pdf_hash and (ref_type, ref_id)

**B. Update files table:**
- [ ] Add `content_hash` column to `files` table
- [ ] Add FK from `files.content_hash` to `canonical_documents.pdf_hash` (ON DELETE SET NULL)
- [ ] Add index for content_hash

**C. Create shared_auto_stickers table** (serves as both result cache AND job queue):
- [ ] Create status enum `sticker_status` ('generating', 'ready', 'failed')
- [ ] Create `shared_auto_stickers` table:
  - [ ] Cache key: id, pdf_hash, page, prompt_version (default '2026-01-11.1'), locale, effective_mode
  - [ ] Content: status (enum), stickers (JSONB, nullable), image_summaries (JSONB, nullable)
  - [ ] Job queue fields:
    - [ ] locked_at (TIMESTAMPTZ), lock_owner (TEXT)
    - [ ] attempts (INT DEFAULT 0), run_after (TIMESTAMPTZ DEFAULT NOW())
    - [ ] expires_at (TIMESTAMPTZ, dynamic deadline)
    - [ ] last_error (TEXT), started_at, completed_at
    - [ ] chunk_plan (JSONB, optional)
  - [ ] Timestamps: created_at, updated_at, last_accessed_at, generation_time_ms
  - [ ] Add FK to canonical_documents (ON DELETE CASCADE)
  - [ ] Add locale validation CHECK (locale ~ '^(en|zh-Hans)$')
  - [ ] Add mode validation CHECK (effective_mode IN ('text_only', 'with_images'))
  - [ ] Create UNIQUE INDEX on (pdf_hash, page, prompt_version, locale, effective_mode) WHERE status IN ('generating', 'ready')
  - [ ] Add indexes:
    - [ ] idx_shared_stickers_lookup (pdf_hash, page, locale, effective_mode) WHERE status='ready'
    - [ ] idx_zombie_cleanup (status, expires_at) WHERE status='generating'
    - [ ] idx_worker_pickup (status, run_after, locked_at) WHERE status='generating'

**D. Create canonical_page_metadata table** (for effective_mode determination):
- [ ] Create table with columns:
  - [ ] pdf_hash, page (composite PK)
  - [ ] has_images (BOOLEAN), images_count (INT), word_count (INT)
  - [ ] is_scanned (BOOLEAN, optional), updated_at
- [ ] Add FK to canonical_documents (ON DELETE CASCADE)
- [ ] Add index idx_page_meta_lookup (pdf_hash, page)

**E. Create explain_requests table** (quota ledger):
- [ ] Create request_status enum ('charged', 'refunded')
- [ ] Create table with columns:
  - [ ] request_id (UUID PK, same as generation_id)
  - [ ] user_id, pdf_hash, page, prompt_version, locale, effective_mode
  - [ ] quota_units, status (enum), refund_reason
  - [ ] created_at, refunded_at
- [ ] Add FK to auth.users (ON DELETE CASCADE)
- [ ] Add indexes:
  - [ ] idx_requests_user (user_id, created_at DESC)
  - [ ] idx_requests_status (status, created_at)
  - [ ] idx_requests_refund (status, refunded_at) WHERE status='refunded'

**F. Create sticker_latency_samples table** (for P95 calculation):
- [ ] Create table with columns:
  - [ ] id (UUID PK), pdf_hash, page, locale, effective_mode
  - [ ] latency_ms, images_count, chunks, cache_hit (BOOLEAN)
  - [ ] created_at
- [ ] Add indexes:
  - [ ] idx_latency_samples_date (created_at DESC)
  - [ ] idx_latency_samples_aggregation (effective_mode, created_at)
  - [ ] idx_latency_samples_cleanup (created_at) WHERE created_at < NOW() - INTERVAL '14 days'

**G. Create user_preferences table:**
- [ ] Create table with: user_id (PK), share_to_cache (BOOLEAN), updated_at
- [ ] Add index for user_id
- [ ] Default share_to_cache = TRUE (opt-in by default)

**H. Create sticker_metrics table:**
- [ ] Create table with columns:
  - [ ] Dimensions: metric_date, metric_hour, pdf_hash, locale, mode
  - [ ] Metrics: cache_hits, cache_misses, generations_started/completed/failed, zombie_cleanups, refunds
  - [ ] Latency: total_generation_time_ms, p95_generation_time_ms (aggregated from samples)
  - [ ] Tokens: total_input_tokens, total_output_tokens
  - [ ] Errors: error_counts (JSONB)
  - [ ] Timestamps: created_at, updated_at
- [ ] Add UNIQUE constraint on (metric_date, metric_hour, pdf_hash, locale, mode)
- [ ] Add indexes for date/hour, pdf_hash/date, and aggregation queries

**Files**: `src/lib/supabase/migrations/002_cross_user_content_deduplication.sql` (NEW)

**Validation**:
- Run migration against dev database
- Verify all tables created successfully
- Verify status enum created
- Check all indexes exist
- Test unique constraints work
- Test FK constraints (CASCADE deletes)
- Test locale and mode validation checks

### 2. Create PDF Content Hashing Module

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
- Test with various PDF sizes (1KB, 1MB, 10MB)

### 3. Create Page Metadata and Effective Mode Determination

- [ ] Create `src/lib/pdf/page-metadata.ts` file
- [ ] Implement lightweight image detection:
  - [ ] `detectPageImages(pdfBuffer, page)`: Check if page has extractable embedded images (no base64 conversion)
  - [ ] Returns: `{has_images: boolean, images_count: number, word_count: number}`
  - [ ] Should complete in <100ms (lightweight check only)
- [ ] Implement metadata management:
  - [ ] `getOrCreatePageMetadata(pdfHash, page)`: Query canonical_page_metadata, or run detection and UPSERT
  - [ ] `determineEffectiveMode(pdfHash, page)`: Returns 'text_only' | 'with_images' based on has_images
- [ ] Add TypeScript types

**Files**: `src/lib/pdf/page-metadata.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test lightweight detection completes quickly (<100ms per page)
- Test UPSERT is idempotent
- Test effective_mode determination logic
- Test with various PDF types (text-only, with-images, scanned)

### 4. Create Shared Cache with Quota Management

- [ ] Create `src/lib/stickers/shared-cache.ts` file
- [ ] Implement user preference functions:
  - [ ] `checkUserSharePreference(userId)`: Check if user opted out (user_preferences.share_to_cache)
- [ ] Implement cache lookup functions:
  - [ ] `checkSharedCache(pdfHash, page, locale, mode)`: Query for stickers, returns `{status, stickers?, generationId?}`
  - [ ] Handle status='ready': Return stickers immediately
  - [ ] Handle status='generating': Return existing generationId for polling
- [ ] Implement job creation functions:
  - [ ] `tryStartGeneration(pdfHash, page, locale, mode, userId, quotaUnits)`:
    - [ ] Calculate `expires_at = NOW() + min(300s, 60s + images_count*25s + chunks*15s)`
    - [ ] INSERT with status='generating' (returns started=true if successful, false if constraint violation)
    - [ ] On success: Also INSERT to explain_requests with status='charged'
    - [ ] Returns: `{started: boolean, generationId: UUID}`
- [ ] Implement status query for polling:
  - [ ] `getGenerationStatus(generationId)`: Returns `{status, stickers?, error?}`
- [ ] Add TypeScript types

**Files**: `src/lib/stickers/shared-cache.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test opt-out: users with share_to_cache=false skip shared cache
- Test single-flight: concurrent requests receive same generationId
- Test unique constraint prevents duplicate job creation
- Test expires_at calculation with different images_count and chunks
- Test explain_requests record created atomically with job

### 5. Update File Upload Route for Hashing and Canonical Refs

- [ ] Update `src/app/api/courses/[courseId]/files/route.ts`
- [ ] After uploading PDF to storage:
  - [ ] Calculate content hash with `calculatePDFHash(pdfBuffer)`
  - [ ] UPSERT to `canonical_documents` table:
    - [ ] INSERT if not exists (set reference_count=0, first_seen_at=NOW, last_reference_at=NOW)
    - [ ] UPDATE last_accessed_at=NOW and last_reference_at=NOW if exists
  - [ ] INSERT to `canonical_document_refs` using atomic CTE:
    ```sql
    WITH inserted AS (
      INSERT INTO canonical_document_refs (pdf_hash, ref_type, ref_id)
      VALUES ($hash, 'file', $fileId)
      ON CONFLICT (ref_type, ref_id) DO NOTHING
      RETURNING pdf_hash
    )
    UPDATE canonical_documents
    SET reference_count = reference_count + 1
    WHERE pdf_hash IN (SELECT pdf_hash FROM inserted);
    ```
  - [ ] Store hash in `files.content_hash`

**Files**: `src/app/api/courses/[courseId]/files/route.ts`

**Validation**:
- Run `pnpm typecheck`
- Test file upload calculates and stores content_hash correctly
- Test canonical_documents UPSERT works
- Test canonical_document_refs idempotent INSERT works
- Test reference_count increments correctly
- Test concurrent uploads of same PDF (verify canonical_documents handles it)
- Test file delete decrements reference_count correctly

### 6. Create Background Worker Infrastructure

- [ ] Create `src/lib/worker/sticker-worker.ts` file
- [ ] Implement job pickup logic:
  - [ ] `pickupJobs(limit=10)`: SELECT jobs with `FOR UPDATE SKIP LOCKED`
    - [ ] Query: `WHERE status='generating' AND run_after <= NOW() AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '2 minutes')`
    - [ ] Update: SET locked_at=NOW(), lock_owner='worker-instance-id'
    - [ ] Returns array of job records
- [ ] Implement generation workflow:
  - [ ] `processJob(job)`:
    - [ ] UPDATE started_at=NOW()
    - [ ] Get page metadata (images_count, word_count)
    - [ ] If effective_mode='with_images': Analyze images once, store in image_summaries
    - [ ] Generate stickers (chunks + merging)
    - [ ] On success: UPDATE status='ready', stickers=result, completed_at=NOW()
    - [ ] On failure: Handle retry or mark failed
- [ ] Implement retry strategy:
  - [ ] `handleFailure(job, error)`:
    - [ ] Classify error: transient (retry) vs permanent (fail immediately)
    - [ ] If attempts < 3 AND transient:
      - [ ] attempts += 1
      - [ ] run_after = NOW() + [1min, 5min, 15min][attempts-1] + random(0-30s)
      - [ ] last_error = error message
    - [ ] If attempts >= 3 OR permanent OR NOW() > expires_at:
      - [ ] status='failed', last_error=error
      - [ ] Refund quota: UPDATE explain_requests SET status='refunded', refund_reason=error
- [ ] Implement zombie cleanup:
  - [ ] `cleanupZombies()`: UPDATE shared_auto_stickers SET status='failed', last_error='Generation timeout' WHERE status='generating' AND NOW() > expires_at
  - [ ] Trigger refund for timed-out jobs
- [ ] Add TypeScript types and error handling

**Files**:
- `src/lib/worker/sticker-worker.ts` (NEW)
- `src/app/api/internal/worker/run/route.ts` (NEW - cron endpoint)

**Worker deployment**:
- [ ] Create API route `/api/internal/worker/run` (POST)
- [ ] Add authentication: Check secret token from env (WORKER_SECRET)
- [ ] Route calls `pickupJobs()` → `processJob()` for each → `cleanupZombies()`
- [ ] Runtime budget: Complete within 50 seconds
- [ ] Configure Vercel Cron (or external cron): Trigger every 1 minute

**Validation**:
- Run `pnpm typecheck`
- Test job pickup with `FOR UPDATE SKIP LOCKED` (concurrent workers don't pick same job)
- Test retry strategy (exponential backoff + jitter)
- Test error classification (transient vs permanent)
- Test zombie cleanup marks jobs as failed after expires_at
- Test refund triggered on failure
- Test worker completes within 50 seconds
- Test cron endpoint authentication

### 7. Update Explain-Page API Route with Full Workflow

- [ ] Update `src/app/api/ai/explain-page/route.ts` with complete cache workflow:

**A. Quota check first (fail fast):**
  - [ ] Import quota system functions
  - [ ] Call `ensureQuota(userId, estimatedQuotaUnits)` at the very beginning
  - [ ] If insufficient: Return 402 Payment Required immediately
  - [ ] This prevents any further processing if user can't afford the request

**B. Determine effective_mode BEFORE cache lookup:**
  - [ ] Get file.content_hash from database
  - [ ] If content_hash is NULL: Skip shared cache, generate without caching (old files)
  - [ ] Call `determineEffectiveMode(content_hash, page)` from page-metadata module
    - [ ] This checks canonical_page_metadata or runs lightweight detection
    - [ ] Returns 'text_only' | 'with_images'
  - [ ] Now have complete cache key: (pdf_hash, page, prompt_version, locale, effective_mode)

**C. Check user opt-out:**
  - [ ] Call `checkUserSharePreference(userId)`
  - [ ] If opted out: Skip shared cache entirely, use user-specific generation (and table)
  - [ ] If opted in: Proceed to shared cache flow

**D. Check shared cache:**
  - [ ] Call `checkSharedCache(content_hash, page, locale, effective_mode)`
  - [ ] If status='ready':
    - [ ] Deduct quota → INSERT explain_requests (status='charged')
    - [ ] Record latency sample: INSERT sticker_latency_samples (cache_hit=true)
    - [ ] Return 200 with stickers immediately
  - [ ] If status='generating':
    - [ ] Return 202 with existing generationId (quota already charged by first request)
    - [ ] Client polls `/status/:generationId`
  - [ ] If not found or status='failed': Proceed to job creation

**E. Create async generation job:**
  - [ ] Call `tryStartGeneration(content_hash, page, locale, effective_mode, userId, quotaUnits)`
    - [ ] This atomically: Deducts quota + INSERTs job + Records explain_requests
    - [ ] Calculates expires_at based on images_count and estimated chunks
  - [ ] If started=true: Return 202 with new generationId
  - [ ] If started=false: Another request won the race, return 202 with existing generationId
  - [ ] Client polls `/status/:generationId` every 2s (max 5 min)

**F. Create polling endpoint:**
  - [ ] Create `src/app/api/ai/explain-page/status/[generationId]/route.ts`
    - [ ] GET endpoint: Query shared_auto_stickers by id
    - [ ] Returns `{status: 'generating' | 'ready' | 'failed', stickers?, error?}`
    - [ ] If status='ready': Return stickers
    - [ ] If status='failed': Return error message
    - [ ] If status='generating': Return progress indicator (optional)
    - [ ] Add request timeout (5s)

**G. Record metrics:**
  - [ ] After each request, record latency sample:
    - [ ] INSERT sticker_latency_samples (latency_ms, images_count, chunks, cache_hit)
  - [ ] Update aggregated metrics:
    - [ ] UPDATE sticker_metrics (cache_hits/misses, generations, tokens, etc.)

**Files**:
- `src/app/api/ai/explain-page/route.ts` (UPDATE)
- `src/app/api/ai/explain-page/status/[generationId]/route.ts` (NEW)

**Validation**:
- Run `pnpm typecheck`
- Test quota check fails fast (402 before any processing)
- Test effective_mode determined before cache lookup
- Test opt-out: users with share_to_cache=false skip shared cache
- Test concurrent requests (verify 202 responses with same generationId)
- Test cache hit (verify 200 response with quota deducted, latency sample recorded)
- Test cache miss (verify 202 response, explain_requests recorded)
- Test client polling workflow (/status/:generationId)
- Test old files without content_hash work correctly (skip shared cache)
- Verify metrics collected correctly (latency samples, aggregated metrics)

### 8. Add Monitoring and Metrics Dashboard

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
  - [ ] Create `src/app/admin/metrics/page.tsx` with Next.js + Recharts
  - [ ] Add admin access control:
    - [ ] Environment variable allowlist (ADMIN_EMAILS - comma-separated emails)
    - [ ] Middleware to check access: user email must be in ADMIN_EMAILS
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

**Note**: Backfill of existing files (without content_hash) is deferred to post-MVP. Old files will not participate in shared cache until backfilled.

**Note**: Zombie cleanup and failed records cleanup are integrated into the background worker (Task 6). No separate cleanup jobs needed in MVP.

### 9. Update Documentation

- [ ] Update `docs/sticker-generation-logic.md`:
  - [ ] NEW section on cross-user deduplication architecture
  - [ ] Document canonical documents layer and reference edges
  - [ ] Document page-level metadata for effective_mode determination
  - [ ] Document shared cache behavior (DB-backed job queue)
  - [ ] Document async workflow with 202 responses and client polling
  - [ ] Document opt-out mechanism (user_preferences.share_to_cache)
  - [ ] Document quota policy: charged at 202, auto-refunded on failure
  - [ ] Document prompt_version strategy (server constant, bump rules)
  - [ ] Document adaptive timeout formula (60s + 25s*images + 15s*chunks, max 300s)
  - [ ] Document worker retry strategy (3 attempts, exponential backoff + jitter)

- [ ] Update `docs/03_api_design.md`:
  - [ ] Document 202 async workflow (returned immediately, worker processes in background)
  - [ ] Document polling endpoint GET /api/ai/explain-page/status/:generationId
  - [ ] Document request/response schemas for both endpoints
  - [ ] Document quota flow: ensureQuota → charge → refund on failure
  - [ ] Document effective_mode determination (before cache lookup)
  - [ ] Document error codes and retry behavior
  - [ ] Update examples to show async workflow with polling
  - [ ] Document backward compatibility (old files without content_hash)

- [ ] Create `docs/cost-comparison-analysis.md` (if not exists):
  - [ ] Expected cache hit rate (>60% for popular docs)
  - [ ] Cost savings calculation
  - [ ] Performance improvements (cache hits <100ms)

**Files**:
- `docs/sticker-generation-logic.md` (UPDATE)
- `docs/03_api_design.md` (UPDATE)
- `docs/cost-comparison-analysis.md` (EXISTS, verify consistency)

**Validation**:
- Review documentation for clarity and accuracy
- Ensure all new features are documented
- Verify examples are correct and executable
- Verify prompt_version strategy is clear
- Verify quota flow is explained correctly

### 10. Integration Testing

#### Cross-User Deduplication Testing
- [ ] Test SHA-256 hash calculation consistency
- [ ] Test shared cache lookup with effective_mode dimension
- [ ] Test single-flight: concurrent requests receive 202 with same generationId
- [ ] Verify unique constraint prevents duplicates (with mode)
- [ ] Test status transitions (generating→ready, generating→failed)
- [ ] Verify quota deducted even for cache hits
- [ ] Test with same PDF uploaded by multiple users
- [ ] Measure cache hit rate on popular documents

#### Reference Counting Testing
- [ ] Test canonical_document_refs idempotent INSERTs (UNIQUE constraint)
- [ ] Test reference_count accuracy with concurrent file uploads
- [ ] Test reference_count increments correctly on file upload
- [ ] Test reference_count decrements correctly on file delete
- [ ] Verify no negative reference_count (monitoring alert)
- [ ] Test reference counting health monitoring in dashboard

#### Async Workflow and Quota Testing
- [ ] Test 202 response includes generationId
- [ ] Test client polling endpoint (/status/:generationId)
- [ ] Test polling timeout (5 min)
- [ ] Test quota charged at 202 response (explain_requests record created)
- [ ] Test zombie cleanup marks stuck generations as failed (after expires_at)
- [ ] Test auto-refund on generation failure (explain_requests.status='refunded')
- [ ] Test concurrent requests with same cache key
- [ ] Test generation completes in background via worker
- [ ] Test adaptive timeout (expires_at based on images_count and chunks)

#### Worker and Retry Testing
- [ ] Test worker picks up jobs correctly (FOR UPDATE SKIP LOCKED)
- [ ] Test worker processes job successfully (status: generating → ready)
- [ ] Test retry on transient errors (OpenAI 429, 5xx, network timeout)
- [ ] Test no retry on permanent errors (PDF corrupt, 404)
- [ ] Test exponential backoff with jitter (1min → 5min → 15min + random(0-30s))
- [ ] Test max attempts (3) enforcement
- [ ] Test worker completes within 50 seconds budget
- [ ] Test worker cron endpoint authentication (WORKER_SECRET)

#### Effective Mode and Page Metadata Testing
- [ ] Test lightweight image detection (<100ms per page)
- [ ] Test effective_mode determination (text_only vs with_images)
- [ ] Test canonical_page_metadata UPSERT idempotency
- [ ] Test cache lookup uses correct effective_mode
- [ ] Test image analysis happens once, stored in image_summaries JSONB
- [ ] Test subsequent chunks reference image_summaries (not raw base64)

#### Monitoring Dashboard Testing
- [ ] Test admin access control (ADMIN_EMAILS allowlist)
- [ ] Verify yesterday's summary displays correctly
- [ ] Test cache performance metrics by PDF/language/mode
- [ ] Test latency metrics by mode (p95, aggregated from sticker_latency_samples)
- [ ] Test token usage distribution
- [ ] Test error analysis displays failure reasons
- [ ] Test reference counting health indicators
- [ ] Test refund tracking (total refunds, refund rate)
- [ ] Test sticker_latency_samples 14-day cleanup
- [ ] Verify no real-time alerts in MVP (dashboard only)

#### Opt-Out Testing
- [ ] Test users with share_to_cache=false skip shared cache
- [ ] Test opted-out users' stickers stored in user-specific table only
- [ ] Test opted-in users benefit from cache hits

#### Prompt Version Testing
- [ ] Test prompt_version included in cache key
- [ ] Test bumping PROMPT_VERSION creates cache misses for new requests
- [ ] Test old version results remain in cache but unused
- [ ] Verify PROMPT_VERSION is server-side constant

#### Compatibility Testing
- [ ] Verify existing user-specific stickers still work
- [ ] Verify quota deduction still works as expected
- [ ] Verify no breaking changes to API response format (200 for ready, 202 for generating)
- [ ] Test old files without content_hash skip shared cache gracefully
- [ ] Test new file uploads after migration have content_hash populated
- [ ] Verify backward compatibility: clients can handle both 200 and 202 responses

**Validation**:
- All test scenarios pass
- No regression in existing functionality
- Cross-user deduplication saves API costs (verify with real data)
- Cache hit rate meets expectations (>60% for popular docs)
- Async workflow provides good UX (non-blocking, client polls successfully)
- Worker processes jobs within budget (≤50 seconds)
- Quota refund works correctly (no user complaints about unfair charges)
- Monitoring provides operational visibility
- Adaptive timeout prevents premature failures

### 11. Final Verification

- [ ] Run `pnpm lint` and fix any issues
- [ ] Run `pnpm typecheck` and fix any type errors
- [ ] Run database migrations against dev/staging (002_cross_user_content_deduplication.sql)
- [ ] Verify no breaking changes to API response format (200 for ready, 202 for generating)
- [ ] Measure API response time:
  - [ ] Quota check: <10ms
  - [ ] Effective_mode determination: <100ms (lightweight detection)
  - [ ] Cache hit: <100ms (p95) end-to-end
  - [ ] Cache miss: Return 202 immediately (<50ms)
  - [ ] Polling endpoint: <50ms per request
  - [ ] Worker processing: Complete within 50 seconds (per batch of 10 jobs)
- [ ] Verify cross-user deduplication reduces API costs (measure actual savings)
- [ ] Verify async single-flight works (202 responses, client polling, no duplicate generation)
- [ ] Verify worker cron runs every 1 minute successfully
- [ ] Verify zombie cleanup works (jobs marked failed after expires_at)
- [ ] Verify quota refund on failure (explain_requests.status='refunded')
- [ ] Verify canonical_documents reference counting works correctly (atomic operations)
- [ ] Verify monitoring dashboard displays all metrics correctly
- [ ] Verify opt-out mechanism works (share_to_cache preference)
- [ ] Verify prompt_version strategy works (cache invalidation on version bump)
- [ ] Verify old files without content_hash skip shared cache gracefully
- [ ] Add dependencies: `pnpm add recharts` (if not already installed)

## Dependency Notes

- **Task 1 (Database migrations)** must be completed FIRST (includes all 9 tables + enums)
- **Task 2 (PDF hashing)** must be completed before Task 5 (file upload)
- **Task 3 (Page metadata)** must be completed before Task 7 (explain-page API - needs effective_mode)
- **Task 4 (Shared cache)** must be completed before Task 7 (explain-page API)
- **Task 5 (File upload)** can be done in parallel with Tasks 3-4
- **Task 6 (Worker)** must be completed before end-to-end testing
- **Task 7 (Explain-page API)** requires Tasks 1-4 complete
- **Task 8 (Monitoring)** requires Task 1 complete (needs sticker_metrics table)
- **Task 9 (Documentation)** can be done in parallel with tasks 1-8
- **Task 10 (Integration testing)** requires tasks 1-8 to be complete
- **Task 11 (Final verification)** must be done last

**Critical path**: Task 1 → Task 3 → Task 4 → Task 7 → Task 6 → Task 10 → Task 11

## External Dependencies

This module assumes the following functionality exists or is being developed separately:
- **Sticker generation logic**: AI prompts, OpenAI integration, response parsing (worker will call this)
- **User authentication**: Supabase auth for user_id resolution
- **File storage**: Supabase storage for PDF files
- **Quota system**:
  - `ensureQuota(userId, units)`: Check if user has sufficient quota
  - `deductQuota(userId, units)`: Deduct quota from user account
  - `refundQuota(userId, units, reason)`: Refund quota on failure
- **Locale determination**: How `locale` is determined (from user preferences, Accept-Language header, etc.)
- **PDF parsing library**: For lightweight image detection (pdf-lib or pdfjs-dist)
- **Cron service**: Vercel Cron or external scheduler for triggering worker every 1 minute

## Estimated Scope

- **Large**: Adds comprehensive deduplication infrastructure with async job processing
- **High complexity**:
  - **9 new database tables**: canonical_documents, canonical_document_refs, canonical_page_metadata, shared_auto_stickers (dual-purpose: cache + job queue), explain_requests, sticker_latency_samples, user_preferences, sticker_metrics
  - **2 new enums**: sticker_status, request_status
  - **DB-backed job queue**: Using shared_auto_stickers with FOR UPDATE SKIP LOCKED
  - **Background worker**: Cron-triggered, processes 10 jobs/min, ≤50s runtime budget
  - **Async single-flight pattern**: 202 responses, client polling, no duplicate work
  - **Atomic quota management**: Charge at 202, auto-refund on failure
  - **Adaptive timeout**: Dynamic expires_at based on content complexity
  - **Retry strategy**: Exponential backoff + jitter, error classification, max 3 attempts
  - **Reference counting**: Atomic operations with CTEs
  - **Monitoring dashboard**: Admin-only, aggregated metrics, P95 latency calculation
  - **Prompt versioning**: Server constant for cache invalidation
- **Backward compatible**:
  - Existing user-specific stickers remain valid
  - API contract extended (200 for ready, 202 for generating)
- **Performance impact**:
  - Cache hits: <100ms (instant delivery)
  - Cache misses: 202 response <50ms (non-blocking)
  - Significant cost savings from deduplication (>60% cache hit rate expected)
- **Major features**:
  - Cross-user content deduplication
  - Canonical documents with reference edges
  - Async single-flight generation (no duplicate work)
  - User opt-out mechanism
  - Monitoring dashboard for cache performance
  - Atomic reference counting
