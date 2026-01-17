import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'

/**
 * GET /api/ai/stickers - Get stickers for a file
 * Query params: fileId (required), page (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    const searchParams = request.nextUrl.searchParams
    const fileId = searchParams.get('fileId')
    const page = searchParams.get('page')

    if (!fileId) {
      return errors.invalidInput('fileId is required')
    }

    // Build query
    let query = supabase
      .from('stickers')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    // Filter by page if specified
    if (page) {
      query = query.eq('page', parseInt(page, 10))
    }

    const { data: stickers, error } = await query

    if (error) {
      console.error('Error fetching stickers:', error)
      return errors.internalError()
    }

    // Transform to API format
    const items = (stickers || []).map((s) => {
      // Check if anchor_rect contains extended anchor structure (with anchors array)
      const anchorRect = s.anchor_rect as { anchors?: unknown[]; x?: number; y?: number; width?: number; height?: number } | null
      const hasExtendedAnchor = anchorRect?.anchors && Array.isArray(anchorRect.anchors)

      // Build anchor object
      const anchor = hasExtendedAnchor
        ? {
            textSnippet: s.anchor_text,
            rect: null,
            anchors: anchorRect!.anchors,
          }
        : {
            textSnippet: s.anchor_text,
            // Legacy format: anchor_rect is a simple rect object
            rect: anchorRect && 'x' in anchorRect ? anchorRect : null,
          }

      return {
        id: s.id,
        type: s.type,
        page: s.page,
        anchor,
        parentId: s.parent_id,
        contentMarkdown: s.content_markdown,
        folded: s.folded,
        depth: s.depth,
        createdAt: s.created_at,
      }
    })

    return successResponse({ items })
  } catch {
    return errors.internalError()
  }
}
