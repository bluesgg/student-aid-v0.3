import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { switchVersion, getStickerWithVersions } from '@/lib/stickers/version-manager'
import { z } from 'zod'

/**
 * Request schema for version switch
 */
const switchSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
})

/**
 * GET /api/ai/explain-page/sticker/[stickerId]/version
 * Get sticker with all version info
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { stickerId: string } }
) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Get sticker to verify ownership
    const { data: sticker, error: stickerError } = await supabase
      .from('stickers')
      .select('user_id')
      .eq('id', params.stickerId)
      .single()

    if (stickerError || !sticker) {
      return errors.notFound('Sticker')
    }

    if (sticker.user_id !== user.id) {
      return errors.notFound('Sticker')
    }

    // Get full sticker with versions
    const stickerWithVersions = await getStickerWithVersions(params.stickerId)

    if (!stickerWithVersions) {
      return errors.notFound('Sticker')
    }

    return successResponse({
      sticker: {
        id: stickerWithVersions.id,
        currentVersion: stickerWithVersions.currentVersion,
        contentMarkdown: stickerWithVersions.contentMarkdown,
        totalVersions: stickerWithVersions.versions.length + 1, // Include current
        versions: stickerWithVersions.versions.map((v) => ({
          version: v.versionNumber,
          contentMarkdown: v.contentMarkdown,
          createdAt: v.createdAt,
        })),
        page: stickerWithVersions.page,
        anchorText: stickerWithVersions.anchorText,
        pageRange: stickerWithVersions.pageRange,
      },
    })
  } catch (error) {
    console.error('Error getting sticker versions:', error)
    return errors.internalError()
  }
}

/**
 * PATCH /api/ai/explain-page/sticker/[stickerId]/version
 * Switch to a different sticker version
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { stickerId: string } }
) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Get sticker to verify ownership
    const { data: sticker, error: stickerError } = await supabase
      .from('stickers')
      .select('user_id, current_version')
      .eq('id', params.stickerId)
      .single()

    if (stickerError || !sticker) {
      return errors.notFound('Sticker')
    }

    if (sticker.user_id !== user.id) {
      return errors.notFound('Sticker')
    }

    // Parse request body
    const body = await request.json()
    const parseResult = switchSchema.safeParse(body)

    if (!parseResult.success) {
      return errors.invalidInput('version must be 1 or 2')
    }

    const { version: targetVersion } = parseResult.data

    // Check if already on target version
    if (sticker.current_version === targetVersion) {
      return successResponse({
        ok: true,
        message: 'Already on requested version',
        currentVersion: targetVersion,
      })
    }

    // Switch version
    const result = await switchVersion(params.stickerId, targetVersion)

    if (!result.success) {
      if (result.error === 'VERSION_NOT_FOUND') {
        return errors.custom(
          'VERSION_NOT_FOUND',
          'Requested version does not exist',
          404
        )
      }
      return errors.custom('SWITCH_ERROR', result.error, 500)
    }

    return successResponse({
      ok: true,
      currentVersion: result.currentVersion,
      contentMarkdown: result.contentMarkdown,
    })
  } catch (error) {
    console.error('Error switching sticker version:', error)
    return errors.internalError()
  }
}
