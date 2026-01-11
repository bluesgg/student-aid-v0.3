-- Migration: 001_initial_schema.sql
-- StudentAid MVP Database Schema
-- Run this migration in Supabase SQL Editor or via CLI

-- ==================== COURSES ====================

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  school TEXT NOT NULL,
  term TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  last_visited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_course_name UNIQUE(user_id, name)
);

CREATE INDEX idx_courses_user_id ON courses(user_id);

-- RLS Policies
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own courses" ON courses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own courses" ON courses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own courses" ON courses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own courses" ON courses
  FOR DELETE USING (auth.uid() = user_id);

-- ==================== FILES ====================

CREATE TYPE file_type AS ENUM ('Lecture', 'Homework', 'Exam', 'Other');

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type file_type NOT NULL,
  page_count INTEGER NOT NULL,
  is_scanned BOOLEAN DEFAULT FALSE,
  pdf_content_hash VARCHAR(64),
  storage_key TEXT NOT NULL,
  last_read_page INTEGER DEFAULT 1,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_course_file_name UNIQUE(course_id, name)
);

CREATE INDEX idx_files_user_id_hash ON files(user_id, pdf_content_hash);
CREATE INDEX idx_files_course_id ON files(course_id);

-- RLS Policies
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own files" ON files
  FOR ALL USING (auth.uid() = user_id);

-- ==================== STICKERS ====================

CREATE TYPE sticker_type AS ENUM ('auto', 'manual');

CREATE TABLE stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  type sticker_type NOT NULL,
  page INTEGER NOT NULL,
  anchor_text TEXT NOT NULL,
  anchor_rect JSONB,
  parent_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  content_markdown TEXT NOT NULL,
  folded BOOLEAN DEFAULT FALSE,
  depth INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stickers_file_page_type ON stickers(file_id, page, type);
CREATE INDEX idx_stickers_user_id ON stickers(user_id);

-- RLS Policies
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own stickers" ON stickers
  FOR ALL USING (auth.uid() = user_id);

-- ==================== QUOTAS ====================

CREATE TYPE quota_bucket AS ENUM (
  'learningInteractions',
  'documentSummary',
  'sectionSummary',
  'courseSummary',
  'autoExplain'
);

CREATE TABLE quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket quota_bucket NOT NULL,
  used INTEGER DEFAULT 0,
  "limit" INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_bucket UNIQUE(user_id, bucket)
);

CREATE INDEX idx_quotas_user_id ON quotas(user_id);
CREATE INDEX idx_quotas_reset_at ON quotas(reset_at);

-- RLS Policies
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own quotas" ON quotas
  FOR ALL USING (auth.uid() = user_id);

-- ==================== QA INTERACTIONS ====================

CREATE TABLE qa_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_markdown TEXT NOT NULL,
  "references" JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qa_file_id ON qa_interactions(file_id);
CREATE INDEX idx_qa_user_id ON qa_interactions(user_id);

-- RLS Policies
ALTER TABLE qa_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own qa" ON qa_interactions
  FOR ALL USING (auth.uid() = user_id);

-- ==================== SUMMARIES ====================

CREATE TYPE summary_type AS ENUM ('document', 'section', 'course');

CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  type summary_type NOT NULL,
  page_range_start INTEGER,
  page_range_end INTEGER,
  content_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_summaries_file_type ON summaries(file_id, type);
CREATE INDEX idx_summaries_user_id ON summaries(user_id);
CREATE INDEX idx_summaries_course_type ON summaries(course_id, type);

-- RLS Policies
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own summaries" ON summaries
  FOR ALL USING (auth.uid() = user_id);

-- ==================== AI USAGE LOGS ====================

CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID,
  file_id UUID,
  operation_type VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd_approx DECIMAL(10, 6) NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  error_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX idx_ai_logs_created_at ON ai_usage_logs(created_at);

-- RLS Policies (admin-only, no user access)
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON ai_usage_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ==================== AUDIT LOGS ====================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  ip_prefix VARCHAR(20),
  user_agent VARCHAR(255),
  request_id VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- RLS Policies (admin-only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON audit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ==================== HELPER FUNCTIONS ====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotas_updated_at
  BEFORE UPDATE ON quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update course file_count on file insert/delete
CREATE OR REPLACE FUNCTION update_course_file_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE courses SET file_count = file_count + 1 WHERE id = NEW.course_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE courses SET file_count = file_count - 1 WHERE id = OLD.course_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_file_count_on_insert
  AFTER INSERT ON files
  FOR EACH ROW EXECUTE FUNCTION update_course_file_count();

CREATE TRIGGER update_file_count_on_delete
  AFTER DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION update_course_file_count();

-- Function to atomically increment quota used count
-- Returns the updated quota record
CREATE OR REPLACE FUNCTION increment_quota_used(
  p_user_id UUID,
  p_bucket quota_bucket
)
RETURNS TABLE (used INTEGER, "limit" INTEGER, reset_at TIMESTAMPTZ) AS $$
DECLARE
  v_reset_at TIMESTAMPTZ;
  v_limit INTEGER;
BEGIN
  -- Calculate default reset date (1 month from now at midnight)
  v_reset_at := date_trunc('day', NOW() + INTERVAL '1 month');

  -- Get default limit based on bucket
  v_limit := CASE p_bucket
    WHEN 'learningInteractions' THEN 150
    WHEN 'documentSummary' THEN 100
    WHEN 'sectionSummary' THEN 65
    WHEN 'courseSummary' THEN 15
    WHEN 'autoExplain' THEN 300
    ELSE 100
  END;

  -- Insert or update with atomic increment
  INSERT INTO quotas (user_id, bucket, used, "limit", reset_at)
  VALUES (p_user_id, p_bucket, 1, v_limit, v_reset_at)
  ON CONFLICT (user_id, bucket)
  DO UPDATE SET
    used = quotas.used + 1,
    updated_at = NOW()
  RETURNING quotas.used, quotas."limit", quotas.reset_at
  INTO used, "limit", reset_at;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== STORAGE BUCKET ====================
-- Note: Run this in Supabase SQL Editor after enabling Storage

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('course-files', 'course-files', false);

-- CREATE POLICY "Users can upload own files"
-- ON storage.objects FOR INSERT
-- WITH CHECK (
--   bucket_id = 'course-files' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );

-- CREATE POLICY "Users can read own files"
-- ON storage.objects FOR SELECT
-- USING (
--   bucket_id = 'course-files' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );

-- CREATE POLICY "Users can delete own files"
-- ON storage.objects FOR DELETE
-- USING (
--   bucket_id = 'course-files' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );
