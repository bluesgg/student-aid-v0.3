'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { localeNames, type Locale } from '@/i18n/config'
import { useToast } from '@/components/toast'

interface LanguageSettingsTabProps {
  initialUiLocale: Locale
  initialExplainLocale: Locale
}

export function LanguageSettingsTab({
  initialUiLocale,
  initialExplainLocale,
}: LanguageSettingsTabProps) {
  const t = useTranslations('settings.language')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const { addToast } = useToast()

  const [uiLocale, setUiLocale] = useState<Locale>(initialUiLocale)
  const [explainLocale, setExplainLocale] = useState<Locale>(initialExplainLocale)
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges = uiLocale !== initialUiLocale || explainLocale !== initialExplainLocale

  async function handleSave() {
    setIsSaving(true)
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ui_locale: uiLocale,
          explain_locale: explainLocale,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save preferences')
      }

      addToast({ type: 'success', title: t('saveSuccess') })

      // Refresh the page if UI locale changed
      if (uiLocale !== initialUiLocale) {
        router.refresh()
      }
    } catch (error) {
      console.error('Error saving preferences:', error)
      addToast({ type: 'error', title: t('saveError') })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-secondary-900">{t('title')}</h3>
        <p className="text-sm text-secondary-600 mt-1">{t('description')}</p>
      </div>

      {/* UI Language */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-secondary-700">
          {t('uiLanguage')}
        </label>
        <p className="text-xs text-secondary-500">{t('uiLanguageDescription')}</p>
        <div className="flex gap-2 mt-2">
          {(['en', 'zh'] as Locale[]).map((locale) => (
            <button
              key={locale}
              onClick={() => setUiLocale(locale)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
          {t('explainLanguage')}
        </label>
        <p className="text-xs text-secondary-500">{t('explainLanguageDescription')}</p>
        <div className="flex gap-2 mt-2">
          {(['en', 'zh'] as Locale[]).map((locale) => (
            <button
              key={locale}
              onClick={() => setExplainLocale(locale)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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

      {/* Save button */}
      {hasChanges && (
        <div className="pt-4 border-t border-secondary-200">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary"
          >
            {isSaving ? tCommon('loading') : tCommon('save')}
          </button>
        </div>
      )}
    </div>
  )
}
