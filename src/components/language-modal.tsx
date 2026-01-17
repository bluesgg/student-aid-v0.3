'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { localeNames, type Locale } from '@/i18n/config'

interface LanguageModalProps {
  onClose: () => void
}

export function LanguageModal({ onClose }: LanguageModalProps) {
  const t = useTranslations('languageModal')
  const tSettings = useTranslations('settings.language')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [uiLocale, setUiLocale] = useState<Locale>('en')
  const [explainLocale, setExplainLocale] = useState<Locale>('en')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSkip() {
    // Save defaults and close
    await savePreferences('en', 'en')
    onClose()
  }

  async function handleContinue() {
    await savePreferences(uiLocale, explainLocale)
    onClose()
    // Refresh if UI locale is not English
    if (uiLocale !== 'en') {
      router.refresh()
    }
  }

  async function savePreferences(ui: Locale, explain: Locale): Promise<boolean> {
    setIsSaving(true)
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ui_locale: ui,
          explain_locale: explain,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to save preferences:', response.status, errorData)
        return false
      }

      return true
    } catch (error) {
      console.error('Error saving preferences:', error)
      return false
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-secondary-900">{t('title')}</h2>
          <p className="text-sm text-secondary-600 mt-2">{t('description')}</p>
        </div>

        {/* Language selectors */}
        <div className="space-y-6">
          {/* UI Language */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-secondary-700">
              {tSettings('uiLanguage')}
            </label>
            <div className="flex gap-2">
              {(['en', 'zh'] as Locale[]).map((locale) => (
                <button
                  key={locale}
                  onClick={() => setUiLocale(locale)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    uiLocale === locale
                      ? 'bg-primary-600 text-white'
                      : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                  }`}
                >
                  {localeNames[locale]}
                </button>
              ))}
            </div>
          </div>

          {/* Explanation Language */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-secondary-700">
              {tSettings('explainLanguage')}
            </label>
            <div className="flex gap-2">
              {(['en', 'zh'] as Locale[]).map((locale) => (
                <button
                  key={locale}
                  onClick={() => setExplainLocale(locale)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    explainLocale === locale
                      ? 'bg-primary-600 text-white'
                      : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                  }`}
                >
                  {localeNames[locale]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSkip}
            disabled={isSaving}
            className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors"
          >
            {tCommon('skip')}
          </button>
          <button
            onClick={handleContinue}
            disabled={isSaving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            {isSaving ? tCommon('loading') : t('continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
