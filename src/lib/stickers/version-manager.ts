/**
 * Sticker Version Manager
 * Handles version creation, switching, and circular replacement.
 * Maximum 2 versions per sticker.
 */

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Version entry
 */
export interface StickerVersion {
  versionNumber: number
  contentMarkdown: string
  createdAt: string
}

/**
 * Sticker with version info
 */
export interface StickerWithVersions {
  id: string
  currentVersion: number
  contentMarkdown: string
  versions: StickerVersion[]
  pageRange: unknown | null
  page: number
  anchorText: string
}

/**
 * Create a new sticker version.
 * Uses circular replacement:
 * - 1st refresh: current becomes v1, new becomes current (v2)
 * - 2nd refresh: v1 deleted, v2→v1, new becomes current (v2)
 * - Subsequent: same as 2nd refresh
 *
 * @param stickerId - Sticker ID
 * @param newContent - New explanation content
 * @returns Result with new version info
 */
export async function createVersion(
  stickerId: string,
  newContent: string
): Promise<
  | { success: true; newVersion: number; sticker: StickerWithVersions }
  | { success: false; error: string }
> {
  const supabase = createAdminClient()

  // Use database function for atomic version creation
  const { data, error } = await supabase.rpc('create_sticker_version', {
    p_sticker_id: stickerId,
    p_new_content: newContent,
  })

  if (error) {
    console.error('Error creating sticker version:', error)
    return { success: false, error: 'DATABASE_ERROR' }
  }

  const result = data?.[0]
  if (result?.error_code) {
    return { success: false, error: result.error_code }
  }

  // Fetch updated sticker with versions
  const sticker = await getStickerWithVersions(stickerId)
  if (!sticker) {
    return { success: false, error: 'STICKER_NOT_FOUND' }
  }

  return {
    success: true,
    newVersion: result.new_version,
    sticker,
  }
}

/**
 * Switch to a different sticker version
 *
 * @param stickerId - Sticker ID
 * @param targetVersion - Version number to switch to (1 or 2)
 * @returns Updated sticker content
 */
export async function switchVersion(
  stickerId: string,
  targetVersion: 1 | 2
): Promise<
  | { success: true; contentMarkdown: string; currentVersion: number }
  | { success: false; error: string }
> {
  const supabase = createAdminClient()

  // Use database function for atomic version switching
  const { data, error } = await supabase.rpc('switch_sticker_version', {
    p_sticker_id: stickerId,
    p_target_version: targetVersion,
  })

  if (error) {
    console.error('Error switching sticker version:', error)
    return { success: false, error: 'DATABASE_ERROR' }
  }

  const result = data?.[0]
  if (result?.error_code) {
    return { success: false, error: result.error_code }
  }

  return {
    success: true,
    contentMarkdown: result.content_markdown,
    currentVersion: targetVersion,
  }
}

/**
 * Get sticker with all version info
 */
export async function getStickerWithVersions(
  stickerId: string
): Promise<StickerWithVersions | null> {
  const supabase = createAdminClient()

  // Get sticker
  const { data: sticker, error: stickerError } = await supabase
    .from('stickers')
    .select('*')
    .eq('id', stickerId)
    .single()

  if (stickerError || !sticker) {
    return null
  }

  // Get versions
  const { data: versions } = await supabase
    .from('sticker_versions')
    .select('*')
    .eq('sticker_id', stickerId)
    .order('version_number', { ascending: true })

  const versionList: StickerVersion[] = (versions || []).map((v) => ({
    versionNumber: v.version_number,
    contentMarkdown: v.content_markdown,
    createdAt: v.created_at,
  }))

  return {
    id: sticker.id,
    currentVersion: sticker.current_version || 1,
    contentMarkdown: sticker.content_markdown,
    versions: versionList,
    pageRange: sticker.page_range,
    page: sticker.page,
    anchorText: sticker.anchor_text,
  }
}

/**
 * Get version count for a sticker
 */
export async function getVersionCount(stickerId: string): Promise<number> {
  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('sticker_versions')
    .select('*', { count: 'exact', head: true })
    .eq('sticker_id', stickerId)

  if (error) {
    return 0
  }

  // Include current version
  return (count || 0) + 1
}

/**
 * Check if sticker can be refreshed (has version management enabled)
 * Stickers with page_range use the cross-page accumulation strategy
 */
export async function canRefresh(stickerId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('stickers')
    .select('page_range, type')
    .eq('id', stickerId)
    .single()

  if (error || !data) {
    return false
  }

  // Can refresh auto stickers (both with and without page_range)
  return data.type === 'auto'
}

/**
 * Delete all versions for a sticker (used when deleting sticker)
 */
export async function deleteAllVersions(stickerId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('sticker_versions')
    .delete()
    .eq('sticker_id', stickerId)

  return !error
}
