-- Migration: 005_intelligent_auto_explain.sql
-- Intelligent Auto-Explain with Sliding Window Support
-- This migration creates infrastructure for:
--   1. Auto-explain sessions for sliding window management
--   2. Sticker version history (max 2 versions per sticker)
--   3. PDF type detection caching
--   4. Cross-page sticker support via page_range

-- ==================== SESSION STATES ====================

CREATE TYPE auto_explain_state AS ENUM ('active', 'paused', 'completed', 'canceled');

-- ==================== AUTO EXPLAIN SESSIONS ====================
-- Tracks active window generation sessions per user-file combination

CREATE TABLE auto_explain_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  -- Window tracking
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  current_page INTEGER NOT NULL,

  -- Generation state
  state auto_explain_state NOT NULL DEFAULT 'active',
  pages_completed INTEGER[] DEFAULT '{}',
  pages_in_progress INTEGER[] DEFAULT '{}',
  pages_failed INTEGER[] DEFAULT '{}',

  -- PDF type detected for this session
  pdf_type VARCHAR(10) CHECK (pdf_type IN ('ppt', 'text')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Window validation
  CONSTRAINT check_window_valid CHECK (window_start > 0 AND window_end >= window_start),
  CONSTRAINT check_current_page_in_window CHECK (current_page >= window_start AND current_page <= window_end)
);

COMMENT ON TABLE auto_explain_sessions IS 'Tracks active sliding window auto-explain sessions. One active session per user-file combination.';
COMMENT ON COLUMN auto_explain_sessions.window_start IS 'First page in the current generation window (inclusive)';
COMMENT ON COLUMN auto_explain_sessions.window_end IS 'Last page in the current generation window (inclusive)';
COMMENT ON COLUMN auto_explain_sessions.pages_completed IS 'Array of page numbers with successfully generated stickers';
COMMENT ON COLUMN auto_explain_sessions.pages_in_progress IS 'Array of page numbers currently being generated';

-- Indexes for auto_explain_sessions
CREATE INDEX idx_sessions_user_file ON auto_explain_sessions(user_id, file_id);
CREATE INDEX idx_sessions_state ON auto_explain_sessions(state) WHERE state = 'active';
CREATE INDEX idx_sessions_last_activity ON auto_explain_sessions(last_activity_at);

-- Partial unique index: enforce only one active session per user-file combination
CREATE UNIQUE INDEX idx_unique_active_session_user_file
  ON auto_explain_sessions(user_id, file_id)
  WHERE state = 'active';

-- RLS Policies for auto_explain_sessions
ALTER TABLE auto_explain_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions" ON auto_explain_sessions
  FOR ALL USING (auth.uid() = user_id);

-- ==================== STICKER VERSIONS ====================
-- Store previous versions of stickers (max 2 versions)
-- Version lifecycle:
--   Initial: content in stickers.content_markdown (version 1)
--   1st refresh: old content moves to sticker_versions(v1), new in stickers(v2)
--   2nd refresh: v1 deleted, old v2 becomes v1, new in stickers (circular)

CREATE TABLE sticker_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Only versions 1 and 2 allowed
  CONSTRAINT check_version_number CHECK (version_number IN (1, 2)),

  -- One entry per sticker-version combination
  CONSTRAINT unique_sticker_version UNIQUE (sticker_id, version_number)
);

COMMENT ON TABLE sticker_versions IS 'Store previous versions of stickers for version switching. Maximum 2 versions per sticker (circular replacement).';
COMMENT ON COLUMN sticker_versions.version_number IS '1=previous version (stored), 2=current version (stored when switching back)';

-- Index for version lookups
CREATE INDEX idx_versions_sticker ON sticker_versions(sticker_id);

-- RLS Policies for sticker_versions (inherit from stickers via join)
ALTER TABLE sticker_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sticker versions" ON sticker_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM stickers s WHERE s.id = sticker_versions.sticker_id AND s.user_id = auth.uid()
    )
  );

-- ==================== STICKERS TABLE UPDATES ====================
-- Add columns for version management and cross-page support

-- Current version number (1 or 2, pointing to active content)
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

-- Page range for cross-page stickers (text PDFs with paragraph accumulation)
-- Format: {"start": {"page": 5, "y_start": 100, "y_end": 200}, "end": {"page": 6, "y_start": 0, "y_end": 150}}
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS page_range JSONB;

-- Validation for current_version
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'check_current_version'
  ) THEN
    ALTER TABLE stickers ADD CONSTRAINT check_current_version
      CHECK (current_version IN (1, 2));
  END IF;
END $$;

COMMENT ON COLUMN stickers.current_version IS 'Currently displayed version (1 or 2)';
COMMENT ON COLUMN stickers.page_range IS 'For cross-page stickers: start/end page coordinates. Display on start page.';

-- ==================== FILES TABLE UPDATE ====================
-- Add PDF type detection caching

ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_type_detected VARCHAR(10);

-- Validation for pdf_type_detected
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'check_pdf_type_detected'
  ) THEN
    ALTER TABLE files ADD CONSTRAINT check_pdf_type_detected
      CHECK (pdf_type_detected IS NULL OR pdf_type_detected IN ('ppt', 'text'));
  END IF;
END $$;

COMMENT ON COLUMN files.pdf_type_detected IS 'Cached PDF type detection result: ppt (presentation-style) or text (dense text)';

-- Index for pdf_type lookup
CREATE INDEX IF NOT EXISTS idx_files_pdf_type ON files(pdf_type_detected) WHERE pdf_type_detected IS NOT NULL;

-- ==================== HELPER FUNCTIONS ====================

-- Function to create a new auto-explain session
-- Returns error if active session already exists
CREATE OR REPLACE FUNCTION start_auto_explain_session(
  p_user_id UUID,
  p_file_id UUID,
  p_start_page INTEGER,
  p_pdf_type VARCHAR(10)
)
RETURNS TABLE (
  session_id UUID,
  window_start INTEGER,
  window_end INTEGER,
  error_code TEXT
) AS $$
DECLARE
  v_page_count INTEGER;
  v_window_start INTEGER;
  v_window_end INTEGER;
  v_session_id UUID;
BEGIN
  -- Check for existing active session
  IF EXISTS (
    SELECT 1 FROM auto_explain_sessions
    WHERE user_id = p_user_id AND file_id = p_file_id AND state = 'active'
  ) THEN
    error_code := 'SESSION_EXISTS';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Get file page count
  SELECT f.page_count INTO v_page_count FROM files f WHERE f.id = p_file_id;
  IF v_page_count IS NULL THEN
    error_code := 'FILE_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Calculate window: current page -2 to +5 (clamped to valid range)
  v_window_start := GREATEST(1, p_start_page - 2);
  v_window_end := LEAST(v_page_count, p_start_page + 5);

  -- Create session
  INSERT INTO auto_explain_sessions (
    user_id, file_id, window_start, window_end, current_page, pdf_type, state
  ) VALUES (
    p_user_id, p_file_id, v_window_start, v_window_end, p_start_page, p_pdf_type, 'active'
  ) RETURNING id INTO v_session_id;

  session_id := v_session_id;
  window_start := v_window_start;
  window_end := v_window_end;
  error_code := NULL;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update window on page scroll
CREATE OR REPLACE FUNCTION update_session_window(
  p_session_id UUID,
  p_current_page INTEGER,
  p_action VARCHAR(10)  -- 'extend', 'jump', 'cancel'
)
RETURNS TABLE (
  window_start INTEGER,
  window_end INTEGER,
  canceled_pages INTEGER[],
  new_pages INTEGER[],
  error_code TEXT
) AS $$
DECLARE
  v_session RECORD;
  v_page_count INTEGER;
  v_new_window_start INTEGER;
  v_new_window_end INTEGER;
  v_old_pages INTEGER[];
  v_new_pages_arr INTEGER[];
BEGIN
  -- Get session and file info
  SELECT s.*, f.page_count
  INTO v_session
  FROM auto_explain_sessions s
  JOIN files f ON f.id = s.file_id
  WHERE s.id = p_session_id AND s.state = 'active';

  IF v_session IS NULL THEN
    error_code := 'SESSION_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  v_page_count := v_session.page_count;

  IF p_action = 'cancel' THEN
    -- Cancel session
    UPDATE auto_explain_sessions
    SET state = 'canceled', updated_at = NOW()
    WHERE id = p_session_id;

    window_start := v_session.window_start;
    window_end := v_session.window_end;
    canceled_pages := v_session.pages_in_progress;
    new_pages := '{}';
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Calculate new window
  v_new_window_start := GREATEST(1, p_current_page - 2);
  v_new_window_end := LEAST(v_page_count, p_current_page + 5);

  IF p_action = 'jump' THEN
    -- Jump: cancel all pages outside new window
    SELECT ARRAY(
      SELECT unnest FROM unnest(v_session.pages_in_progress)
      WHERE unnest < v_new_window_start OR unnest > v_new_window_end
    ) INTO canceled_pages;
  ELSE
    canceled_pages := '{}';
  END IF;

  -- Find new pages not yet generated
  SELECT ARRAY(
    SELECT page FROM generate_series(v_new_window_start, v_new_window_end) AS page
    WHERE page != ALL(v_session.pages_completed)
      AND page != ALL(v_session.pages_in_progress)
  ) INTO v_new_pages_arr;

  -- Update session
  UPDATE auto_explain_sessions SET
    window_start = v_new_window_start,
    window_end = v_new_window_end,
    current_page = p_current_page,
    updated_at = NOW(),
    last_activity_at = NOW()
  WHERE id = p_session_id;

  window_start := v_new_window_start;
  window_end := v_new_window_end;
  new_pages := v_new_pages_arr;
  error_code := NULL;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for circular version replacement
-- Creates new version, manages version rotation
CREATE OR REPLACE FUNCTION create_sticker_version(
  p_sticker_id UUID,
  p_new_content TEXT
)
RETURNS TABLE (
  new_version INTEGER,
  old_version_id UUID,
  error_code TEXT
) AS $$
DECLARE
  v_sticker RECORD;
  v_existing_versions INTEGER;
  v_old_content TEXT;
  v_old_version_id UUID;
BEGIN
  -- Get sticker
  SELECT * INTO v_sticker FROM stickers WHERE id = p_sticker_id;
  IF v_sticker IS NULL THEN
    error_code := 'STICKER_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Count existing versions
  SELECT COUNT(*) INTO v_existing_versions FROM sticker_versions WHERE sticker_id = p_sticker_id;

  -- Save current content as version before updating
  v_old_content := v_sticker.content_markdown;

  IF v_existing_versions = 0 THEN
    -- First refresh: save current as v1, new becomes v2
    INSERT INTO sticker_versions (sticker_id, version_number, content_markdown)
    VALUES (p_sticker_id, 1, v_old_content)
    RETURNING id INTO v_old_version_id;

    UPDATE stickers SET
      content_markdown = p_new_content,
      current_version = 2
    WHERE id = p_sticker_id;

    new_version := 2;
    old_version_id := v_old_version_id;

  ELSIF v_existing_versions = 1 THEN
    -- Second refresh: v1 stays, current (v2) goes to v2 in versions, new becomes current
    -- Check if v2 already exists (shouldn't, but be safe)
    DELETE FROM sticker_versions WHERE sticker_id = p_sticker_id AND version_number = 2;

    INSERT INTO sticker_versions (sticker_id, version_number, content_markdown)
    VALUES (p_sticker_id, 2, v_old_content)
    RETURNING id INTO v_old_version_id;

    UPDATE stickers SET
      content_markdown = p_new_content,
      current_version = 2
    WHERE id = p_sticker_id;

    new_version := 2;
    old_version_id := v_old_version_id;

  ELSE
    -- Third+ refresh: circular replacement
    -- Delete oldest version (v1), move v2 to v1, insert new as v2
    DELETE FROM sticker_versions WHERE sticker_id = p_sticker_id AND version_number = 1;

    UPDATE sticker_versions SET version_number = 1
    WHERE sticker_id = p_sticker_id AND version_number = 2;

    INSERT INTO sticker_versions (sticker_id, version_number, content_markdown)
    VALUES (p_sticker_id, 2, v_old_content)
    RETURNING id INTO v_old_version_id;

    UPDATE stickers SET
      content_markdown = p_new_content,
      current_version = 2
    WHERE id = p_sticker_id;

    new_version := 2;
    old_version_id := v_old_version_id;
  END IF;

  error_code := NULL;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to switch sticker version
CREATE OR REPLACE FUNCTION switch_sticker_version(
  p_sticker_id UUID,
  p_target_version INTEGER
)
RETURNS TABLE (
  content_markdown TEXT,
  error_code TEXT
) AS $$
DECLARE
  v_sticker RECORD;
  v_version_content TEXT;
BEGIN
  -- Validate target version
  IF p_target_version NOT IN (1, 2) THEN
    error_code := 'INVALID_VERSION';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Get sticker
  SELECT * INTO v_sticker FROM stickers WHERE id = p_sticker_id;
  IF v_sticker IS NULL THEN
    error_code := 'STICKER_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  -- If already on target version, return current content
  IF v_sticker.current_version = p_target_version THEN
    content_markdown := v_sticker.content_markdown;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Get version content
  SELECT sv.content_markdown INTO v_version_content
  FROM sticker_versions sv
  WHERE sv.sticker_id = p_sticker_id AND sv.version_number = p_target_version;

  IF v_version_content IS NULL THEN
    error_code := 'VERSION_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Swap: save current to version table, load target version
  -- Delete any existing entry for current version number
  DELETE FROM sticker_versions
  WHERE sticker_id = p_sticker_id AND version_number = v_sticker.current_version;

  -- Save current content to version table
  INSERT INTO sticker_versions (sticker_id, version_number, content_markdown)
  VALUES (p_sticker_id, v_sticker.current_version, v_sticker.content_markdown);

  -- Delete the version we're switching to (we're about to put it in stickers)
  DELETE FROM sticker_versions
  WHERE sticker_id = p_sticker_id AND version_number = p_target_version;

  -- Update sticker with target version content
  UPDATE stickers SET
    content_markdown = v_version_content,
    current_version = p_target_version
  WHERE id = p_sticker_id;

  content_markdown := v_version_content;
  error_code := NULL;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== TRIGGERS ====================

-- Update updated_at on auto_explain_sessions
CREATE TRIGGER update_auto_explain_sessions_updated_at
  BEFORE UPDATE ON auto_explain_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== CLEANUP FUNCTIONS ====================

-- Clean up stale sessions (inactive for >1 hour)
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    UPDATE auto_explain_sessions
    SET state = 'canceled'
    WHERE state = 'active'
      AND last_activity_at < NOW() - INTERVAL '1 hour'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_stale_sessions IS 'Cancel sessions inactive for >1 hour. Run periodically via cron.';
