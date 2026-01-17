'use client'

import { useQuery } from '@tanstack/react-query'
import { get, isApiError } from '@/lib/api-client'
import type { Locale } from '@/i18n/config'

interface UserPreferences {
  user_id: string
  ui_locale: Locale
  explain_locale: Locale
}

interface UserPreferencesResponse {
  preferences: UserPreferences
  isNewUser: boolean
}

/**
 * Hook for fetching user preferences
 */
export function useUserPreferences() {
  return useQuery({
    queryKey: ['userPreferences'],
    queryFn: async () => {
      const result = await get<UserPreferencesResponse>('/api/user/preferences')
      if (isApiError(result)) {
        // Return defaults on error
        return {
          preferences: {
            user_id: '',
            ui_locale: 'en' as Locale,
            explain_locale: 'en' as Locale,
          },
          isNewUser: false,
        }
      }
      return result.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook for getting just the explain locale
 */
export function useExplainLocale(): Locale {
  const { data } = useUserPreferences()
  return data?.preferences.explain_locale ?? 'en'
}
