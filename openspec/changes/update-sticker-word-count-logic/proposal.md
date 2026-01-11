# Proposal: Cross-User Content Deduplication with Shared Cache

## Change ID
`cross-user-content-deduplication`

## Summary
Implement a cross-user content deduplication system that caches auto-generated stickers based on PDF content hash, enabling instant delivery for previously processed pages and reducing redundant API costs. The system uses async single-flight generation with DB-backed job queue, atomic quota management with auto-refund on failure, and dynamic deadline calculation based on content complexity.

## Problem Statement

### Current Issue: Duplicate AI Processing Across Users
When multiple users upload the same PDF (e.g., same textbook, same lecture slides):
- Each user triggers separate AI processing for the same content
- Identical pages are analyzed multiple times, wasting API costs (GPT-4o is expensive)
- Response time is slow for common educational materials
- No benefit from previous users' AI-generated explanations

**Example scenario**:
- 100 students upload the same textbook
- Each requests explanations for page 1-50
- System makes 5,000 API calls (100 × 50) for identical content
- Cost: ~$100-200 in redundant API calls
- Average wait time: 2-5 seconds per page

## Proposed Solution

### Core Architecture: Canonical Documents with Reference Edges

**1. PDF Content Hashing**
- Calculate SHA-256 hash of PDF file content to uniquely identify documents
- Same content = same hash, regardless of filename or upload location

**2. Canonical Documents Layer**
```sql
canonical_documents (pdf_hash PK)
  ├─ first_seen_at, last_accessed_at, last_reference_at
  ├─ reference_count (maintained via canonical_document_refs)
  └─ metadata (total_pages, etc.)

canonical_document_refs (id PK)
  ├─ pdf_hash → FK to canonical_documents (ON DELETE CASCADE)
  ├─ ref_type (e.g., 'file')
  ├─ ref_id (e.g., file.id)
  └─ UNIQUE(ref_type, ref_id) -- Idempotency guarantee
```

**Purpose**:
- Separate global PDF registry from user-specific file instances
- When user deletes their file → refs removed, but canonical stays if other refs exist
- When no refs remain → canonical can be garbage collected (post-MVP)

**3. Shared Sticker Cache with DB-Backed Job Queue**

```sql
shared_auto_stickers (serves as both result cache AND job queue)
  ├─ pdf_hash, page, prompt_version, locale, effective_mode (unique key)
  ├─ status: 'generating' | 'ready' | 'failed'
  ├─ stickers (JSONB) -- Main content
  ├─ image_summaries (JSONB) -- Image analysis results (internal use)
  ├─ generation_time_ms, last_accessed_at
  ├─ Job queue fields:
  │   ├─ locked_at, lock_owner (worker instance ID)
  │   ├─ attempts, run_after (exponential backoff)
  │   ├─ expires_at (dynamic deadline: 60s + 25s*images + 15s*chunks, max 300s)
  │   ├─ last_error, started_at, completed_at
  │   └─ chunk_plan (JSONB, optional: preserves chunking strategy)
  └─ FK to canonical_documents (ON DELETE CASCADE)
```

**Single-Flight Async Pattern with Atomic Quota**:
1. User requests stickers for page N
2. **Check quota first** (ensureQuota) → fail fast with 402 if insufficient
3. Check `shared_auto_stickers` cache
4. **If status='ready'**: Deduct quota → Return 200 immediately
5. **If status='generating'**: Return HTTP 202 with existing `generation_id` (quota already charged by first request)
6. **If not found**:
   - **Atomic operation**: Deduct quota + INSERT with status='generating' + Record in `explain_requests`
   - If INSERT succeeds → Worker picks up job, return 202 with new `generation_id`
   - If constraint violation → Another request started, return 202 with existing `generation_id`
7. Client polls `GET /api/ai/explain-page/status/:generation_id` every 2s (max 5 min)
8. **On failure**: Worker marks status='failed' + Auto-refund quota (via `explain_requests`)

**Benefits**:
- **Prevents duplicate generation**: DB unique constraint ensures only one generation per cache key
- **Non-blocking**: Server never blocks waiting for generation
- **Fair quota management**: Charge once per request, auto-refund on failure
- **Scalable**: DB-backed queue with `FOR UPDATE SKIP LOCKED` for worker coordination
- **Adaptive timeout**: Dynamic `expires_at` based on content complexity (images, chunks)

**4. Effective Mode Determination with Page-Level Metadata**

```sql
canonical_page_metadata
  ├─ pdf_hash, page (PK)
  ├─ has_images BOOLEAN
  ├─ images_count INT
  ├─ word_count INT (supports scanned page detection)
  ├─ is_scanned BOOLEAN (optional)
  ├─ updated_at
  └─ FK to canonical_documents (ON DELETE CASCADE)
```

**Purpose**:
- **Lightweight image detection**: Check if page has extractable embedded images (cheap operation, <100ms)
- **Determine effective_mode BEFORE cache lookup**:
  - `has_images=false` → `effective_mode='text_only'`
  - `has_images=true` → `effective_mode='with_images'`
- **Cache key includes effective_mode**: Ensures correct cache hits
- **Image analysis happens ONCE**: Store results in `shared_auto_stickers.image_summaries` (JSONB)
  - Base64 → GPT-4o vision analysis → Get image summaries (English, internal use)
  - Subsequent chunks only reference `image_summaries`, not raw base64

**Flow**:
```
Step 1: Check canonical_page_metadata for page_has_images
Step 2: If missing → Run lightweight detection → UPSERT metadata
Step 3: Determine effective_mode = has_images ? 'with_images' : 'text_only'
Step 4: Query cache with (pdf_hash, page, prompt_version, locale, effective_mode)
Step 5: Cache miss → Generate (if with_images, analyze images once and store in image_summaries)
```

**5. Quota Management with Auto-Refund**

```sql
explain_requests (quota ledger for audit and refund)
  ├─ request_id UUID (PK, same as generation_id)
  ├─ user_id
  ├─ pdf_hash, page, prompt_version, locale, effective_mode
  ├─ quota_units INT
  ├─ status: 'charged' | 'refunded'
  ├─ refund_reason TEXT
  ├─ created_at, refunded_at
  └─ FK to auth.users(id)
```

**Purpose**:
- **Billing transparency**: Immutable audit log for all quota charges
- **Auto-refund on failure**: When generation fails, mark status='refunded' and credit user
- **User didn't poll**: Quota already charged at 202 response (fair: server committed resources)
- **Prevents double-charge**: request_id is same as generation_id (idempotent)

**Quota Flow**:
```
1. API request → ensureQuota() → Fail fast 402 if insufficient
2. Cache hit → Deduct quota → Record in explain_requests (status='charged') → Return 200
3. Cache miss → Atomic: Deduct quota + INSERT job + Record explain_requests → Return 202
4. Worker generates → Success: status='ready' (quota already charged)
5. Worker fails → status='failed' + Auto-refund: explain_requests.status='refunded'
```

**6. User Opt-Out Mechanism**

```sql
user_preferences
  ├─ user_id (PK)
  ├─ share_to_cache BOOLEAN DEFAULT TRUE
```

**Behavior**:
- **Opt-in (default)**: Stickers stored in `shared_auto_stickers`, benefit from cache hits
- **Opt-out**: Stickers stored only in user-specific `stickers` table, no sharing
- **Quota policy**: Always deduct quota, even for cache hits (fair value exchange)

**UI Transparency** (post-MVP):
- Show "📦 Cached" indicator when returning cached stickers
- Tooltip: "This explanation was previously generated. Your quota is still deducted."

**7. Performance Monitoring with Latency Samples**

```sql
sticker_latency_samples (raw samples for P95 calculation)
  ├─ id UUID (PK)
  ├─ pdf_hash, page, locale, effective_mode
  ├─ latency_ms INT
  ├─ images_count INT (not just has_images boolean)
  ├─ chunks INT (text chunking count)
  ├─ cache_hit BOOLEAN (internal tracking, not exposed to users)
  ├─ created_at
```

**Purpose**:
- **Explain performance variance**: "Why was this page slow?" → Check images_count, chunks
- **Calculate P95 latency**: Hourly/daily aggregation using SQL `percentile_disc(0.95)`
- **Retention**: 14 days (sufficient for trending analysis)
- **Cost/performance correlation**: Link latency with content complexity

**Aggregation flow**:
```
1. Each request writes one row to sticker_latency_samples
2. Hourly aggregation job: Calculate P95 → Update sticker_metrics
3. Auto-cleanup: DELETE WHERE created_at < NOW() - INTERVAL '14 days'
```

**8. Reference Counting with Atomic Operations**

**File Upload Flow**:
```sql
-- Step 1: UPSERT canonical_documents
INSERT INTO canonical_documents (pdf_hash, reference_count, first_seen_at, last_reference_at)
VALUES ($hash, 0, NOW(), NOW())
ON CONFLICT (pdf_hash) DO UPDATE SET
  last_accessed_at = NOW(),
  last_reference_at = NOW();

-- Step 2: Idempotent INSERT ref edge
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

**File Delete Flow**:
```sql
WITH deleted AS (
  DELETE FROM canonical_document_refs
  WHERE ref_type = 'file' AND ref_id = $fileId
  RETURNING pdf_hash
)
UPDATE canonical_documents
SET reference_count = reference_count - 1
WHERE pdf_hash IN (SELECT pdf_hash FROM deleted);
```

**Benefits**:
- **Atomic operations**: No race conditions with concurrent uploads/deletes
- **Idempotent**: Running twice is safe (UNIQUE constraint on refs)
- **Auditable**: `canonical_document_refs` provides complete history

**9. Background Worker with Retry Strategy**

**Worker Configuration** (MVP):
- **Cron frequency**: Every 1 minute (triggered by Vercel Cron or external scheduler)
- **Batch size**: 10 jobs per run (via `SELECT ... LIMIT 10 FOR UPDATE SKIP LOCKED`)
- **Runtime budget**: ≤50 seconds (avoid platform timeout)
- **Job selection**: `WHERE status='generating' AND run_after <= NOW() AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '2 minutes')`

**Retry Strategy**:
- **Max attempts**: 3
- **Backoff**: Exponential with jitter
  - Attempt 1 fails → `run_after = NOW() + 1min + random(0-30s)`
  - Attempt 2 fails → `run_after = NOW() + 5min + random(0-30s)`
  - Attempt 3 fails → Mark as 'failed' + Auto-refund
- **Error classification** (determines retry eligibility):
  - **No retry** (immediate fail):
    - PDF content corrupted/unparseable (permanent)
    - Code assertion failure (schema incompatibility)
    - 404 errors (resource not found)
  - **Retry** (transient):
    - OpenAI 429 (rate limit)
    - OpenAI/Network 5xx, timeout
    - Database connection errors, lock conflicts

**Adaptive Timeout** (Dynamic `expires_at`):
```
expires_at = NOW() + min(300s, 60s + images_count*25s + chunks*15s)
```
- **Base**: 60 seconds (minimum)
- **Per image**: 25 seconds (base64 + GPT-4o vision)
- **Per chunk**: 15 seconds (text generation + merging)
- **Cap**: 300 seconds (5 minutes max)

**Zombie Cleanup** (integrated with worker):
- **Frequency**: Every 1 minute (same as worker cron)
- **Rule**: `UPDATE shared_auto_stickers SET status='failed', last_error='Generation timeout' WHERE status='generating' AND NOW() > expires_at`
- **Auto-refund**: Trigger refund for timed-out jobs

**10. Monitoring Dashboard for Cache Performance**

```sql
sticker_metrics
  ├─ metric_date, metric_hour
  ├─ pdf_hash, locale, mode (dimensions)
  ├─ cache_hits, cache_misses
  ├─ generations_started, completed, failed
  ├─ zombie_cleanups, refunds
  ├─ total_generation_time_ms, p95_generation_time_ms
  ├─ total_input_tokens, total_output_tokens
  └─ error_counts (JSONB)
```

**Dashboard** (`/admin/metrics`):
- Access control: Environment variable `ADMIN_EMAILS` allowlist (post-MVP: migrate to DB table)
- Yesterday's summary: Cache hits, generations, failures, avg latency, refund rate
- Cache performance by PDF/language/mode (hit rate charts)
- Generation latency p95 by mode (from sticker_latency_samples aggregation)
- Error analysis: Failure reasons by type, zombie frequency
- Reference counting health: Detect anomalies (negative counts)
- Quota refund tracking: Total refunds, refund rate

**No real-time alerts in MVP** (dashboard-only monitoring)

**11. Prompt Version Strategy**

**Purpose**: Invalidate cache when prompt templates or output structure changes

**Implementation**:
- **Define as server-side constant**: E.g., `const PROMPT_VERSION = "2026-01-11.1"` or semver
- **Bump rules** (explicit in code/docs):
  - Prompt template changed
  - Output structure modified (affects parsing)
  - Key strategy changed (chunking, merging, image analysis logic)
- **Cache behavior**:
  - Cache key includes `prompt_version`
  - New version → Automatic soft invalidation (cache miss for new requests)
  - Old version results remain in cache but unused
- **Post-MVP cleanup**: Periodic job to delete entries with old `prompt_version` (not in MVP scope)

**Example version evolution**:
```typescript
// Initial
const PROMPT_VERSION = "2026-01-11.1";

// After prompt improvement
const PROMPT_VERSION = "2026-01-15.1"; // All new requests miss cache

// After major refactor
const PROMPT_VERSION = "2.0.0"; // Semver for breaking changes
```

**Trade-off**: Bumping version creates cache misses, but ensures correctness. Document version changes in changelog.

## Changes Required

### 0. Database Schema Updates

**A. Canonical documents table**:
```sql
CREATE TABLE canonical_documents (
  pdf_hash VARCHAR(64) PRIMARY KEY,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  last_reference_at TIMESTAMPTZ DEFAULT NOW(),
  reference_count INTEGER DEFAULT 0,
  total_pages INTEGER,
  metadata JSONB
);

CREATE INDEX idx_canonical_last_accessed ON canonical_documents(last_accessed_at);
CREATE INDEX idx_canonical_ref_count ON canonical_documents(reference_count) WHERE reference_count = 0;
```

**B. Canonical document references table**:
```sql
CREATE TABLE canonical_document_refs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pdf_hash VARCHAR(64) NOT NULL,
  ref_type VARCHAR(20) NOT NULL DEFAULT 'file',
  ref_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_refs_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  UNIQUE(ref_type, ref_id)  -- Idempotency
);

CREATE INDEX idx_refs_lookup ON canonical_document_refs(pdf_hash);
CREATE INDEX idx_refs_reverse ON canonical_document_refs(ref_type, ref_id);
```

**C. Files table updates**:
```sql
ALTER TABLE files ADD COLUMN content_hash VARCHAR(64);

ALTER TABLE files ADD CONSTRAINT fk_files_canonical
  FOREIGN KEY (content_hash) REFERENCES canonical_documents(pdf_hash)
  ON DELETE SET NULL;

CREATE INDEX idx_files_content_hash ON files(content_hash);
```

**D. Shared auto-stickers table** (Result cache + Job queue):
```sql
CREATE TYPE sticker_status AS ENUM ('generating', 'ready', 'failed');

CREATE TABLE shared_auto_stickers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  prompt_version VARCHAR(20) NOT NULL DEFAULT '2026-01-11.1',
  locale VARCHAR(10) NOT NULL, -- 'en' | 'zh-Hans'
  effective_mode VARCHAR(20) NOT NULL, -- 'text_only' | 'with_images'

  -- Status and content
  status sticker_status NOT NULL DEFAULT 'generating',
  stickers JSONB, -- Main output (nullable until completed)
  image_summaries JSONB, -- Image analysis results (internal use)

  -- Job queue fields
  locked_at TIMESTAMPTZ,
  lock_owner TEXT, -- Worker instance ID
  attempts INTEGER DEFAULT 0,
  run_after TIMESTAMPTZ DEFAULT NOW(), -- Exponential backoff
  expires_at TIMESTAMPTZ, -- Dynamic deadline: 60s + 25s*images + 15s*chunks (max 300s)
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  chunk_plan JSONB, -- Optional: preserve chunking strategy for recovery

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  generation_time_ms INTEGER,

  CONSTRAINT fk_stickers_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  CONSTRAINT check_locale_format CHECK (locale ~ '^(en|zh-Hans)$'),
  CONSTRAINT check_mode_format CHECK (effective_mode IN ('text_only', 'with_images'))
);

CREATE UNIQUE INDEX unique_sticker_key
  ON shared_auto_stickers(pdf_hash, page, prompt_version, locale, effective_mode)
  WHERE status IN ('generating', 'ready');

CREATE INDEX idx_shared_stickers_lookup
  ON shared_auto_stickers(pdf_hash, page, locale, effective_mode)
  WHERE status = 'ready';

CREATE INDEX idx_shared_stickers_hash_status
  ON shared_auto_stickers(pdf_hash, status);

CREATE INDEX idx_failed_cleanup
  ON shared_auto_stickers(status, updated_at)
  WHERE status = 'failed';

CREATE INDEX idx_zombie_cleanup
  ON shared_auto_stickers(status, expires_at)
  WHERE status = 'generating'; -- Use expires_at for adaptive timeout

CREATE INDEX idx_worker_pickup
  ON shared_auto_stickers(status, run_after, locked_at)
  WHERE status = 'generating'; -- Worker job selection
```

**E. Canonical page metadata table**:
```sql
CREATE TABLE canonical_page_metadata (
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  has_images BOOLEAN NOT NULL,
  images_count INTEGER DEFAULT 0,
  word_count INTEGER,
  is_scanned BOOLEAN,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (pdf_hash, page),

  CONSTRAINT fk_page_meta_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE
);

CREATE INDEX idx_page_meta_lookup ON canonical_page_metadata(pdf_hash, page);
```

**F. Quota ledger table** (explain_requests):
```sql
CREATE TYPE request_status AS ENUM ('charged', 'refunded');

CREATE TABLE explain_requests (
  request_id UUID PRIMARY KEY, -- Same as generation_id from shared_auto_stickers
  user_id UUID NOT NULL,

  -- Request context
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  effective_mode VARCHAR(20) NOT NULL,

  -- Quota tracking
  quota_units INTEGER NOT NULL,
  status request_status NOT NULL DEFAULT 'charged',
  refund_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,

  CONSTRAINT fk_requests_user FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_requests_user ON explain_requests(user_id, created_at DESC);
CREATE INDEX idx_requests_status ON explain_requests(status, created_at);
CREATE INDEX idx_requests_refund ON explain_requests(status, refunded_at) WHERE status = 'refunded';
```

**G. Latency samples table**:
```sql
CREATE TABLE sticker_latency_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pdf_hash VARCHAR(64),
  page INTEGER,
  locale VARCHAR(10),
  effective_mode VARCHAR(20),

  -- Performance metrics
  latency_ms INTEGER NOT NULL,
  images_count INTEGER DEFAULT 0,
  chunks INTEGER DEFAULT 0,
  cache_hit BOOLEAN DEFAULT FALSE, -- Internal tracking only

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_latency_samples_date ON sticker_latency_samples(created_at DESC);
CREATE INDEX idx_latency_samples_aggregation ON sticker_latency_samples(effective_mode, created_at);
CREATE INDEX idx_latency_samples_cleanup ON sticker_latency_samples(created_at) WHERE created_at < NOW() - INTERVAL '14 days';
```

**H. User preferences table**:
```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  share_to_cache BOOLEAN DEFAULT TRUE, -- Opt-out mechanism
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_preferences_lookup ON user_preferences(user_id);
```

**I. Sticker metrics table**:
```sql
CREATE TABLE sticker_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_date DATE NOT NULL,
  metric_hour INTEGER NOT NULL, -- 0-23

  -- Dimensions
  pdf_hash VARCHAR(64),
  locale VARCHAR(10),
  mode VARCHAR(20),

  -- Metrics
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  generations_started INTEGER DEFAULT 0,
  generations_completed INTEGER DEFAULT 0,
  generations_failed INTEGER DEFAULT 0,
  zombie_cleanups INTEGER DEFAULT 0,
  refunds INTEGER DEFAULT 0, -- Quota refunds

  -- Latency (aggregated from sticker_latency_samples)
  total_generation_time_ms BIGINT DEFAULT 0,
  p95_generation_time_ms INTEGER,

  -- Token usage
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- Error tracking
  error_counts JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(metric_date, metric_hour, pdf_hash, locale, mode)
);

CREATE INDEX idx_metrics_date ON sticker_metrics(metric_date DESC, metric_hour DESC);
CREATE INDEX idx_metrics_pdf ON sticker_metrics(pdf_hash, metric_date);
CREATE INDEX idx_metrics_aggregation ON sticker_metrics(metric_date, metric_hour, created_at);
```

**Migration strategy** (MVP):
- Migration file: `002_cross_user_content_deduplication.sql`
- Create all tables in order:
  1. canonical_documents (base registry)
  2. canonical_document_refs (reference edges)
  3. canonical_page_metadata (page-level metadata)
  4. files.content_hash column + FK (nullable, for new uploads)
  5. shared_auto_stickers (cache + job queue)
  6. explain_requests (quota ledger)
  7. sticker_latency_samples (performance tracking)
  8. user_preferences (opt-out mechanism)
  9. sticker_metrics (aggregated metrics)
- **No backfill in MVP**: Existing files without content_hash work as-is (not participating in shared cache)
- **Post-MVP**: Optional backfill script for historical files (deferred)

### 1. PDF Content Hashing

- Create `src/lib/pdf/hash.ts` module:
  - `calculatePDFHash(pdfBuffer: Buffer)`: SHA-256 hash calculation
  - Use Node.js crypto module
  - Return hex string

### 2. Shared Cache Management

- Create `src/lib/stickers/shared-cache.ts` module:
  - `checkUserSharePreference(userId)`: Check opt-out status
  - `checkSharedCache(pdfHash, page, locale, mode)`: Query for stickers, returns `{status, stickers?, generationId?}`
  - `tryStartGeneration(pdfHash, page, locale, mode)`: Attempt INSERT with status='generating', returns `{started: boolean, generationId}`
  - `getGenerationStatus(generationId)`: Poll endpoint for clients
  - `completeGeneration(generationId, stickers)`: Update status to 'ready'
  - `failGeneration(generationId, error)`: Update status to 'failed'
  - Handle single-flight logic with DB unique constraint

### 3. File Upload Route Updates

- Update `src/app/api/courses/[courseId]/files/route.ts`:
  - Calculate content hash after uploading to storage
  - UPSERT to canonical_documents
  - INSERT to canonical_document_refs (idempotent)
  - Update reference_count atomically
  - Store hash in files.content_hash

### 4. API Route Updates for Cache Check

- Update `src/app/api/ai/explain-page/route.ts`:
  - Check user share preference (opt-out)
  - If opted out: Skip shared cache, use user-specific table
  - If opted in: Check shared cache before generation
    - status='ready' → Return immediately (deduct quota)
    - status='generating' → Return 202 with generationId
    - not found → Try start generation, return 202
  - On generation completion: Call completeGeneration()
  - On failure: Call failGeneration()

- Create `src/app/api/ai/explain-page/status/[generationId]/route.ts`:
  - GET endpoint returns: `{status, stickers?, error?}`
  - Client polls every 2s until status != 'generating'

### 5. Monitoring Dashboard

- Create `src/lib/monitoring/sticker-metrics.ts`:
  - `recordMetric(data)`: INSERT ... ON CONFLICT DO UPDATE to sticker_metrics
  - Aggregate: cache_hits, cache_misses, generations, latency, tokens, errors
  - `calculateP95Latency(metricId)`: Update p95_generation_time_ms

- Create `src/app/admin/metrics/page.tsx`:
  - Access control: Check user email against `ADMIN_EMAILS` env var
  - Display yesterday's summary (cache hits, generations, failures, latency)
  - Charts: Hit rate by PDF/language/mode, latency p95, error distribution
  - Reference counting health indicators

- Integrate metrics collection:
  - Update explain-page API route to call recordMetric() on each request

### 6. Backfill Task

- Create `src/scripts/backfill-content-hashes.ts`:
  - Query files WHERE content_hash IS NULL (batch of 100)
  - For each file:
    - Download PDF, calculate hash
    - UPSERT to canonical_documents
    - INSERT to canonical_document_refs (idempotent)
    - UPDATE files.content_hash
  - Progress logging every 10 files

- Add lazy補齐 in API layer:
  - If file.content_hash is NULL, calculate on-demand
  - Update canonical tables atomically

### 7. Cleanup Jobs

**A. Zombie cleanup** (every 5 min):
```sql
UPDATE shared_auto_stickers
SET status='failed', error_message='Generation timeout'
WHERE status='generating' AND updated_at < NOW() - INTERVAL '5 minutes';
```

**B. Failed records cleanup** (daily):
```sql
DELETE FROM shared_auto_stickers
WHERE status='failed' AND updated_at < NOW() - INTERVAL '30 days';
```

### 8. Documentation

- Update `docs/sticker-generation-logic.md`:
  - Add section on cross-user deduplication
  - Document shared cache behavior
  - Explain single-flight async pattern

- Update `docs/03_api_design.md`:
  - Document 202 async workflow
  - Document polling endpoint
  - Document opt-out mechanism

## Affected Components

**NEW Modules**:
- `src/lib/pdf/hash.ts` - PDF content hashing
- `src/lib/stickers/shared-cache.ts` - Shared cache with async single-flight
- `src/lib/monitoring/sticker-metrics.ts` - Metrics collection
- `src/app/api/ai/explain-page/status/[generationId]/route.ts` - Polling endpoint
- `src/app/admin/metrics/page.tsx` - Monitoring dashboard
- `src/scripts/backfill-content-hashes.ts` - Backfill job
- Database migrations for 7 new tables

**MODIFIED Modules**:
- `src/app/api/courses/[courseId]/files/route.ts` - Add hashing and canonical refs
- `src/app/api/ai/explain-page/route.ts` - Add cache check and async workflow
- `docs/sticker-generation-logic.md` - Documentation
- `docs/03_api_design.md` - API documentation

## Acceptance Criteria

### Cross-User Deduplication
- [ ] SHA-256 content hash calculated for all PDFs
- [ ] canonical_documents manages global PDF registry
- [ ] canonical_document_refs provides idempotent reference tracking
- [ ] Shared cache checked before generation (if user opted in)
- [ ] Single-flight logic prevents duplicate generation
- [ ] Status machine (generating/ready/failed) works correctly
- [ ] Concurrent requests receive 202 with same generationId
- [ ] Clients poll /status/:generationId endpoint every 2s
- [ ] Quota deducted even for cache hits

### User Opt-Out
- [ ] Users can disable sharing in settings (share_to_cache preference)
- [ ] Opted-out users skip shared cache entirely
- [ ] Opted-out users' stickers stored in user-specific table only

### Reference Counting
- [ ] Atomic operations via canonical_document_refs
- [ ] Idempotent INSERTs (UNIQUE constraint)
- [ ] reference_count accuracy verified
- [ ] No negative reference_count (monitoring alert)

### Monitoring Dashboard
- [ ] /admin/metrics page accessible to admins only (ADMIN_EMAILS)
- [ ] Yesterday's summary displayed correctly
- [ ] Cache performance by PDF/language/mode
- [ ] Generation latency p95 by mode
- [ ] Error analysis shows failure reasons
- [ ] Reference counting health monitoring

### Cleanup Jobs
- [ ] Zombie cleanup runs every 5 min (5 min timeout)
- [ ] Failed records cleanup daily (30-day retention)

### Compatibility
- [ ] Existing user-specific stickers remain functional
- [ ] No breaking changes to API response format (200 for ready, 202 for generating)
- [ ] Backfill completes successfully for existing files
- [ ] Lazy補齐 works for edge cases

## Risks & Mitigation

### Single-Flight DB Logic
- **Risk**: Unique constraint may cause lock contention
  - **Mitigation**: Async 202 responses (non-blocking), unique constraint is atomic

### Reference Counting
- **Risk**: Race conditions with concurrent uploads/deletes
  - **Mitigation**: Use canonical_document_refs with idempotent INSERTs, atomic CTE operations

### Quota for Cache Hits
- **Risk**: Users may be confused why they're charged for cached results
  - **Mitigation**: Transparency via cache indicator in UI (post-MVP), clear pricing documentation

### Monitoring
- **Risk**: Metrics collection adds write load
  - **Mitigation**: Aggregate hourly, use INSERT ... ON CONFLICT for upserts

## Testing Strategy

### Cross-User Deduplication
- Test SHA-256 hash calculation consistency
- Test shared cache lookup with effective_mode dimension
- Test single-flight generation (concurrent requests)
- Test unique constraint prevents duplicates
- Test status transitions (generating→ready, generating→failed)
- Test quota deduction for cache hits
- Test with same PDF uploaded by multiple users

### Reference Counting
- Test canonical_document_refs idempotent INSERTs
- Test reference_count accuracy with concurrent uploads/deletes
- Test no negative reference_count
- Test reference counting health monitoring

### Monitoring Dashboard
- Test admin access control (ADMIN_EMAILS allowlist)
- Test yesterday's summary displays correctly
- Test cache performance metrics by PDF/language/mode
- Test latency metrics, error analysis

### Cleanup Jobs
- Test zombie cleanup (5 min timeout)
- Test failed records cleanup (30-day retention)

### Compatibility
- Test backfill for existing files
- Test lazy補齐 in API layer
- Verify no breaking changes to API responses

## Related Changes
None - this is the foundational shared cache module

## Dependencies
- Existing dependencies: `openai`, `pdf-lib` (already in package.json)
- No new external dependencies required
- Database migrations required for 7 new tables
