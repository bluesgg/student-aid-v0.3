import { SupabaseClient } from '@supabase/supabase-js'
import {
  QuotaBucket,
  QuotaInfo,
  DEFAULT_QUOTA_LIMITS,
  ALL_QUOTA_BUCKETS,
  calculateNextResetDate,
} from './types'

export interface QuotaCheckResult {
  allowed: boolean
  quota: QuotaInfo
  bucket: QuotaBucket
}

export async function checkQuota(
  supabase: SupabaseClient,
  userId: string,
  bucket: QuotaBucket
): Promise<QuotaCheckResult> {
  // Get or create quota record
  const { data: quota, error } = await supabase
    .from('quotas')
    .select('*')
    .eq('user_id', userId)
    .eq('bucket', bucket)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = row not found
    console.error('Error checking quota:', error)
    throw new Error('Failed to check quota')
  }

  // If no quota record exists, create one
  if (!quota) {
    const resetAt = calculateNextResetDate(new Date())
    const newQuota = await createQuotaRecord(supabase, userId, bucket, resetAt)
    return {
      allowed: true,
      quota: {
        used: 0,
        limit: newQuota.limit,
        resetAt: newQuota.reset_at,
      },
      bucket,
    }
  }

  // Check if quota needs to be reset (on-demand fallback)
  const now = new Date()
  const resetAt = new Date(quota.reset_at)

  if (now >= resetAt) {
    // Reset the quota
    const newResetAt = calculateNextResetDate(now)
    const { data: updatedQuota, error: updateError } = await supabase
      .from('quotas')
      .update({
        used: 0,
        reset_at: newResetAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', quota.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error resetting quota:', updateError)
      throw new Error('Failed to reset quota')
    }

    return {
      allowed: true,
      quota: {
        used: 0,
        limit: updatedQuota.limit,
        resetAt: updatedQuota.reset_at,
      },
      bucket,
    }
  }

  // Check if quota is available
  const allowed = quota.used < quota.limit

  return {
    allowed,
    quota: {
      used: quota.used,
      limit: quota.limit,
      resetAt: quota.reset_at,
    },
    bucket,
  }
}

async function createQuotaRecord(
  supabase: SupabaseClient,
  userId: string,
  bucket: QuotaBucket,
  resetAt: Date
) {
  const limit = DEFAULT_QUOTA_LIMITS[bucket]

  const { data, error } = await supabase
    .from('quotas')
    .insert({
      user_id: userId,
      bucket,
      used: 0,
      limit,
      reset_at: resetAt.toISOString(),
    })
    .select()
    .single()

  if (error) {
    // Handle race condition - record might have been created by another request
    if (error.code === '23505') {
      // unique_violation
      const { data: existing } = await supabase
        .from('quotas')
        .select('*')
        .eq('user_id', userId)
        .eq('bucket', bucket)
        .single()

      if (existing) {
        return existing
      }
    }
    console.error('Error creating quota record:', error)
    throw new Error('Failed to create quota record')
  }

  return data
}

export async function getUserQuotas(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<QuotaBucket, QuotaInfo>> {
  const { data: quotas, error } = await supabase
    .from('quotas')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    console.error('Error fetching quotas:', error)
    throw new Error('Failed to fetch quotas')
  }

  const result: Partial<Record<QuotaBucket, QuotaInfo>> = {}

  for (const quota of quotas || []) {
    result[quota.bucket as QuotaBucket] = {
      used: quota.used,
      limit: quota.limit,
      resetAt: quota.reset_at,
    }
  }

  const defaultResetAt = calculateNextResetDate().toISOString()

  for (const bucket of ALL_QUOTA_BUCKETS) {
    if (!result[bucket]) {
      result[bucket] = {
        used: 0,
        limit: DEFAULT_QUOTA_LIMITS[bucket],
        resetAt: defaultResetAt,
      }
    }
  }

  return result as Record<QuotaBucket, QuotaInfo>
}
