# Architecture Decision Records (ADR)

## Overview
This document records key architectural decisions made for the "Update Sticker Word Count Logic" feature, based on user feedback and technical review.

---

## ADR-001: Optional Image Extraction (No Mandatory Page Rendering)

**Status**: Accepted

**Context**:
- Original proposal required rendering every PDF page as an image if embedded images couldn't be extracted
- This would add 1-3s latency per page and significantly increase API costs for text-only pages
- Many educational PDFs are text-heavy without meaningful images

**Decision**:
Only extract embedded images from PDFs. If no embedded images are found, return an empty array and proceed with text-only processing. Do not render pages as images.

**Rationale**:
1. **Performance**: Eliminates 1-3s page rendering overhead for text-only pages
2. **Cost control**: Text-only pages don't incur GPT-4o vision costs
3. **Graceful degradation**: Scanned PDFs without extractable images are processed as text-only
4. **User experience**: Faster response times for majority of pages

**Consequences**:
- **Positive**: Much faster for text-only pages, lower costs, simpler implementation
- **Negative**: Scanned PDFs and image-only pages won't have image analysis
- **Mitigation**: Future enhancement could add optional page rendering as user preference

**Alternatives Considered**:
- Mandatory page rendering (rejected due to cost/performance)
- Conditional rendering based on word count (added complexity)
- User opt-in for page rendering (deferred to post-MVP)

---

## ADR-002: Canonical Documents Layer (No Hard FK from Shared Assets to User Files)

**Status**: Accepted

**Context**:
- Original design had `shared_auto_stickers.pdf_hash` potentially referencing `files.content_hash` directly
- Problem: `files` table contains user-specific instances, while shared assets are global
- When a user deletes their file, should not cascade delete global shared stickers
- Need reference counting and garbage collection for shared assets

**Decision**:
Introduce `canonical_documents` table as intermediary layer:
- `canonical_documents.pdf_hash` (PK) - global PDF registry
- `files.content_hash` → FK to `canonical_documents.pdf_hash` (ON DELETE SET NULL)
- `shared_auto_stickers.pdf_hash` → FK to `canonical_documents.pdf_hash` (ON DELETE CASCADE)
- Use PostgreSQL triggers to maintain `canonical_documents.reference_count`
- GC job deletes `canonical_documents` when `reference_count=0` AND `last_accessed_at > 180 days`

**Rationale**:
1. **Separation of concerns**: User files vs. global assets are properly isolated
2. **Reference counting**: Automatic tracking via triggers
3. **Controlled GC**: Explicit cleanup policy with safety checks
4. **Cascade deletes**: When canonical document is GC'd, all associated shared assets are cleaned up

**Consequences**:
- **Positive**: Clean architecture, prevents accidental deletion of shared assets, enables GC
- **Negative**: Additional table and complexity, requires careful trigger testing
- **Monitoring**: Need to track reference_count accuracy and GC effectiveness

**Alternatives Considered**:
- Direct FK from shared_* to files (rejected - tight coupling, cascade issues)
- No FK at all (rejected - orphaned records, harder to maintain)
- Manual reference counting (rejected - error-prone, race conditions)

---

## ADR-003: Async Single-Flight with 202 Response (No Blocking Server-Side Wait)

**Status**: Accepted

**Context**:
- Original design had server-side polling/waiting for in-progress generations
- Problem: Long-running requests occupy server connections, threads, and resources
- Concurrent requests for same page would all wait, causing connection pool exhaustion

**Decision**:
Implement async non-blocking single-flight pattern:
1. When generation is in progress, return `HTTP 202 Accepted` with `generation_id`
2. Client polls `GET /api/ai/explain-page/status/:generation_id` every 2s
3. Server never blocks waiting for generation to complete
4. Optional SSE endpoint for real-time updates

**Rationale**:
1. **Scalability**: Server doesn't hold connections open for long-running operations
2. **Resource efficiency**: No thread/connection pool exhaustion
3. **Better UX**: Client can show progress, cancel requests, etc.
4. **Standard pattern**: Aligns with HTTP best practices for async operations

**Consequences**:
- **Positive**: Much better scalability, no connection exhaustion, cleaner architecture
- **Negative**: Requires client-side polling logic, slightly more complex client code
- **Required**: Update client to handle 202 responses and polling workflow

**Alternatives Considered**:
- Server-side blocking with timeout (rejected - scalability issues)
- WebSockets for all requests (rejected - overkill, infrastructure complexity)
- Long-polling with keep-alive (rejected - still ties up connections)

**Implementation Details**:
```typescript
// Client-side polling example
async function waitForGeneration(generationId: string) {
  while (true) {
    const res = await fetch(`/api/ai/explain-page/status/${generationId}`);
    const data = await res.json();

    if (data.status === 'ready') return data.stickers;
    if (data.status === 'failed') throw new Error(data.error);

    await sleep(2000); // Poll every 2s
  }
}
```

---

## ADR-004: User Opt-Out Mechanism (share_to_cache Preference)

**Status**: Accepted

**Context**:
- Original design had mandatory shared cache participation
- User feedback: Some users want privacy/control over their data contribution
- Quota still deducted for cache hits (fair value exchange)

**Decision**:
Add `user_preferences.share_to_cache` boolean (default: TRUE):
- When `TRUE`: Stickers stored in `shared_auto_stickers`, benefit from cache
- When `FALSE`: Stickers stored only in user-specific `stickers` table, no sharing
- Quota deducted in both cases

**Rationale**:
1. **User control**: Respects privacy preferences
2. **Transparency**: Users know they're contributing to shared cache
3. **Fair quota**: Still pay for value received
4. **Default opt-in**: Most users benefit from faster results

**Consequences**:
- **Positive**: Better user trust, compliance with privacy expectations
- **Negative**: Slightly reduced cache hit rate for opted-out users
- **UI change**: Need settings toggle with clear explanation

**Alternatives Considered**:
- No opt-out (rejected - user feedback against mandatory sharing)
- Free cache hits for opt-in users (rejected - unfair pricing, complex billing)
- Opt-out reduces quota cost (rejected - misaligned incentives)

---

## ADR-005: Two-Tier PDF Structure Parsing (Bookmarks → Regex, Skip Layout Inference)

**Status**: Accepted

**Context**:
- Original design had 3-tier fallback: Bookmarks → Regex → Layout inference
- Layout-based inference (font size, bold detection) is fragile and unreliable
- Scanned PDFs would waste processing time on failed structure parsing

**Decision**:
Simplify to 2-tier with confidence scoring:
1. **Primary**: Extract bookmarks/outline (confidence='high')
2. **Fallback**: Regex pattern matching for "Chapter N:", "Section N.M:" (confidence='medium')
3. **Scanned PDF detection**: Auto-detect and skip parsing entirely
4. **Failure**: Return confidence='low', structure_data=null, use sliding window

**Rationale**:
1. **Reliability**: Bookmarks and regex are deterministic, layout inference is not
2. **Performance**: Skip expensive layout analysis that often fails
3. **Scanned PDF handling**: Don't waste time on unparseable documents
4. **Confidence scoring**: Downstream logic can adapt based on confidence

**Consequences**:
- **Positive**: Faster, more reliable, cleaner code
- **Negative**: Fewer PDFs will have structure data (acceptable trade-off)
- **Monitoring**: Track confidence distribution to understand success rate

**Alternatives Considered**:
- Keep 3-tier fallback (rejected - layout inference too fragile)
- Only use bookmarks (rejected - misses many PDFs with regex-parseable titles)
- ML-based structure detection (rejected - overkill for MVP, high latency)

---

## ADR-006: Hard Token Limits with Priority-Based Allocation (Context Building)

**Status**: Accepted

**Context**:
- Original design had 2000 token "limit" but unclear overflow handling
- Concern: Multi-tier context (section + chapter + glossary) might exceed limit
- Need deterministic behavior when context is too large

**Decision**:
Implement hard 2000 token limit with priority-based budget allocation:
1. **Priority 1**: Current page (up to 1500 tokens, always full)
2. **Priority 2**: Section summary (up to 1000 tokens, compressed via TF-IDF)
3. **Priority 3**: Chapter summary (up to 500 tokens)
4. **Priority 4**: Glossary (up to 300 tokens)
5. **Priority 5**: Image summaries (remaining budget)
6. **Overflow**: Truncate from lowest priority upward

**Rationale**:
1. **Deterministic**: Always know what fits, no surprises
2. **Quality**: Current page always gets full text, context is compressed
3. **Extractive summarization**: Use TF-IDF to select top-N sentences, not raw text
4. **Performance**: Pre-compute token budgets, fail fast on overflow

**Consequences**:
- **Positive**: Predictable behavior, prevents token overflow errors
- **Negative**: May lose some context in very long sections
- **Required**: Implement TF-IDF extractive summarization library

**Alternatives Considered**:
- Dynamic allocation (rejected - unpredictable, complex)
- Raise limit to 4000 tokens (rejected - API cost increase, slower)
- Compress everything equally (rejected - loses important current page detail)

**Implementation Details**:
```typescript
function buildContext(page, structure) {
  let budget = 2000;

  // Priority 1: Current page (up to 1500)
  const currentPage = extractText(page).slice(0, 1500);
  budget -= currentPage.tokenCount;

  // Priority 2: Section summary (up to 1000, compressed)
  const sectionSummary = extractiveSummarize(sectionText, Math.min(budget, 1000));
  budget -= sectionSummary.tokenCount;

  // ... continue with lower priorities
}
```

---

## ADR-007: Database Constraints and Type Safety (Enums, FK Validation, Locale Checks)

**Status**: Accepted

**Context**:
- Original schema lacked explicit enums, FK constraints, and validation
- Risk of data integrity issues (orphaned records, invalid status values, malformed locales)

**Decision**:
Add comprehensive database constraints:
1. **Status enum**: `CREATE TYPE sticker_status AS ENUM ('generating', 'ready', 'failed')`
2. **FK constraints**: All `pdf_hash` references go through `canonical_documents` with CASCADE
3. **Locale validation**: Regex check `^[a-z]{2,3}(-[A-Za-z0-9-]+)?$` for BCP-47 compliance
4. **Indexes**: Add partial indexes for cleanup queries (e.g., `WHERE status='failed'`)
5. **Triggers**: Reference counting for `canonical_documents`

**Rationale**:
1. **Data integrity**: Prevent invalid states at database level
2. **Performance**: Partial indexes optimize cleanup queries
3. **Type safety**: Enums prevent typos, enforce valid values
4. **Auditability**: FK constraints maintain referential integrity

**Consequences**:
- **Positive**: Much stronger data integrity, easier debugging
- **Negative**: Migration complexity, must handle enum changes carefully
- **Required**: Test all constraints thoroughly before production

**Alternatives Considered**:
- Application-level validation only (rejected - easy to bypass, no database enforcement)
- Looser locale validation (rejected - allows invalid BCP-47 codes)
- No enums (rejected - stringly-typed status values are error-prone)

---

## ADR-008: TTL and Cleanup Strategy (5 Cleanup Jobs for Database Health)

**Status**: Accepted

**Context**:
- Long-running system will accumulate stale data (failed generations, old translations, unreferenced PDFs)
- No cleanup strategy means unbounded database growth

**Decision**:
Implement 5 cleanup jobs with different schedules:
1. **Zombie generations** (every 5min): Mark stuck generations as failed after 2 minutes
2. **Failed records** (daily): Delete failed generations after 30 days (keep for debugging)
3. **Translation cache** (weekly): Delete translations not accessed in 90 days with <5 access_count
4. **Stale stickers** (monthly): Archive/delete stickers not accessed in 180 days
5. **Canonical GC** (weekly): Delete unreferenced PDFs (reference_count=0) after 180 days

**Rationale**:
1. **Zombie cleanup**: Prevent stuck generations from blocking forever
2. **Failed records**: Keep for debugging, but don't grow unbounded
3. **Translation cache**: Purge low-value entries, keep frequently used
4. **Stale stickers**: Balance between cache hits and storage cost
5. **Canonical GC**: Remove orphaned PDFs, cascade to shared assets

**Consequences**:
- **Positive**: Database stays healthy, storage costs controlled
- **Negative**: Requires monitoring, may delete useful data if too aggressive
- **Required**: Deploy as cron jobs or scheduled tasks, add metrics

**Alternatives Considered**:
- Manual cleanup (rejected - too error-prone, scales poorly)
- Shorter TTLs (rejected - higher miss rate, more regenerations)
- Longer TTLs (rejected - excessive storage costs)

**Implementation Details**:
```sql
-- Example: Zombie cleanup (runs every 5min)
UPDATE shared_auto_stickers
SET status='failed', error_message='Generation timeout'
WHERE status='generating' AND updated_at < NOW() - INTERVAL '2 minutes';
```

---

## ADR-009: Mode Dimension (text_only vs with_images)

**Status**: Accepted

**Context**:
- Not all users want image analysis for every page (higher cost, longer latency)
- Some PDFs have no meaningful images (pure text, scanned without extractable images)
- Need flexible control over when to use GPT-4o vision capabilities

**Decision**:
Add `mode` dimension to sticker generation:
- **text_only**: Skip image extraction entirely, generate pure text-based stickers
- **with_images**: Attempt to extract embedded images and perform multimodal analysis
- Mode included in unique constraint: `(pdf_hash, page, prompt_version, locale, mode)`
- Default mode: `with_images` (maintain current behavior)

**Rationale**:
1. **Cost control**: Users can choose text_only to reduce API costs
2. **Performance**: text_only mode is faster (no image extraction/analysis)
3. **Flexibility**: Support different use cases (quick review vs deep analysis)
4. **Future-proof**: Mode dimension allows other variants (e.g., audio_enhanced, formula_focused)

**Consequences**:
- **Positive**: Better cost control, faster processing for text-only pages
- **Negative**: Increased unique constraint complexity, need UI toggle
- **Required**: Frontend mode selector, API parameter validation

**Alternatives Considered**:
- Auto-detect image presence (rejected - users want explicit control)
- Separate endpoint for text-only (rejected - code duplication)
- Always use with_images (rejected - unnecessary cost for text-heavy PDFs)

---

## ADR-010: Revision Tracking with Manual Regeneration (No Automatic Refresh)

**Status**: Accepted

**Context**:
- Original design had automatic stale-while-revalidate refresh (background refresh after 14 days)
- Adds significant complexity: refresh queue, rate limiting, exponential backoff
- MVP should focus on core value: users control when to regenerate

**Decision**:
Remove automatic refresh, add revision tracking with manual regeneration:
1. **Manual regeneration only**: Users click "🔄 Regenerate" button
2. **Revision mechanism**:
   - Each regeneration creates new `revision` (1, 2, 3, ...)
   - Old revisions marked `is_active=FALSE`, `superseded_by=<new_id>`
   - Keep只最近 3 revisions (cleanup job deletes older)
3. **prompt_version vs revision**:
   - `prompt_version`: System version (v1, v2) - changes when we upgrade prompts/model
   - `revision`: User-initiated regeneration counter within same prompt_version
4. **Audit logging**: Every regeneration logged to `regenerate_audit_logs`

**Rationale**:
1. **MVP simplicity**: Remove background worker, refresh queue, rate limiting
2. **User control**: Users decide when quality is unsatisfactory
3. **Auditability**: Track regeneration patterns and reasons
4. **Cost transparency**: Users explicitly trigger quota deduction
5. **Iterative improvement**: Can add auto-refresh post-MVP based on data

**Consequences**:
- **Positive**: Much simpler MVP, clearer user control, better auditability
- **Negative**: Stale cache doesn't auto-refresh (acceptable trade-off)
- **Required**: Frontend regenerate button, audit logging, revision cleanup job
- **Post-MVP**: Analyze regeneration data to decide if auto-refresh is valuable

**Alternatives Considered**:
- Keep stale-while-revalidate (rejected - too complex for MVP)
- No versioning (rejected - can't track quality improvements over time)
- Overwrite old version (rejected - lose audit trail)

---

## ADR-011: Bilingual MVP (English + 简体中文 Only, No Translation Layer)

**Status**: Accepted

**Context**:
- Original design had 3 native languages (en, zh-Hans, hi) + translation layer for others
- Translation adds complexity: translation_cache, quality controls, technical term preservation
- MVP should validate bilingual demand before expanding

**Decision**:
Simplify to bilingual MVP with native generation only:
1. **Two native languages**: English (`en`) and 简体中文 (`zh-Hans`)
2. **No translation layer**: Each language generates fresh explanations natively
3. **Locale detection**:
   - Prefix matching on Accept-Language: `zh*` → `zh-Hans`, `en*` → `en`, others → `en`
   - User default setting: `user_preferences.default_locale`
   - Single-request override: API `locale` query param
4. **Validation**: `CHECK (locale ~ '^(en|zh-Hans)$')` at database level

**Rationale**:
1. **MVP focus**: Validate bilingual demand before investing in translation infrastructure
2. **Quality**: Native generation is better than translated content
3. **Simplicity**: Remove translation_cache, file_user_settings, multi-language complexity
4. **Cost double**: Acceptable trade-off for quality (cache reduces redundancy)
5. **Post-MVP expansion**: Add translation layer for other languages based on demand

**Consequences**:
- **Positive**: Simpler MVP, higher quality for supported languages
- **Negative**: Limited to 2 languages (acceptable for MVP)
- **Required**: Frontend language selector, locale validation
- **Post-MVP**: Add Hindi native + translation for other languages

**Alternatives Considered**:
- Keep 3 native + translation (rejected - too complex for MVP)
- English only (rejected - Chinese demand is high)
- Add Hindi to MVP (rejected - focus on top 2 first)

---

## ADR-012: Reference Edges Pattern (canonical_document_refs for Idempotent Operations)

**Status**: Accepted

**Context**:
- Original design used PostgreSQL triggers to increment/decrement reference_count
- Concern: Triggers may have race conditions during concurrent file uploads/deletes
- Need atomic operations for reference counting

**Decision**:
Introduce `canonical_document_refs` table as reference edges:
1. **Separate refs table**:
   ```sql
   CREATE TABLE canonical_document_refs (
     id UUID PRIMARY KEY,
     pdf_hash VARCHAR(64) NOT NULL,
     ref_type VARCHAR(20) NOT NULL DEFAULT 'file',
     ref_id UUID NOT NULL, -- file_id
     UNIQUE(ref_type, ref_id)  -- Idempotency
   );
   ```
2. **File upload flow**:
   - UPSERT to `canonical_documents`
   - INSERT to `canonical_document_refs` (idempotent via UNIQUE constraint)
   - Calculate `reference_count` as `COUNT(*) FROM canonical_document_refs`
3. **File delete flow**:
   - DELETE FROM `canonical_document_refs`
   - Recalculate `reference_count`
4. **No triggers**: Explicit reference counting

**Rationale**:
1. **Atomic operations**: UNIQUE constraint ensures idempotency (no double-counting)
2. **Auditability**: Refs table provides complete history of references
3. **No race conditions**: INSERT ... ON CONFLICT DO NOTHING is atomic
4. **Explicit**: No hidden trigger logic, easier to debug
5. **Future-proof**: Can add other ref_types (e.g., 'shared_workspace', 'template')

**Consequences**:
- **Positive**: More reliable, auditable, no race conditions
- **Negative**: Extra table, slightly more complex upload flow
- **Required**: Backfill job to populate refs for existing files
- **Monitoring**: Track reference_count health (detect anomalies)

**Alternatives Considered**:
- Keep PostgreSQL triggers (rejected - race condition risk)
- No reference counting (rejected - can't safely GC canonical_documents)
- Application-level locking (rejected - doesn't scale across instances)

---

## ADR-013: Monitoring Dashboard (Database-Backed Metrics, No Real-Time Alerts)

**Status**: Accepted

**Context**:
- Need visibility into cache performance, generation latency, error rates
- Real-time monitoring (email/Slack alerts) adds infrastructure complexity
- MVP needs operational visibility without over-engineering

**Decision**:
Implement database-backed monitoring dashboard:
1. **Metrics collection**:
   - Store in `sticker_metrics` table (hourly aggregation)
   - Dimensions: metric_date, metric_hour, pdf_hash, locale, mode
   - Metrics: cache_hits, cache_misses, generations, latency, tokens, errors
2. **Admin dashboard** (`/admin/metrics`):
   - Built with Next.js + Recharts
   - Access control: Environment variable allowlist or `is_admin` flag
   - Yesterday's summary, cache performance, latency trends, error analysis
3. **No real-time alerts**:
   - Dashboard-only monitoring for MVP
   - Manual review of daily summaries
   - Post-MVP: Add alerts for zombie spike (>10/hour) and reference_count anomalies

**Rationale**:
1. **MVP simplicity**: No email service, Slack integration, or alerting infrastructure
2. **Operational visibility**: Still get all necessary metrics for debugging and optimization
3. **Cost-effective**: Database-backed storage, no third-party monitoring tools
4. **Iterative**: Can add alerts post-MVP based on which metrics matter most

**Consequences**:
- **Positive**: Simple, self-contained, all metrics in one place
- **Negative**: No proactive alerts (must check dashboard)
- **Required**: Metrics collection in API layer, admin dashboard UI
- **Post-MVP**: Add alerting for critical metrics (zombie frequency, error spike)

**Alternatives Considered**:
- Third-party monitoring (Datadog, Grafana) (rejected - overkill for MVP, external dependency)
- Real-time alerts in MVP (rejected - adds email service, Slack integration complexity)
- No monitoring (rejected - flying blind is unacceptable)

---

## ADR-014: Audit Logging for Manual Regeneration

**Status**: Accepted

**Context**:
- Manual regeneration can be abused (users repeatedly regenerating to fish for better results)
- Need to track regeneration patterns for cost analysis and quota abuse detection
- Understand why users regenerate (quality issues, outdated content, etc.)

**Decision**:
Implement comprehensive audit logging for regeneration:
1. **regenerate_audit_logs table**:
   - Basic: user_id, pdf_hash, page, locale, prompt_version, mode
   - Audit: reason (enum), quota_deducted, cache_hit, generation_time_ms
   - Cost: model_used, input_tokens, output_tokens
   - Status: status (success/failed), error_code
   - Revision: old_revision_id, new_revision_id
2. **Optional reason enum**:
   - `quality_not_good`, `outdated`, `test`, `other`, NULL
   - User selects from dropdown (not required)
3. **Cost analysis**:
   - Track total tokens consumed per user
   - Identify heavy regenerators for quota monitoring

**Rationale**:
1. **Abuse detection**: Identify users regenerating excessively
2. **Product insight**: Understand why regeneration happens (quality vs outdated vs test)
3. **Cost attribution**: Know exact token costs for regenerations
4. **Compliance**: Audit trail for quota disputes
5. **Quality feedback**: If many users regenerate for "quality_not_good", improve prompts

**Consequences**:
- **Positive**: Full visibility into regeneration behavior, better cost tracking
- **Negative**: Another table to maintain, slightly more complex regenerate flow
- **Required**: Frontend reason selector, audit logging in API
- **Monitoring**: Track regeneration rate, reasons distribution

**Alternatives Considered**:
- No audit logging (rejected - can't detect abuse or analyze patterns)
- Mandatory reason (rejected - friction for users, many would pick "other")
- Free text reason (rejected - hard to analyze, users won't fill it)

---

## ADR-015: Update ADR-008 Cleanup Jobs for MVP Scope

**Status**: Accepted - **UPDATE to ADR-008**

**Context**:
- Original ADR-008 included 5 cleanup jobs, including translation_cache and canonical_documents GC
- MVP scope changed: No translation layer, GC deferred to post-MVP

**Decision**:
Update cleanup jobs to MVP scope:
1. **Zombie cleanup** (every 5min): Mark stuck generations as failed after 2 minutes ✅ KEEP
2. **Failed records** (daily): DELETE failed records after 30 days ✅ KEEP
3. **Old revisions cleanup** (daily): Keep only最近 3 revisions per (pdf_hash, page, prompt_version, locale, mode) ✅ NEW
4. **Translation cache cleanup** (weekly): ❌ REMOVE - No translation in MVP
5. **Canonical GC** (weekly): ❌ DEFER to post-MVP - Accept controlled growth for MVP

**Rationale**:
1. **Zombie cleanup**: Essential to prevent stuck generations
2. **Failed records**: Needed for debugging, 30-day retention is reasonable
3. **Old revisions**: New requirement from revision tracking feature
4. **Translation cache**: Not applicable (no translation layer)
5. **Canonical GC**: MVP can accept growth, defer GC to post-MVP when we understand reference patterns

**Consequences**:
- **Positive**: Simpler MVP (3 cleanup jobs instead of 5)
- **Negative**: `canonical_documents` will grow unbounded in MVP (acceptable for limited user base)
- **Required**: Implement old revisions cleanup job
- **Monitoring**: Track canonical_documents growth rate
- **Post-MVP**: Implement canonical GC when database size becomes a concern

**Alternatives Considered**:
- Keep all 5 jobs (rejected - translation cache not needed, GC can wait)
- No old revisions cleanup (rejected - unbounded growth per page)
- Immediate canonical GC (rejected - over-engineering for MVP)

---

## Summary of Key Decisions

| ADR | Decision | Impact | Status |
|-----|----------|--------|--------|
| 001 | Optional image extraction (no page rendering) | **High** - Major cost/performance improvement | ✅ MVP |
| 002 | Canonical documents layer | **High** - Cleaner architecture, enables GC | ✅ MVP |
| 003 | Async 202 responses (no blocking) | **High** - Much better scalability | ✅ MVP |
| 004 | User opt-out mechanism | **Medium** - Better privacy, slightly lower cache hit rate | ✅ MVP |
| 005 | Two-tier structure parsing | **Medium** - Simpler, more reliable | ✅ MVP |
| 006 | Hard token limits with priorities | **Medium** - Predictable, prevents overflow | ✅ MVP |
| 007 | Database constraints and enums | **Medium** - Stronger data integrity | ✅ MVP |
| 008 | TTL and cleanup jobs (updated) | **High** - Essential for long-term health | ✅ MVP (3 jobs) |
| 009 | Mode dimension (text_only vs with_images) | **High** - Cost control, performance | ✅ MVP |
| 010 | Revision tracking + manual regeneration | **High** - User control, simpler MVP | ✅ MVP |
| 011 | Bilingual MVP (en, zh-Hans only) | **High** - Simpler, higher quality | ✅ MVP |
| 012 | Reference edges pattern | **Medium** - More reliable reference counting | ✅ MVP |
| 013 | Monitoring dashboard (no alerts) | **Medium** - Operational visibility | ✅ MVP |
| 014 | Audit logging for regeneration | **Medium** - Abuse detection, cost analysis | ✅ MVP |
| 015 | Updated cleanup jobs (MVP scope) | **Medium** - Aligned with MVP features | ✅ MVP |

---

## Related Documents
- [proposal.md](./proposal.md) - Full feature specification
- [tasks.md](./tasks.md) - Implementation task breakdown
