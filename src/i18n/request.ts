import { getRequestConfig } from 'next-intl/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { defaultLocale, locales, type Locale } from './config'

/**
 * Get messages for a locale
 */
async function getMessages(locale: Locale) {
  try {
    return (await import(`./messages/${locale}.json`)).default
  } catch {
    // Fallback to English if locale file is missing
    return (await import('./messages/en.json')).default
  }
}

/**
 * Get user's preferred UI locale from database
 */
async function getUserLocale(): Promise<Locale> {
  try {
    const cookieStore = cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return defaultLocale
    }

    // Fetch user's UI locale preference
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('ui_locale')
      .eq('user_id', user.id)
      .maybeSingle()

    const userLocale = preferences?.ui_locale as Locale | undefined

    // Validate that it's a supported locale
    if (userLocale && locales.includes(userLocale)) {
      return userLocale
    }

    return defaultLocale
  } catch (error) {
    console.error('Error getting user locale:', error)
    return defaultLocale
  }
}

/**
 * Request configuration for next-intl.
 * This runs on every request to determine the locale and load messages.
 */
export default getRequestConfig(async () => {
  const locale = await getUserLocale()

  return {
    locale,
    messages: await getMessages(locale),
  }
})
