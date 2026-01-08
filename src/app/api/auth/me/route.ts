import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return errors.unauthorized()
    }

    return successResponse({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    })
  } catch {
    return errors.internalError()
  }
}
