-- Migration: 004_shared_context_library.sql
-- Shared Context Library for AI Enhancement
-- This migration creates infrastructure for:
--   1. PDF context entries (definitions, formulas, theorems, concepts, principles)
--   2. User context scope mapping for course-level access
--   3. Context extraction job queue with checkpoint resume
--   4. Usage quota tracking for cost control

-- ==================== ENUMS ====================

-- Status for context extraction jobs
CREATE TYPE context_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Type of context entry
CREATE TYPE context_entry_type AS ENUM ('definition', 'formula', 'theorem', 'concept', 'principle');

-- ==================== PDF CONTEXT ENTRIES ====================
-- Shared context entries extracted from PDFs
-- Cross-user reusable via pdf_hash (links to canonical_documents)

CREATE TABLE pdf_context_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64) NOT NULL,
  type context_entry_type NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_page INTEGER NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  quality_score FLOAT NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  extraction_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Foreign key to canonical documents
  CONSTRAINT fk_context_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  -- Validation constraints
  CONSTRAINT check_quality_score_range CHECK (quality_score >= 0 AND quality_score <= 1),
  CONSTRAINT check_page_positive CHECK (source_page > 0),
  CONSTRAINT check_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT check_content_not_empty CHECK (length(trim(content)) > 0),
  CONSTRAINT check_language_format CHECK (language ~ '^[a-z]{2}(-[A-Za-z]+)?$')
);

COMMENT ON TABLE pdf_context_entries IS 'Shared context library entries extracted from PDFs. Cross-user reusable via pdf_hash.';
COMMENT ON COLUMN pdf_context_entries.pdf_hash IS 'SHA-256 hash linking to canonical_documents';
COMMENT ON COLUMN pdf_context_entries.type IS 'Entry type: definition, formula, theorem, concept, or principle';
COMMENT ON COLUMN pdf_context_entries.quality_score IS 'AI self-assessed quality (0-1). Entries with score < 0.7 are filtered during extraction.';
COMMENT ON COLUMN pdf_context_entries.extraction_version IS 'Algorithm version used for extraction. Enables backfill when prompts improve.';
COMMENT ON COLUMN pdf_context_entries.keywords IS 'Array of search keywords for context retrieval matching';

-- Indexes for fast context retrieval
CREATE INDEX idx_context_hash ON pdf_context_entries(pdf_hash);
CREATE INDEX idx_context_keywords ON pdf_context_entries USING GIN (keywords);
CREATE INDEX idx_context_title ON pdf_context_entries USING GIN (to_tsvector('english', title));
CREATE INDEX idx_context_type ON pdf_context_entries(type);
CREATE INDEX idx_context_quality ON pdf_context_entries(quality_score) WHERE quality_score >= 0.7;
CREATE INDEX idx_context_hash_quality ON pdf_context_entries(pdf_hash, quality_score) WHERE quality_score >= 0.7;

-- ==================== USER CONTEXT SCOPE ====================
-- Maps users to accessible context entries via course-level scoping

CREATE TABLE user_context_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL,
  pdf_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Foreign keys
  CONSTRAINT fk_scope_user FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_scope_course FOREIGN KEY (course_id)
    REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_scope_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT fk_scope_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  -- Ensure one association per user-file pair (idempotent)
  CONSTRAINT unique_user_file UNIQUE(user_id, file_id)
);

COMMENT ON TABLE user_context_scope IS 'Maps users to accessible context entries. Enables course-level context scoping.';
COMMENT ON COLUMN user_context_scope.pdf_hash IS 'Links to canonical_documents and pdf_context_entries for content lookup';

-- Indexes for scope lookups
CREATE INDEX idx_scope_user_course ON user_context_scope(user_id, course_id);
CREATE INDEX idx_scope_hash ON user_context_scope(pdf_hash);
CREATE INDEX idx_scope_file ON user_context_scope(file_id);
CREATE INDEX idx_scope_course ON user_context_scope(course_id);

-- ==================== CONTEXT EXTRACTION JOBS ====================
-- Job queue for async context extraction with checkpoint resume

CREATE TABLE context_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64) NOT NULL,
  file_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status context_job_status NOT NULL DEFAULT 'pending',

  -- Progress tracking
  total_pages INTEGER NOT NULL,
  total_words INTEGER NOT NULL DEFAULT 0,
  processed_words INTEGER DEFAULT 0,
  processed_pages INTEGER DEFAULT 0,
  current_batch INTEGER DEFAULT 0,
  total_batches INTEGER NOT NULL DEFAULT 1,

  -- Job management
  extraction_version INTEGER NOT NULL DEFAULT 1,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  last_error_at TIMESTAMPTZ,

  -- Worker coordination
  locked_at TIMESTAMPTZ,
  lock_owner TEXT,
  run_after TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Foreign keys
  CONSTRAINT fk_job_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT fk_job_user FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Validation constraints
  CONSTRAINT check_pages_non_negative CHECK (processed_pages >= 0 AND total_pages > 0),
  CONSTRAINT check_words_non_negative CHECK (processed_words >= 0 AND total_words >= 0),
  CONSTRAINT check_batch_non_negative CHECK (current_batch >= 0 AND total_batches > 0),
  CONSTRAINT check_retry_non_negative CHECK (retry_count >= 0 AND retry_count <= 10)
);

COMMENT ON TABLE context_extraction_jobs IS 'Async job queue for context extraction tasks. Supports checkpoint resume.';
COMMENT ON COLUMN context_extraction_jobs.total_words IS 'Estimated total word count in PDF (for progress calculation)';
COMMENT ON COLUMN context_extraction_jobs.processed_words IS 'Words processed so far (checkpoint for resume)';
COMMENT ON COLUMN context_extraction_jobs.current_batch IS 'Last completed batch number (checkpoint for resume)';
COMMENT ON COLUMN context_extraction_jobs.run_after IS 'Earliest time to run (for exponential backoff)';
COMMENT ON COLUMN context_extraction_jobs.lock_owner IS 'Worker instance ID holding the lock';

-- Indexes for job queue operations
CREATE INDEX idx_jobs_status ON context_extraction_jobs(status, created_at);
CREATE INDEX idx_jobs_hash ON context_extraction_jobs(pdf_hash);
CREATE INDEX idx_jobs_file ON context_extraction_jobs(file_id);
CREATE INDEX idx_jobs_user ON context_extraction_jobs(user_id);
CREATE INDEX idx_jobs_pending ON context_extraction_jobs(status, run_after, total_words)
  WHERE status = 'pending';
CREATE INDEX idx_jobs_processing ON context_extraction_jobs(status, locked_at)
  WHERE status = 'processing';

-- Unique constraint: only one active job per pdf_hash
CREATE UNIQUE INDEX unique_active_extraction_job
  ON context_extraction_jobs(pdf_hash)
  WHERE status IN ('pending', 'processing');

-- ==================== EXTRACTION FAILURES LOG ====================
-- Audit log for extraction failures (for debugging and monitoring)

CREATE TABLE context_extraction_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  batch_number INTEGER NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_failure_job FOREIGN KEY (job_id)
    REFERENCES context_extraction_jobs(id) ON DELETE CASCADE
);

COMMENT ON TABLE context_extraction_failures IS 'Audit log for extraction failures. Used for debugging and monitoring.';

-- Index for failure lookups
CREATE INDEX idx_failures_job ON context_extraction_failures(job_id);
CREATE INDEX idx_failures_date ON context_extraction_failures(created_at DESC);

-- ==================== USER EXTRACTION QUOTA ====================
-- Monthly extraction quota tracking per user (cost control)

CREATE TABLE user_extraction_quota (
  user_id UUID PRIMARY KEY,
  month_year VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  extractions_used INTEGER DEFAULT 0 NOT NULL,
  extractions_limit INTEGER DEFAULT 20 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT fk_quota_user FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,

  CONSTRAINT check_extractions_non_negative CHECK (extractions_used >= 0),
  CONSTRAINT check_limit_positive CHECK (extractions_limit > 0)
);

COMMENT ON TABLE user_extraction_quota IS 'Monthly extraction quota per user for cost control. Resets monthly.';
COMMENT ON COLUMN user_extraction_quota.month_year IS 'Current billing month in YYYY-MM format';
COMMENT ON COLUMN user_extraction_quota.extractions_limit IS 'Maximum extractions allowed per month (default 20)';

-- Index for quota lookups
CREATE INDEX idx_quota_month ON user_extraction_quota(month_year);

-- ==================== CONTEXT METRICS ====================
-- Aggregated metrics for monitoring context extraction and retrieval

CREATE TABLE context_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  metric_hour INTEGER NOT NULL, -- 0-23

  -- Extraction metrics
  extractions_started INTEGER DEFAULT 0 NOT NULL,
  extractions_completed INTEGER DEFAULT 0 NOT NULL,
  extractions_failed INTEGER DEFAULT 0 NOT NULL,
  cache_hits INTEGER DEFAULT 0 NOT NULL,
  total_entries_created INTEGER DEFAULT 0 NOT NULL,
  avg_quality_score FLOAT,

  -- Retrieval metrics
  retrieval_calls INTEGER DEFAULT 0 NOT NULL,
  avg_retrieval_latency_ms INTEGER,

  -- Cost tracking
  total_extraction_tokens BIGINT DEFAULT 0 NOT NULL,
  total_keyword_tokens BIGINT DEFAULT 0 NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT check_hour_range CHECK (metric_hour >= 0 AND metric_hour <= 23),
  CONSTRAINT unique_context_metric_key UNIQUE(metric_date, metric_hour)
);

COMMENT ON TABLE context_metrics IS 'Hourly aggregated metrics for context library monitoring.';

-- Index for metrics queries
CREATE INDEX idx_context_metrics_date ON context_metrics(metric_date DESC, metric_hour DESC);

-- ==================== HELPER FUNCTIONS ====================

-- Function to check and update monthly quota
CREATE OR REPLACE FUNCTION check_extraction_quota(p_user_id UUID)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_date DATE) AS $$
DECLARE
  current_month VARCHAR(7);
  quota_record user_extraction_quota%ROWTYPE;
BEGIN
  current_month := to_char(NOW(), 'YYYY-MM');

  -- Get or create quota record
  SELECT * INTO quota_record
  FROM user_extraction_quota
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Create new quota record
    INSERT INTO user_extraction_quota (user_id, month_year, extractions_used, extractions_limit)
    VALUES (p_user_id, current_month, 0, 20)
    RETURNING * INTO quota_record;
  ELSIF quota_record.month_year != current_month THEN
    -- Reset quota for new month
    UPDATE user_extraction_quota
    SET month_year = current_month, extractions_used = 0, updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO quota_record;
  END IF;

  -- Calculate next month for reset date
  RETURN QUERY SELECT
    quota_record.extractions_used < quota_record.extractions_limit,
    quota_record.extractions_limit - quota_record.extractions_used,
    (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to increment extraction quota usage
CREATE OR REPLACE FUNCTION increment_extraction_quota(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_month VARCHAR(7);
  updated_count INTEGER;
BEGIN
  current_month := to_char(NOW(), 'YYYY-MM');

  -- Upsert and increment
  INSERT INTO user_extraction_quota (user_id, month_year, extractions_used, extractions_limit)
  VALUES (p_user_id, current_month, 1, 20)
  ON CONFLICT (user_id) DO UPDATE SET
    extractions_used = CASE
      WHEN user_extraction_quota.month_year = current_month
      THEN user_extraction_quota.extractions_used + 1
      ELSE 1  -- Reset for new month
    END,
    month_year = current_month,
    updated_at = NOW()
  WHERE user_extraction_quota.extractions_used < user_extraction_quota.extractions_limit
     OR user_extraction_quota.month_year != current_month;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at on context_extraction_jobs
CREATE TRIGGER update_context_jobs_updated_at
  BEFORE UPDATE ON context_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for updated_at on context_metrics
CREATE TRIGGER update_context_metrics_updated_at
  BEFORE UPDATE ON context_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== RLS POLICIES ====================

-- pdf_context_entries: Service role only (managed by backend)
ALTER TABLE pdf_context_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for pdf_context_entries" ON pdf_context_entries
  FOR ALL USING (auth.role() = 'service_role');

-- user_context_scope: Service role only (managed by backend)
ALTER TABLE user_context_scope ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for user_context_scope" ON user_context_scope
  FOR ALL USING (auth.role() = 'service_role');

-- context_extraction_jobs: Service role only
ALTER TABLE context_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for context_extraction_jobs" ON context_extraction_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- context_extraction_failures: Service role only
ALTER TABLE context_extraction_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for context_extraction_failures" ON context_extraction_failures
  FOR ALL USING (auth.role() = 'service_role');

-- user_extraction_quota: Users can view own quota, service role manages
ALTER TABLE user_extraction_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own extraction_quota" ON user_extraction_quota
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage extraction_quota" ON user_extraction_quota
  FOR ALL USING (auth.role() = 'service_role');

-- context_metrics: Service role only
ALTER TABLE context_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for context_metrics" ON context_metrics
  FOR ALL USING (auth.role() = 'service_role');

-- ==================== DOCUMENTATION ====================

COMMENT ON FUNCTION check_extraction_quota IS
  'Check if user has remaining extraction quota for current month. Returns allowed status, remaining count, and reset date.';

COMMENT ON FUNCTION increment_extraction_quota IS
  'Atomically increment extraction quota usage. Returns FALSE if quota exceeded. Handles month rollover.';
