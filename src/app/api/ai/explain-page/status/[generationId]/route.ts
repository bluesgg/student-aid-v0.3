/**
 * GET /api/ai/explain-page/status/:generationId - Poll for sticker generation status
 * 
 * Returns:
 * - status: 'generating' | 'ready' | 'failed'
 * - stickers: Array of stickers (if ready)
 * - error: Error message (if failed)
 * - generationTimeMs: Time taken for generation (if ready)
 * 
 * Client should poll every 2 seconds until status != 'generating'
 * Maximum polling time: 5 minutes
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getGenerationStatus } from '@/lib/stickers/shared-cache'
import { z } from 'zod'

interface RouteParams {
  params: { generationId: string }
}

const uuidSchema = z.string().uuid()

/**
 * GET /api/ai/explain-page/status/:generationId
 * Poll for sticker generation status
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Validate generationId
    const parseResult = uuidSchema.safeParse(params.generationId)
    if (!parseResult.success) {
      return errors.invalidInput('Invalid generation ID format')
    }

    const generationId = params.generationId

    // Get generation status
    const statusResult = await getGenerationStatus(generationId)

    if (statusResult.status === 'generating') {
      // Still in progress
      return successResponse({
        status: 'generating',
        generationId,
        message: 'Sticker generation in progress',
        pollInterval: 2000,
      })
    }

    if (statusResult.status === 'failed') {
      // Generation failed
      return successResponse({
        status: 'failed',
        generationId,
        error: statusResult.error || 'Generation failed',
        message: 'Sticker generation failed. Quota has been refunded.',
      })
    }

    // Status is 'ready'
    const stickers = statusResult.stickers || []

    return successResponse({
      status: 'ready',
      generationId,
      stickers: formatStickers(stickers),
      generationTimeMs: statusResult.generationTimeMs,
      message: 'Stickers are ready',
    })

  } catch (error) {
    console.error('Status poll error:', error)
    return errors.internalError()
  }
}

/**
 * Format stickers for API response
 */
function formatStickers(stickers: unknown[]): Array<{
  id?: string
  type: string
  anchor: { textSnippet: string; rect: null }
  parentId: null
  contentMarkdown: string
  folded: boolean
  depth: number
}> {
  return (stickers as Array<{
    id?: string
    anchorText?: string
    anchor_text?: string
    explanation?: string
    content_markdown?: string
  }>).map((s, index) => ({
    id: s.id || `shared-${index}`,
    type: 'auto',
    anchor: {
      textSnippet: s.anchorText || s.anchor_text || 'Explanation',
      rect: null,
    },
    parentId: null,
    contentMarkdown: s.explanation || s.content_markdown || '',
    folded: false,
    depth: 0,
  }))
}
