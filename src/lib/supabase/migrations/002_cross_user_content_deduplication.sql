-- Migration: 002_cross_user_content_deduplication.sql
-- Cross-User Content Deduplication with Shared Cache
-- This migration creates infrastructure for:
--   1. Canonical documents layer (global PDF registry)
--   2. Shared auto-stickers cache with DB-backed job queue
--   3. Quota ledger with auto-refund on failure
--   4. Performance monitoring and metrics

-- ==================== ENUMS ====================

-- Status for shared sticker generation jobs
CREATE TYPE sticker_status AS ENUM ('generating', 'ready', 'failed');

-- Status for quota requests (for refund tracking)
CREATE TYPE request_status AS ENUM ('charged', 'refunded');

-- ==================== CANONICAL DOCUMENTS ====================
-- Global PDF registry - separates global assets from user-specific file instances

CREATE TABLE canonical_documents (
  pdf_hash VARCHAR(64) PRIMARY KEY,
  first_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_reference_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reference_count INTEGER DEFAULT 0 NOT NULL,
  total_pages INTEGER,
  metadata JSONB,

  CONSTRAINT check_reference_count_non_negative CHECK (reference_count >= 0)
);

COMMENT ON TABLE canonical_documents IS 'Global PDF registry for cross-user deduplication. Each unique PDF content has one entry.';
COMMENT ON COLUMN canonical_documents.pdf_hash IS 'SHA-256 hash of PDF binary content';
COMMENT ON COLUMN canonical_documents.reference_count IS 'Number of user files referencing this canonical document';

-- Indexes for canonical_documents
CREATE INDEX idx_canonical_last_accessed ON canonical_documents(last_accessed_at);
CREATE INDEX idx_canonical_ref_count_zero ON canonical_documents(reference_count) WHERE reference_count = 0;

-- ==================== CANONICAL DOCUMENT REFS ====================
-- Reference edges - tracks which user files reference which canonical documents
-- Enables atomic, idempotent reference counting

CREATE TABLE canonical_document_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64) NOT NULL,
  ref_type VARCHAR(20) NOT NULL DEFAULT 'file',
  ref_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_refs_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  -- Idempotency: same ref can only be created once
  CONSTRAINT unique_ref_type_id UNIQUE(ref_type, ref_id)
);

COMMENT ON TABLE canonical_document_refs IS 'Reference edges linking user files to canonical documents. UNIQUE constraint ensures idempotent operations.';
COMMENT ON COLUMN canonical_document_refs.ref_type IS 'Type of reference (e.g., file, shared_workspace)';
COMMENT ON COLUMN canonical_document_refs.ref_id IS 'ID of the referencing entity (e.g., file.id)';

-- Indexes for canonical_document_refs
CREATE INDEX idx_refs_pdf_hash ON canonical_document_refs(pdf_hash);
CREATE INDEX idx_refs_reverse ON canonical_document_refs(ref_type, ref_id);

-- ==================== CANONICAL PAGE METADATA ====================
-- Page-level metadata for effective_mode determination before cache lookup

CREATE TABLE canonical_page_metadata (
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  has_images BOOLEAN NOT NULL DEFAULT FALSE,
  images_count INTEGER DEFAULT 0,
  word_count INTEGER,
  is_scanned BOOLEAN,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  PRIMARY KEY (pdf_hash, page),

  CONSTRAINT fk_page_meta_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  CONSTRAINT check_page_positive CHECK (page > 0),
  CONSTRAINT check_images_count_non_negative CHECK (images_count >= 0)
);

COMMENT ON TABLE canonical_page_metadata IS 'Page-level metadata for determining effective_mode before cache lookup. Lightweight image detection results.';

-- Index for page metadata lookup
CREATE INDEX idx_page_meta_lookup ON canonical_page_metadata(pdf_hash, page);

-- ==================== FILES TABLE UPDATE ====================
-- Add content_hash column to existing files table

ALTER TABLE files ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- FK from files.content_hash to canonical_documents (ON DELETE SET NULL)
-- Note: Cannot add FK if column already exists with data that doesn't match
-- This is safe for new uploads; existing files will have NULL content_hash
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_files_canonical' AND table_name = 'files'
  ) THEN
    ALTER TABLE files ADD CONSTRAINT fk_files_canonical
      FOREIGN KEY (content_hash) REFERENCES canonical_documents(pdf_hash)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index for content_hash lookups
CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash) WHERE content_hash IS NOT NULL;

-- ==================== SHARED AUTO STICKERS ====================
-- Dual-purpose table: Result cache AND job queue
-- Uses DB unique constraint for single-flight generation

CREATE TABLE shared_auto_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64) NOT NULL,
  page INTEGER NOT NULL,
  prompt_version VARCHAR(20) NOT NULL DEFAULT '2026-01-11.1',
  locale VARCHAR(10) NOT NULL,
  effective_mode VARCHAR(20) NOT NULL,

  -- Status and content
  status sticker_status NOT NULL DEFAULT 'generating',
  stickers JSONB,  -- Main output (nullable until completed)
  image_summaries JSONB,  -- Image analysis results (internal use)

  -- Job queue fields
  locked_at TIMESTAMPTZ,
  lock_owner TEXT,  -- Worker instance ID
  attempts INTEGER DEFAULT 0 NOT NULL,
  run_after TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ,  -- Dynamic deadline: 60s + 25s*images + 15s*chunks (max 300s)
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  chunk_plan JSONB,  -- Optional: preserve chunking strategy for recovery

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  generation_time_ms INTEGER,

  CONSTRAINT fk_stickers_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  -- Validation constraints
  CONSTRAINT check_locale_format CHECK (locale ~ '^(en|zh-Hans)$'),
  CONSTRAINT check_mode_format CHECK (effective_mode IN ('text_only', 'with_images')),
  CONSTRAINT check_page_positive CHECK (page > 0),
  CONSTRAINT check_attempts_non_negative CHECK (attempts >= 0)
);

COMMENT ON TABLE shared_auto_stickers IS 'Shared cache for auto-generated stickers. Also serves as job queue for async generation.';
COMMENT ON COLUMN shared_auto_stickers.status IS 'generating=in progress, ready=completed, failed=error occurred';
COMMENT ON COLUMN shared_auto_stickers.expires_at IS 'Dynamic deadline based on content complexity';
COMMENT ON COLUMN shared_auto_stickers.prompt_version IS 'Version string for cache invalidation on prompt changes';

-- UNIQUE INDEX for single-flight: only one active generation per cache key
-- Allows multiple 'failed' entries but only one 'generating' or 'ready'
CREATE UNIQUE INDEX unique_sticker_cache_key
  ON shared_auto_stickers(pdf_hash, page, prompt_version, locale, effective_mode)
  WHERE status IN ('generating', 'ready');

-- Index for cache lookup (ready stickers only)
CREATE INDEX idx_shared_stickers_lookup
  ON shared_auto_stickers(pdf_hash, page, locale, effective_mode)
  WHERE status = 'ready';

-- Index for hash + status queries
CREATE INDEX idx_shared_stickers_hash_status
  ON shared_auto_stickers(pdf_hash, status);

-- Index for failed records cleanup
CREATE INDEX idx_failed_cleanup
  ON shared_auto_stickers(status, updated_at)
  WHERE status = 'failed';

-- Index for zombie cleanup (expired generating jobs)
CREATE INDEX idx_zombie_cleanup
  ON shared_auto_stickers(status, expires_at)
  WHERE status = 'generating';

-- Index for worker job pickup
CREATE INDEX idx_worker_pickup
  ON shared_auto_stickers(status, run_after, locked_at)
  WHERE status = 'generating';

-- ==================== EXPLAIN REQUESTS ====================
-- Quota ledger for audit and refund tracking

CREATE TABLE explain_requests (
  request_id UUID PRIMARY KEY,  -- Same as generation_id from shared_auto_stickers
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
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  refunded_at TIMESTAMPTZ,

  CONSTRAINT fk_requests_user FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,

  CONSTRAINT check_quota_units_positive CHECK (quota_units > 0),
  CONSTRAINT check_page_positive CHECK (page > 0)
);

COMMENT ON TABLE explain_requests IS 'Quota ledger for tracking charges and refunds. request_id matches generation_id for correlation.';
COMMENT ON COLUMN explain_requests.status IS 'charged=quota deducted, refunded=quota returned due to failure';

-- Indexes for explain_requests
CREATE INDEX idx_requests_user ON explain_requests(user_id, created_at DESC);
CREATE INDEX idx_requests_status ON explain_requests(status, created_at);
CREATE INDEX idx_requests_refund ON explain_requests(status, refunded_at) WHERE status = 'refunded';

-- ==================== STICKER LATENCY SAMPLES ====================
-- Raw latency samples for P95 calculation (14-day retention)

CREATE TABLE sticker_latency_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64),
  page INTEGER,
  locale VARCHAR(10),
  effective_mode VARCHAR(20),

  -- Performance metrics
  latency_ms INTEGER NOT NULL,
  images_count INTEGER DEFAULT 0,
  chunks INTEGER DEFAULT 0,
  cache_hit BOOLEAN DEFAULT FALSE,  -- Internal tracking only

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT check_latency_positive CHECK (latency_ms >= 0)
);

COMMENT ON TABLE sticker_latency_samples IS 'Raw latency samples for P95 calculation. 14-day retention.';

-- Indexes for latency samples
CREATE INDEX idx_latency_samples_date ON sticker_latency_samples(created_at DESC);
CREATE INDEX idx_latency_samples_aggregation ON sticker_latency_samples(effective_mode, created_at);
-- Note: Cleanup queries use idx_latency_samples_date index
-- Query pattern: DELETE FROM sticker_latency_samples WHERE created_at < NOW() - INTERVAL '14 days'

-- ==================== USER PREFERENCES ====================
-- User opt-out mechanism for shared cache

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_to_cache BOOLEAN DEFAULT TRUE NOT NULL,  -- Opt-in by default
  default_locale VARCHAR(10) DEFAULT 'en',
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT check_locale_format CHECK (default_locale ~ '^(en|zh-Hans)$')
);

COMMENT ON TABLE user_preferences IS 'User preferences including opt-out for shared cache participation.';
COMMENT ON COLUMN user_preferences.share_to_cache IS 'If FALSE, user stickers are not stored in shared cache';

-- Index for user preferences lookup
CREATE INDEX idx_user_preferences_lookup ON user_preferences(user_id);

-- ==================== STICKER METRICS ====================
-- Aggregated metrics for monitoring dashboard

CREATE TABLE sticker_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  metric_hour INTEGER NOT NULL,  -- 0-23

  -- Dimensions (nullable for aggregate rows)
  pdf_hash VARCHAR(64),
  locale VARCHAR(10),
  mode VARCHAR(20),

  -- Cache metrics
  cache_hits INTEGER DEFAULT 0 NOT NULL,
  cache_misses INTEGER DEFAULT 0 NOT NULL,

  -- Generation metrics
  generations_started INTEGER DEFAULT 0 NOT NULL,
  generations_completed INTEGER DEFAULT 0 NOT NULL,
  generations_failed INTEGER DEFAULT 0 NOT NULL,
  zombie_cleanups INTEGER DEFAULT 0 NOT NULL,
  refunds INTEGER DEFAULT 0 NOT NULL,

  -- Latency (aggregated from sticker_latency_samples)
  total_generation_time_ms BIGINT DEFAULT 0 NOT NULL,
  p95_generation_time_ms INTEGER,

  -- Token usage
  total_input_tokens BIGINT DEFAULT 0 NOT NULL,
  total_output_tokens BIGINT DEFAULT 0 NOT NULL,

  -- Error tracking
  error_counts JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT check_hour_range CHECK (metric_hour >= 0 AND metric_hour <= 23),
  CONSTRAINT unique_metric_key UNIQUE(metric_date, metric_hour, pdf_hash, locale, mode)
);

COMMENT ON TABLE sticker_metrics IS 'Hourly aggregated metrics for monitoring dashboard.';

-- Indexes for sticker_metrics
CREATE INDEX idx_metrics_date ON sticker_metrics(metric_date DESC, metric_hour DESC);
CREATE INDEX idx_metrics_pdf ON sticker_metrics(pdf_hash, metric_date) WHERE pdf_hash IS NOT NULL;
CREATE INDEX idx_metrics_aggregation ON sticker_metrics(metric_date, metric_hour, created_at);

-- ==================== HELPER FUNCTIONS ====================

-- Function to atomically increment reference count when adding a ref
CREATE OR REPLACE FUNCTION increment_canonical_ref_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE canonical_documents
  SET reference_count = reference_count + 1,
      last_reference_at = NOW()
  WHERE pdf_hash = NEW.pdf_hash;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to atomically decrement reference count when removing a ref
CREATE OR REPLACE FUNCTION decrement_canonical_ref_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE canonical_documents
  SET reference_count = reference_count - 1
  WHERE pdf_hash = OLD.pdf_hash;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic reference counting
CREATE TRIGGER trigger_increment_ref_count
  AFTER INSERT ON canonical_document_refs
  FOR EACH ROW EXECUTE FUNCTION increment_canonical_ref_count();

CREATE TRIGGER trigger_decrement_ref_count
  AFTER DELETE ON canonical_document_refs
  FOR EACH ROW EXECUTE FUNCTION decrement_canonical_ref_count();

-- Function to update updated_at on shared_auto_stickers
CREATE TRIGGER update_shared_stickers_updated_at
  BEFORE UPDATE ON shared_auto_stickers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update updated_at on user_preferences
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update updated_at on sticker_metrics
CREATE TRIGGER update_sticker_metrics_updated_at
  BEFORE UPDATE ON sticker_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== RLS POLICIES ====================

-- canonical_documents: Service role only (managed by backend)
ALTER TABLE canonical_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for canonical_documents" ON canonical_documents
  FOR ALL USING (auth.role() = 'service_role');

-- canonical_document_refs: Service role only
ALTER TABLE canonical_document_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for canonical_document_refs" ON canonical_document_refs
  FOR ALL USING (auth.role() = 'service_role');

-- canonical_page_metadata: Service role only
ALTER TABLE canonical_page_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for canonical_page_metadata" ON canonical_page_metadata
  FOR ALL USING (auth.role() = 'service_role');

-- shared_auto_stickers: Service role only (managed by backend)
ALTER TABLE shared_auto_stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for shared_auto_stickers" ON shared_auto_stickers
  FOR ALL USING (auth.role() = 'service_role');

-- explain_requests: Users can view own requests, service role can manage all
ALTER TABLE explain_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own explain_requests" ON explain_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage explain_requests" ON explain_requests
  FOR ALL USING (auth.role() = 'service_role');

-- sticker_latency_samples: Service role only
ALTER TABLE sticker_latency_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for sticker_latency_samples" ON sticker_latency_samples
  FOR ALL USING (auth.role() = 'service_role');

-- user_preferences: Users can manage own preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- sticker_metrics: Service role only (admin dashboard)
ALTER TABLE sticker_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for sticker_metrics" ON sticker_metrics
  FOR ALL USING (auth.role() = 'service_role');

-- ==================== PROMPT VERSION CONSTANT ====================
-- Note: This is for documentation. Actual constant is in TypeScript code.
-- Current version: '2026-01-11.1'
-- Bump rules:
--   - Prompt template changed
--   - Output structure modified (affects parsing)
--   - Key strategy changed (chunking, merging, image analysis logic)

COMMENT ON TABLE shared_auto_stickers IS 
  'Shared cache for auto-generated stickers. Current prompt_version: 2026-01-11.1. Bump version when: prompt template changes, output structure changes, or key strategy changes.';
