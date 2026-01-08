import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'

interface RouteParams {
  params: { stickerId: string }
}

/**
 * PATCH /api/ai/stickers/:stickerId - Update sticker (e.g., toggle folded state)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    const body = await request.json()
    const { folded } = body

    if (typeof folded !== 'boolean') {
      return errors.invalidInput('folded must be a boolean')
    }

    // Verify sticker belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('stickers')
      .select('id')
      .eq('id', params.stickerId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return errors.notFound('Sticker')
    }

    // Update the sticker
    const { data: sticker, error } = await supabase
      .from('stickers')
      .update({ folded })
      .eq('id', params.stickerId)
      .select()
      .single()

    if (error) {
      console.error('Error updating sticker:', error)
      return errors.internalError()
    }

    return successResponse({
      id: sticker.id,
      folded: sticker.folded,
    })
  } catch {
    return errors.internalError()
  }
}

/**
 * DELETE /api/ai/stickers/:stickerId - Delete a sticker and its children
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Verify sticker belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('stickers')
      .select('id')
      .eq('id', params.stickerId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return errors.notFound('Sticker')
    }

    // Delete the sticker (cascade will delete children)
    const { error } = await supabase
      .from('stickers')
      .delete()
      .eq('id', params.stickerId)

    if (error) {
      console.error('Error deleting sticker:', error)
      return errors.internalError()
    }

    return successResponse({ message: 'Sticker deleted successfully' })
  } catch {
    return errors.internalError()
  }
}
