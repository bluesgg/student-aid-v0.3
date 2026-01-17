/**
 * User preferences helper functions.
 * Handles fetching and updating user language and display preferences.
 */

import { createClient } from '@/lib/supabase/server'

// ==================== Types ====================

export type Locale = 'en' | 'zh'

export interface UserPreferences {
  user_id: string
  ui_locale: Locale
  explain_locale: Locale
  created_at: string
  updated_at: string
}

export interface UpdatePreferencesInput {
  ui_locale?: Locale
  explain_locale?: Locale
}

// ==================== Default Values ====================

const DEFAULT_PREFERENCES: Pick<UserPreferences, 'ui_locale' | 'explain_locale'> = {
  ui_locale: 'en',
  explain_locale: 'en',
}

// ==================== Helper Functions ====================

/**
 * Get user preferences. Creates default preferences if none exist.
 * Returns null if user is not authenticated.
 */
export async function getUserPreferences(
  userId: string
): Promise<UserPreferences | null> {
  const supabase = createClient()

  // Try to fetch existing preferences
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is expected for new users
    console.error('Error fetching user preferences:', error)
    return null
  }

  return data as UserPreferences | null
}

/**
 * Get user preferences, creating defaults if none exist.
 * This is the primary function for getting preferences in app code.
 */
export async function getOrCreateUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const existing = await getUserPreferences(userId)

  if (existing) {
    return existing
  }

  // Create default preferences for new user
  const supabase = createClient()
  const { data, error } = await supabase
    .from('user_preferences')
    .insert({
      user_id: userId,
      ...DEFAULT_PREFERENCES,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating user preferences:', error)
    // Return synthetic default preferences on error
    return {
      user_id: userId,
      ...DEFAULT_PREFERENCES,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  return data as UserPreferences
}

/**
 * Update user preferences. Creates the record if it doesn't exist (upsert).
 */
export async function updateUserPreferences(
  userId: string,
  updates: UpdatePreferencesInput
): Promise<UserPreferences | null> {
  const supabase = createClient()

  // Use upsert to create or update in a single operation
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        ui_locale: updates.ui_locale ?? 'en',
        explain_locale: updates.explain_locale ?? 'en',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('Error upserting user preferences:', error)
    return null
  }

  return data as UserPreferences
}

/**
 * Check if user has existing preferences (used for first-login detection).
 * Returns true if preferences exist, false for new users.
 */
export async function hasUserPreferences(userId: string): Promise<boolean> {
  const preferences = await getUserPreferences(userId)
  return preferences !== null
}

/**
 * Shorthand to get user's explanation locale for AI routes.
 */
export async function getUserExplainLocale(userId: string): Promise<Locale> {
  const preferences = await getOrCreateUserPreferences(userId)
  return preferences.explain_locale
}

/**
 * Shorthand to get user's UI locale.
 */
export async function getUserUiLocale(userId: string): Promise<Locale> {
  const preferences = await getOrCreateUserPreferences(userId)
  return preferences.ui_locale
}

/**
 * Get localized system prompt addition based on explain_locale.
 * Appends language instruction to base prompt.
 */
export function getLocalizedSystemPrompt(
  basePrompt: string,
  locale: Locale
): string {
  if (locale === 'zh') {
    return `${basePrompt}\n\nIMPORTANT: You must respond in Simplified Chinese (简体中文). All explanations, examples, and text should be in Chinese.`
  }
  // Default English - no additional instruction needed
  return basePrompt
}
