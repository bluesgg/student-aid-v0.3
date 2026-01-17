import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET_NAME = 'course-files'

export function generateStorageKey(
  userId: string,
  courseId: string,
  filename: string
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `${userId}/${courseId}/${Date.now()}_${sanitized}`
}

export async function uploadFile(
  supabase: SupabaseClient,
  storageKey: string,
  file: Buffer,
  contentType = 'application/pdf'
): Promise<{ path: string } | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storageKey, file, { contentType, upsert: false })

  if (error) {
    console.error('Storage upload error:', error)
    return null
  }
  return data
}

export async function deleteFile(
  supabase: SupabaseClient,
  storageKey: string
): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([storageKey])
  if (error) {
    console.error('Storage delete error:', error)
    return false
  }
  return true
}

export async function deleteFiles(
  supabase: SupabaseClient,
  storageKeys: string[]
): Promise<boolean> {
  if (storageKeys.length === 0) return true

  const { error } = await supabase.storage.from(BUCKET_NAME).remove(storageKeys)
  if (error) {
    console.error('Storage bulk delete error:', error)
    return false
  }
  return true
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  storageKey: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storageKey, expiresIn)

  if (error) {
    console.error('Error creating signed URL:', error)
    return null
  }
  return data.signedUrl
}
