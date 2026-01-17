'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppHeader } from '@/components/app-header'
import { LanguageSettingsTab } from '@/components/settings/language-settings-tab'
import { UsageTab } from '@/components/settings/usage-tab'
import type { Locale } from '@/i18n/config'

type TabId = 'language' | 'usage'

interface UserPreferences {
  ui_locale: Locale
  explain_locale: Locale
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const tNav = useTranslations('nav')
  const searchParams = useSearchParams()

  // Get initial tab from URL query param
  const initialTab = (searchParams.get('tab') as TabId) || 'language'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch('/api/user/preferences')
        if (!response.ok) {
          throw new Error('Failed to fetch preferences')
        }
        const data = await response.json()
        setPreferences(data.data.preferences)
      } catch (err) {
        console.error('Error fetching preferences:', err)
        setError('Failed to load preferences')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPreferences()
  }, [])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'language', label: t('tabs.language') },
    { id: 'usage', label: t('tabs.usage') },
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <AppHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <AppHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary-50">
      <AppHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-secondary-500">
            <li>
              <Link href="/courses" className="hover:text-secondary-700">
                {tNav('courses')}
              </Link>
            </li>
            <li>/</li>
            <li className="text-secondary-900">{t('title')}</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-secondary-900">{t('title')}</h1>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-secondary-200">
          {/* Tab buttons */}
          <div className="border-b border-secondary-200">
            <div className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-primary-600'
                      : 'text-secondary-600 hover:text-secondary-900'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="p-6">
            {activeTab === 'language' && preferences && (
              <LanguageSettingsTab
                initialUiLocale={preferences.ui_locale}
                initialExplainLocale={preferences.explain_locale}
              />
            )}
            {activeTab === 'usage' && <UsageTab />}
          </div>
        </div>
      </main>
    </div>
  )
}
