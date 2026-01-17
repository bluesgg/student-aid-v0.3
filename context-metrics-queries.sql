-- ==========================================
-- Context Library Monitoring Queries
-- ==========================================
-- These queries work with Supabase SQL Editor
-- Run these to monitor extraction health

-- ==========================================
-- 1. Check if context_metrics table exists
-- ==========================================
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'context_metrics'
) as table_exists;

-- If above returns FALSE, you need to run the migration:
-- pnpm supabase migration up

-- ==========================================
-- 2. Extraction Success Rate (Last 24 Hours)
-- ==========================================
SELECT
  COALESCE(SUM(extractions_completed), 0) as completed,
  COALESCE(SUM(extractions_failed), 0) as failed,
  COALESCE(SUM(extractions_started), 0) as started,
  CASE
    WHEN SUM(extractions_completed + extractions_failed) > 0
    THEN ROUND(100.0 * SUM(extractions_completed) / SUM(extractions_completed + extractions_failed), 2)
    ELSE NULL
  END as success_rate_pct
FROM context_metrics
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- ==========================================
-- 3. Average Quality Scores by Hour (Last 7 Days)
-- ==========================================
SELECT
  metric_date,
  metric_hour,
  ROUND(avg_quality_score::numeric, 3) as avg_quality_score,
  total_entries_created
FROM context_metrics
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  AND total_entries_created > 0
ORDER BY metric_date DESC, metric_hour DESC
LIMIT 50;

-- ==========================================
-- 4. Cache Hit Rate (Last 24 Hours)
-- ==========================================
SELECT
  COALESCE(SUM(cache_hits), 0) as cache_hits,
  COALESCE(SUM(extractions_started), 0) as total_extractions,
  CASE
    WHEN SUM(extractions_started) > 0
    THEN ROUND(100.0 * SUM(cache_hits) / SUM(extractions_started), 2)
    ELSE NULL
  END as cache_hit_rate_pct
FROM context_metrics
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- ==========================================
-- 5. Daily Summary (Last 30 Days)
-- ==========================================
SELECT
  metric_date,
  SUM(extractions_started) as started,
  SUM(extractions_completed) as completed,
  SUM(extractions_failed) as failed,
  SUM(cache_hits) as cache_hits,
  SUM(total_entries_created) as entries_created,
  ROUND(AVG(avg_quality_score)::numeric, 3) as avg_quality,
  SUM(retrieval_calls) as retrieval_calls,
  ROUND(AVG(avg_retrieval_latency_ms)::numeric, 0) as avg_latency_ms
FROM context_metrics
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY metric_date
ORDER BY metric_date DESC;

-- ==========================================
-- 6. Recent Extraction Jobs Status
-- ==========================================
SELECT
  j.id,
  j.status,
  j.processed_pages || '/' || j.total_pages as pages_progress,
  j.processed_words || '/' || j.total_words as words_progress,
  j.retry_count,
  j.error_message,
  j.created_at,
  j.completed_at,
  EXTRACT(EPOCH FROM (COALESCE(j.completed_at, CURRENT_TIMESTAMP) - j.created_at)) as duration_seconds
FROM context_extraction_jobs j
ORDER BY j.created_at DESC
LIMIT 20;

-- ==========================================
-- 7. Extraction Failures (Last 7 Days)
-- ==========================================
SELECT
  f.created_at,
  f.batch_number,
  f.error_message,
  j.file_id,
  j.pdf_hash,
  j.retry_count
FROM context_extraction_failures f
JOIN context_extraction_jobs j ON f.job_id = j.id
WHERE f.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY f.created_at DESC
LIMIT 50;

-- ==========================================
-- 8. User Extraction Quota Usage
-- ==========================================
SELECT
  q.month_year,
  COUNT(*) as users,
  SUM(q.extractions_used) as total_extractions,
  ROUND(AVG(q.extractions_used)::numeric, 1) as avg_per_user,
  COUNT(*) FILTER (WHERE q.extractions_used >= q.extractions_limit) as users_at_limit
FROM user_extraction_quota q
WHERE q.month_year = to_char(CURRENT_TIMESTAMP, 'YYYY-MM')
GROUP BY q.month_year;

-- ==========================================
-- 9. Context Entries Statistics
-- ==========================================
SELECT
  type,
  COUNT(*) as entry_count,
  ROUND(AVG(quality_score)::numeric, 3) as avg_quality,
  ROUND(MIN(quality_score)::numeric, 3) as min_quality,
  ROUND(MAX(quality_score)::numeric, 3) as max_quality,
  COUNT(DISTINCT pdf_hash) as unique_pdfs
FROM pdf_context_entries
GROUP BY type
ORDER BY entry_count DESC;

-- ==========================================
-- 10. Most Active PDFs (By Context Entries)
-- ==========================================
SELECT
  pdf_hash,
  COUNT(*) as entry_count,
  ROUND(AVG(quality_score)::numeric, 3) as avg_quality,
  MIN(extraction_version) as extraction_version,
  array_agg(DISTINCT type) as entry_types
FROM pdf_context_entries
GROUP BY pdf_hash
ORDER BY entry_count DESC
LIMIT 20;

-- ==========================================
-- 11. Real-Time Metrics (Current Hour)
-- ==========================================
SELECT
  metric_date,
  metric_hour,
  extractions_started,
  extractions_completed,
  extractions_failed,
  cache_hits,
  total_entries_created,
  ROUND(avg_quality_score::numeric, 3) as avg_quality_score,
  retrieval_calls,
  avg_retrieval_latency_ms,
  updated_at
FROM context_metrics
WHERE metric_date = CURRENT_DATE
  AND metric_hour = EXTRACT(HOUR FROM CURRENT_TIMESTAMP)
ORDER BY updated_at DESC
LIMIT 1;

-- ==========================================
-- 12. Cost Tracking (Token Usage)
-- ==========================================
SELECT
  metric_date,
  SUM(total_extraction_tokens) as extraction_tokens,
  SUM(total_keyword_tokens) as keyword_tokens,
  SUM(total_extraction_tokens + total_keyword_tokens) as total_tokens,
  -- Estimated cost (gpt-4o-mini pricing)
  ROUND((SUM(total_extraction_tokens)::numeric * 0.15 / 1000000), 4) as extraction_cost_usd,
  ROUND((SUM(total_keyword_tokens)::numeric * 0.15 / 1000000), 4) as keyword_cost_usd,
  ROUND((SUM(total_extraction_tokens + total_keyword_tokens)::numeric * 0.15 / 1000000), 4) as total_cost_usd
FROM context_metrics
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY metric_date
ORDER BY metric_date DESC;
