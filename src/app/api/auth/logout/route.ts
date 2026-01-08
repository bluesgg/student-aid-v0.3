import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'

export async function POST() {
  try {
    const supabase = createClient()

    const { error } = await supabase.auth.signOut()

    if (error) {
      return errors.internalError(error.message)
    }

    return successResponse({ message: 'Logged out successfully' })
  } catch {
    return errors.internalError()
  }
}
