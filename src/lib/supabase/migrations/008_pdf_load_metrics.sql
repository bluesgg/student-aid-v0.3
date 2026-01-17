-- Migration: 008_pdf_load_metrics.sql
-- Add PDF load performance metrics tracking

-- ==================== PDF LOAD METRICS ====================

CREATE TABLE IF NOT EXISTS pdf_load_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Timing metrics
  load_time_ms INTEGER NOT NULL,           -- Total time from mount to document ready
  first_page_time_ms INTEGER,              -- Time from mount to first page visible

  -- Document info
  total_pages INTEGER,                      -- Number of pages in the PDF
  file_size_bytes BIGINT,                   -- Size of the PDF in bytes

  -- Cache info
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE, -- Whether PDF was loaded from cache

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying metrics
CREATE INDEX IF NOT EXISTS idx_pdf_load_metrics_file
  ON pdf_load_metrics(file_id);

CREATE INDEX IF NOT EXISTS idx_pdf_load_metrics_user
  ON pdf_load_metrics(user_id);

CREATE INDEX IF NOT EXISTS idx_pdf_load_metrics_created
  ON pdf_load_metrics(created_at);

-- Index for cache hit rate analysis
CREATE INDEX IF NOT EXISTS idx_pdf_load_metrics_cache_hit
  ON pdf_load_metrics(cache_hit, created_at);

-- ==================== RLS Policies ====================

ALTER TABLE pdf_load_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view their own metrics
CREATE POLICY "Users can view own pdf load metrics" ON pdf_load_metrics
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own metrics
CREATE POLICY "Users can insert own pdf load metrics" ON pdf_load_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all metrics (for analytics)
-- Note: Requires admin role to be set up separately
CREATE POLICY "Service role can view all pdf load metrics" ON pdf_load_metrics
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');
