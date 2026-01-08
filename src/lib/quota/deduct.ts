/**
 * Quota deduction utilities.
 * Atomically decrements quota after successful AI operations.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { QuotaBucket, QuotaInfo, DEFAULT_QUOTA_LIMITS } from './types'

export interface DeductResult {
  success: boolean
  quota: QuotaInfo
}

/**
 * Atomically deduct 1 from a user's quota.
 * Returns the updated quota info.
 */
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
    if (error.code === '42883') {
      // function does not exist
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

/**
 * Fallback deduction method using standard update.
 * Less safe against race conditions but works without custom RPC.
 */
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
    const resetAt = new Date()
    resetAt.setMonth(resetAt.getMonth() + 1)
    resetAt.setHours(0, 0, 0, 0)

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

/**
 * Deduct quota only if tokens were received (for streaming responses).
 * Call this after confirming at least one token was received.
 */
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
