-- Migration: 003_add_selection_hash_to_shared_auto_stickers.sql
-- Add selection_hash column to shared_auto_stickers for image region selection feature
-- This enables caching of user-selected image region explanations with proper cache isolation.
--
-- Key changes:
--   1. Add selection_hash column (nullable for backward compatibility)
--   2. Update effective_mode constraint to allow 'with_selected_images'
--   3. Create partial unique indexes for selection vs non-selection cache entries
--   4. Update prompt_version to '2026-01-12.2' for new feature

-- ==================== ADD SELECTION_HASH COLUMN ====================

ALTER TABLE shared_auto_stickers
ADD COLUMN IF NOT EXISTS selection_hash VARCHAR(64) NULL;

COMMENT ON COLUMN shared_auto_stickers.selection_hash IS 
  'SHA-256 hash of sorted selection geometry (page, rect) for cache isolation. NULL for non-selection modes.';

-- ==================== UPDATE EFFECTIVE_MODE CONSTRAINT ====================

-- Drop existing constraint and recreate with new mode
ALTER TABLE shared_auto_stickers
DROP CONSTRAINT IF EXISTS check_mode_format;

ALTER TABLE shared_auto_stickers
ADD CONSTRAINT check_mode_format 
CHECK (effective_mode IN ('text_only', 'with_images', 'with_selected_images'));

-- ==================== UPDATE UNIQUE INDEXES ====================

-- Drop the existing unique index (it doesn't account for selection_hash)
DROP INDEX IF EXISTS unique_sticker_cache_key;

-- Create partial unique index for legacy rows (non-selection modes, selection_hash IS NULL)
-- This ensures backward compatibility - existing cache entries continue to work
CREATE UNIQUE INDEX unique_sticker_cache_key_legacy
  ON shared_auto_stickers(pdf_hash, page, prompt_version, locale, effective_mode)
  WHERE status IN ('generating', 'ready') AND selection_hash IS NULL;

-- Create partial unique index for selection rows (selection_hash IS NOT NULL)
-- This ensures selection-based cache entries are isolated by their geometry hash
CREATE UNIQUE INDEX unique_sticker_cache_key_selection
  ON shared_auto_stickers(pdf_hash, page, prompt_version, locale, effective_mode, selection_hash)
  WHERE status IN ('generating', 'ready') AND selection_hash IS NOT NULL;

-- Index for selection_hash lookups (when checking cache with selection)
CREATE INDEX IF NOT EXISTS idx_shared_stickers_selection_hash
  ON shared_auto_stickers(selection_hash)
  WHERE selection_hash IS NOT NULL;

-- ==================== UPDATE TABLE COMMENT ====================

COMMENT ON TABLE shared_auto_stickers IS 
  'Shared cache for auto-generated stickers. Supports both page-level and selection-based caching. Current prompt_version: 2026-01-12.2. Bump version when: prompt template changes, output structure changes, or key strategy changes.';

-- ==================== MIGRATION NOTES ====================
-- 
-- Backward Compatibility:
-- - selection_hash is nullable; existing rows remain unaffected
-- - Legacy unique index pattern preserved for non-selection modes
-- - No data migration needed; existing cache entries continue to work
--
-- Rollback:
-- If needed, run these commands:
--   DROP INDEX IF EXISTS unique_sticker_cache_key_selection;
--   DROP INDEX IF EXISTS unique_sticker_cache_key_legacy;
--   DROP INDEX IF EXISTS idx_shared_stickers_selection_hash;
--   CREATE UNIQUE INDEX unique_sticker_cache_key
--     ON shared_auto_stickers(pdf_hash, page, prompt_version, locale, effective_mode)
--     WHERE status IN ('generating', 'ready');
--   ALTER TABLE shared_auto_stickers DROP CONSTRAINT check_mode_format;
--   ALTER TABLE shared_auto_stickers ADD CONSTRAINT check_mode_format 
--     CHECK (effective_mode IN ('text_only', 'with_images'));
--   ALTER TABLE shared_auto_stickers DROP COLUMN selection_hash;
