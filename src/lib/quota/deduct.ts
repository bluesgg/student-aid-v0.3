import { SupabaseClient } from '@supabase/supabase-js'
import { QuotaBucket, QuotaInfo, DEFAULT_QUOTA_LIMITS, calculateNextResetDate } from './types'

export interface DeductResult {
  success: boolean
  quota: QuotaInfo
}

export async function deductQuota(
  supabase: SupabaseClient,
  userId: string,
  bucket: QuotaBucket
): Promise<DeductResult> {
  // Use an atomic increment to avoid race conditions
  const { data, error } = await supabase.rpc('increment_quota_used', {
    p_user_id: userId,
    p_bucket: bucket,
  })

  if (error) {
    // If the RPC doesn't exist, fall back to manual update
    // 42883 = PostgreSQL "function does not exist"
    // PGRST202 = PostgREST "function not found in schema cache"
    if (error.code === '42883' || error.code === 'PGRST202') {
      return fallbackDeductQuota(supabase, userId, bucket)
    }
    console.error('Error deducting quota:', error)
    throw new Error('Failed to deduct quota')
  }

  return {
    success: true,
    quota: {
      used: data.used,
      limit: data.limit,
      resetAt: data.reset_at,
    },
  }
}

async function fallbackDeductQuota(
  supabase: SupabaseClient,
  userId: string,
  bucket: QuotaBucket
): Promise<DeductResult> {
  // First, try to get the existing quota
  const { data: existing, error: fetchError } = await supabase
    .from('quotas')
    .select('*')
    .eq('user_id', userId)
    .eq('bucket', bucket)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error fetching quota for deduction:', fetchError)
    throw new Error('Failed to fetch quota')
  }

  // If no quota exists, create one and deduct
  if (!existing) {
    const resetAt = calculateNextResetDate()

    const { data: created, error: createError } = await supabase
      .from('quotas')
      .insert({
        user_id: userId,
        bucket,
        used: 1,
        limit: DEFAULT_QUOTA_LIMITS[bucket],
        reset_at: resetAt.toISOString(),
      })
      .select()
      .single()

    if (createError) {
      // Handle race condition
      if (createError.code === '23505') {
        return fallbackDeductQuota(supabase, userId, bucket)
      }
      throw new Error('Failed to create quota record')
    }

    return {
      success: true,
      quota: {
        used: created.used,
        limit: created.limit,
        resetAt: created.reset_at,
      },
    }
  }

  // Update existing quota
  const { data: updated, error: updateError } = await supabase
    .from('quotas')
    .update({
      used: existing.used + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select()
    .single()

  if (updateError) {
    console.error('Error updating quota:', updateError)
    throw new Error('Failed to deduct quota')
  }

  return {
    success: true,
    quota: {
      used: updated.used,
      limit: updated.limit,
      resetAt: updated.reset_at,
    },
  }
}

export async function conditionalDeductQuota(
  supabase: SupabaseClient,
  userId: string,
  bucket: QuotaBucket,
  tokensReceived: boolean
): Promise<DeductResult | null> {
  if (!tokensReceived) {
    // Don't deduct if no tokens were received
    const { data } = await supabase
      .from('quotas')
      .select('*')
      .eq('user_id', userId)
      .eq('bucket', bucket)
      .single()

    if (data) {
      return {
        success: false,
        quota: {
          used: data.used,
          limit: data.limit,
          resetAt: data.reset_at,
        },
      }
    }

    return null
  }

  return deductQuota(supabase, userId, bucket)
}
