# Changes Summary: OpenSpec Proposal Revision

**Date**: 2026-01-11
**Reviewer**: Claude Sonnet 4.5
**Status**: ✅ Updated and ready for implementation

---

## Executive Summary

The OpenSpec proposal has been **significantly simplified** for MVP while maintaining core value. Key changes:

- **Removed**: Multi-language translation layer (keeping only en, zh-Hans native)
- **Removed**: Automatic stale-while-revalidate refresh
- **Added**: Mode dimension (text_only vs with_images) for cost control
- **Added**: Revision tracking with manual regeneration
- **Added**: Reference edges pattern for atomic operations
- **Added**: Monitoring dashboard and audit logging
- **Added**: Frontend tasks (previously missing)

**Scope reduction**: From "Extra Large + Very High Complexity" to "Extra Large + Medium-High Complexity"

---

## ✅ Confirmed Decisions

### 1. **Language Support** (Simplified)
- ✅ **Keep**: English (en) and 简体中文 (zh-Hans) only
- ❌ **Remove**: Hindi (hi), translation layer, translation_cache table
- ✅ **Add**: Prefix matching for browser language detection (`zh*` → `zh-Hans`, `en*` → `en`)

**Rationale**: Validate bilingual demand before investing in translation infrastructure. Native generation provides higher quality than translation.

### 2. **Mode Dimension** (New Feature)
- ✅ **Add**: `mode` field to unique constraint: `(pdf_hash, page, prompt_version, locale, mode)`
- ✅ **Modes**: `text_only` (skip image extraction) | `with_images` (multimodal analysis)
- ✅ **Default**: `with_images` (maintain current behavior)

**Rationale**: Give users control over cost and performance. Text-only mode is faster and cheaper for text-heavy PDFs.

### 3. **Revision Tracking** (New Feature)
- ✅ **Add**: Revision mechanism (revision 1, 2, 3...)
- ✅ **Add**: `is_active`, `superseded_by`, `superseded_at` fields
- ✅ **Add**: Keep only最近 3 revisions (cleanup job)
- ❌ **Remove**: Stale-while-revalidate automatic refresh
- ❌ **Remove**: `sticker_refresh_queue` table

**Rationale**: Manual control is simpler for MVP. Users decide when to regenerate based on quality.

### 4. **Reference Edges** (Architecture Change)
- ✅ **Add**: `canonical_document_refs` table for idempotent operations
- ✅ **Add**: UNIQUE constraint on `(ref_type, ref_id)`
- ❌ **Remove**: PostgreSQL triggers for reference counting
- ✅ **Keep**: `canonical_documents` table but with explicit counting

**Rationale**: Avoid race conditions, provide audit trail, enable atomic operations.

### 5. **Monitoring & Audit** (New Features)
- ✅ **Add**: `sticker_metrics` table for cache performance tracking
- ✅ **Add**: `regenerate_audit_logs` table for regeneration tracking
- ✅ **Add**: `/admin/metrics` dashboard (Next.js + Recharts)
- ❌ **No real-time alerts** in MVP (dashboard only)

**Rationale**: Operational visibility without over-engineering. Alerts can be added post-MVP based on data.

### 6. **Frontend Work** (Previously Missing)
- ✅ **Add**: Task 15 - Handle 202 responses with polling
- ✅ **Add**: Regenerate button with reason selection
- ✅ **Add**: Cache hit indicator
- ✅ **Add**: Loading states during async generation

**Rationale**: Frontend updates were missing from original tasks but are essential for MVP.

### 7. **Cleanup Jobs** (Scope Reduced)
- ✅ **Keep**: Zombie cleanup (every 5 min, 2 min timeout)
- ✅ **Keep**: Failed records cleanup (daily, 30-day retention)
- ✅ **Add**: Old revisions cleanup (daily, keep最近 3)
- ❌ **Remove**: Translation cache cleanup (no translation)
- ❌ **Defer to Post-MVP**: Canonical GC (accept controlled growth)

**Rationale**: Focus on essential cleanup jobs. GC can wait until we understand reference patterns.

### 8. **Other Confirmations**
- ✅ **Model**: Stick with GPT-4o for all requests (no conditional model selection)
- ✅ **Zombie timeout**: 2 minutes is sufficient (no increase needed)
- ✅ **Backfill**: Yes, implement for existing files (Task 17)
- ✅ **Token limits**: Hard 2000 token limit with extractive summarization
- ✅ **Image summaries**: English-only, internal context (labels_from_image preserves mixed language)
- ✅ **GC**: MVP accepts canonical_documents growth, no automatic GC

---

## 🗑️ Removed from Original Proposal

### **Features**
1. ❌ **Multi-language translation layer** (Solution 5 in original proposal)
   - translation_cache table
   - file_user_settings table (file-level language override)
   - user_preferences.explanation_locale field (now: default_locale only)
   - Translation service module
   - Image summary translation
   - Languages beyond en and zh-Hans

2. ❌ **Stale-while-revalidate automatic refresh** (Part of Solution 4)
   - sticker_refresh_queue table
   - Background refresh worker
   - Rate limiting (200/hour, 2000/day)
   - Exponential backoff logic
   - shouldRefresh() and scheduleRefresh() functions

### **Tasks**
- ❌ **Task 8** (old): Create Multi-Language Support Infrastructure - **DELETED**
- ❌ **Task 14** (old): Update Sticker Retrieval for Locale Filtering - **Simplified**
- ❌ **Task 18** (old): Create Background Refresh Worker - **Replaced with Monitoring Dashboard**

### **Database Tables**
- ❌ `translation_cache`
- ❌ `file_user_settings`
- ❌ `sticker_refresh_queue`
- ❌ `user_preferences.explanation_locale` (changed to `default_locale` with CHECK constraint)

### **Modules**
- ❌ `src/lib/i18n/translation.ts`
- ❌ `src/lib/ai/translate-image-summary.ts`
- ❌ Background refresh worker script

---

## ✨ Added to Proposal

### **New Features**
1. ✅ **Mode dimension** (text_only vs with_images)
   - Cost control for users
   - Performance optimization
   - Flexibility for different use cases

2. ✅ **Revision tracking with manual regeneration**
   - User-initiated quality control
   - Audit trail for regenerations
   - Keep最近 3 revisions per unique key

3. ✅ **Reference edges pattern**
   - `canonical_document_refs` table
   - Idempotent operations via UNIQUE constraint
   - No race conditions

4. ✅ **Monitoring dashboard**
   - `sticker_metrics` table
   - `/admin/metrics` page (Next.js + Recharts)
   - Cache performance, latency, error tracking

5. ✅ **Audit logging**
   - `regenerate_audit_logs` table
   - Track: user, reason, quota, mode, model, tokens, status
   - Abuse detection and cost analysis

### **New Tasks**
- ✅ **Task 15**: Update Frontend for Async Workflow (MVP Required)
  - Handle 202 responses with polling
  - Regenerate button with reason selection
  - Cache hit indicator
  - Loading states

- ✅ **Task 16**: Add Monitoring and Metrics Dashboard
  - Metrics collection logic
  - Admin dashboard UI
  - Integration into API routes

- ✅ **Task 17**: Create Backfill Task for Existing Files
  - One-time job to calculate content_hash
  - Populate canonical tables
  - Lazy補齐 fallback

- ✅ **Task 8** (new): Create Bilingual Support Infrastructure (simplified)
  - Locale detection with prefix matching
  - Effective locale resolution
  - Validation for en and zh-Hans only

### **New Database Tables**
- ✅ `canonical_document_refs` (reference edges)
- ✅ `regenerate_audit_logs` (audit logging)
- ✅ `sticker_metrics` (monitoring)
- ✅ `user_preferences` (simplified, bilingual only)

### **New ADRs (Architecture Decision Records)**
- ✅ **ADR-009**: Mode Dimension (text_only vs with_images)
- ✅ **ADR-010**: Revision Tracking with Manual Regeneration
- ✅ **ADR-011**: Bilingual MVP (en, zh-Hans only)
- ✅ **ADR-012**: Reference Edges Pattern
- ✅ **ADR-013**: Monitoring Dashboard (no real-time alerts)
- ✅ **ADR-014**: Audit Logging for Regeneration
- ✅ **ADR-015**: Updated Cleanup Jobs for MVP Scope

---

## 🔄 Modified from Original Proposal

### **Database Schema**
1. **shared_auto_stickers table**:
   - **Added**: `mode VARCHAR(20) NOT NULL` (text_only | with_images)
   - **Added**: `revision INTEGER NOT NULL DEFAULT 1`
   - **Added**: `is_active BOOLEAN NOT NULL DEFAULT TRUE`
   - **Added**: `superseded_by UUID`
   - **Added**: `superseded_at TIMESTAMPTZ`
   - **Changed**: UNIQUE constraint now includes `mode`
   - **Added**: Partial UNIQUE INDEX `WHERE is_active = TRUE`
   - **Changed**: `locale` CHECK constraint: `^(en|zh-Hans)$` (was broader BCP-47)

2. **user_preferences table**:
   - **Changed**: `explanation_locale` → `default_locale`
   - **Changed**: Validation: `^(en|zh-Hans)$` only
   - **Removed**: File-level language overrides

3. **canonical_documents table**:
   - **Added**: `last_reference_at` field (distinct from `last_accessed_at`)

### **API Routes**
1. **explain-page/route.ts**:
   - **Added**: `mode` query parameter
   - **Added**: `force_regenerate` query parameter
   - **Added**: `reason` parameter (optional enum)
   - **Added**: Regenerate flow with audit logging
   - **Added**: Metrics collection on each request
   - **Changed**: Locale resolution (simplified to en/zh-Hans)
   - **Removed**: Translation logic

2. **New endpoints**:
   - **Added**: `GET /api/ai/explain-page/status/:generationId` (polling)
   - **Added**: `/admin/metrics` page

### **Cleanup Jobs**
- **Modified**: ADR-008 updated for MVP scope
- **Removed**: Translation cache cleanup (job #4)
- **Added**: Old revisions cleanup (keep最近 3)
- **Deferred**: Canonical GC (job #5) to post-MVP

---

## 📊 Complexity Impact

### **Before Revision**
- **Scope**: Extra Large
- **Complexity**: Very High
- **Tables**: 10 new tables (including translation_cache, sticker_refresh_queue, file_user_settings)
- **Background jobs**: 5 (zombie, failed, translation, refresh worker, canonical GC)
- **Languages**: 3 native + translation for others
- **Frontend**: Not explicitly planned

### **After Revision**
- **Scope**: Extra Large (unchanged)
- **Complexity**: Medium-High (reduced from Very High)
- **Tables**: 8 new tables (removed 2, added 2 new: canonical_document_refs, regenerate_audit_logs, sticker_metrics)
- **Background jobs**: 3 (zombie, failed, old revisions)
- **Languages**: 2 native only (en, zh-Hans)
- **Frontend**: Explicitly planned (Task 15)

**Net change**: **Simpler MVP** while adding essential features (monitoring, audit, revision tracking).

---

## 🎯 Key Benefits of Revision

### 1. **Reduced Complexity**
- No translation infrastructure (save ~30% of implementation time)
- No automatic refresh worker (save background job complexity)
- Simpler language support (2 native languages vs 3+translation)

### 2. **Better Quality Control**
- Revision tracking provides manual quality control
- Audit logging enables abuse detection
- Native generation > translation for quality

### 3. **Improved Monitoring**
- Dashboard provides operational visibility
- Metrics track cache performance, latency, errors
- Reference counting health monitoring

### 4. **Stronger Architecture**
- Reference edges eliminate race conditions
- Idempotent operations via UNIQUE constraints
- Explicit reference counting (no hidden triggers)

### 5. **Complete MVP**
- Frontend tasks explicitly planned
- Backfill strategy for existing files
- All essential features included

---

## 📋 Implementation Checklist (Updated)

### **Phase 1: Core Infrastructure** (Tasks 1-9)
- [x] Decision: Approved in review
- [ ] PDF image extraction module (mode-based)
- [ ] Database migrations (8 tables, mode dimension, revision fields)
- [ ] PDF structure parsing (2-tier with confidence)
- [ ] PDF context builder (hard token limits)
- [ ] Image summary generation (English-only)
- [ ] PDF content hashing
- [ ] Shared cache with async + revision tracking
- [ ] Bilingual support infrastructure (en, zh-Hans)
- [ ] OpenAI model upgrade to GPT-4o

### **Phase 2: API & Prompt Updates** (Tasks 10-14)
- [ ] AI prompt logic (bilingual + mode-aware)
- [ ] File upload route (hashing + canonical refs + structure)
- [ ] Explain-page API route (async + regenerate + mode)
- [ ] Response parser (1-8 stickers)
- [ ] Sticker retrieval (locale filtering, active revisions only)

### **Phase 3: Frontend & Monitoring** (Tasks 15-17)
- [ ] Frontend async workflow (202 polling, regenerate, cache indicator)
- [ ] Monitoring dashboard (metrics collection + admin UI)
- [ ] Backfill task (one-time + lazy補齐)

### **Phase 4: Maintenance & Testing** (Tasks 18-21)
- [ ] Cleanup jobs (zombie, failed, old revisions)
- [ ] Documentation updates
- [ ] Integration testing (all scenarios)
- [ ] Final verification

---

## 🚀 Next Steps

1. **Review this summary** with stakeholders
2. **Confirm all decisions** are aligned with business requirements
3. **Begin implementation** following tasks.md order
4. **Track progress** using the task checklist in tasks.md

---

## 📚 Related Documents

- **[proposal.md](./proposal.md)** - Full feature specification (updated)
- **[tasks.md](./tasks.md)** - Implementation task breakdown (updated)
- **[architecture.md](./architecture.md)** - Architecture Decision Records (15 ADRs)

---

## ❓ Open Questions (None - All Clarified)

All questions from the code review have been answered and decisions documented. The proposal is ready for implementation.

---

**Generated by**: Claude Sonnet 4.5
**Review Date**: 2026-01-11
**Status**: ✅ Ready for Implementation
