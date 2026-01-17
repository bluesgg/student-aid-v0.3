-- Migration: 007_auto_image_detection.sql
-- Add auto image detection support for click-to-explain feature

-- ==================== FILES TABLE MODIFICATIONS ====================

-- Add image extraction status tracking columns
ALTER TABLE files ADD COLUMN IF NOT EXISTS image_extraction_status TEXT DEFAULT 'pending';
-- Values: 'pending' | 'partial' | 'complete' | 'failed'

ALTER TABLE files ADD COLUMN IF NOT EXISTS image_extraction_progress INTEGER DEFAULT 0;
-- Number of pages with images extracted (for progress UI)

-- ==================== DETECTED IMAGES ====================

CREATE TABLE IF NOT EXISTS detected_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash TEXT NOT NULL,                    -- SHA-256 of PDF file
  page INTEGER NOT NULL,                     -- 1-indexed page number
  image_index INTEGER NOT NULL,              -- Order on page (0-indexed)
  rect JSONB NOT NULL,                       -- { x, y, width, height } normalized 0..1
  detection_method TEXT NOT NULL,            -- 'ops' | 'manual'
  pdf_type TEXT,                             -- 'ppt' | 'textbook' | null
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_detected_image UNIQUE(pdf_hash, page, image_index)
);

CREATE INDEX IF NOT EXISTS idx_detected_images_lookup
  ON detected_images(pdf_hash, page);

-- RLS Policies for detected_images
-- Note: detected_images are shared across users (by pdf_hash), so we use public read access
ALTER TABLE detected_images ENABLE ROW LEVEL SECURITY;

-- Anyone can read detected images (they're shared by PDF hash)
CREATE POLICY "Anyone can read detected images" ON detected_images
  FOR SELECT USING (true);

-- Only authenticated users can insert (via API)
CREATE POLICY "Authenticated users can insert detected images" ON detected_images
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ==================== IMAGE FEEDBACK ====================

CREATE TABLE IF NOT EXISTS image_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_image_id UUID REFERENCES detected_images(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL,               -- 'wrong_boundary' | 'missed_image' | 'false_positive'
  correct_rect JSONB,                        -- User-provided correction (if applicable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_feedback_image_id
  ON image_feedback(detected_image_id);

CREATE INDEX IF NOT EXISTS idx_image_feedback_user_id
  ON image_feedback(user_id);

-- RLS Policies for image_feedback
ALTER TABLE image_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback" ON image_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback" ON image_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);
