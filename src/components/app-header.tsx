'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useLogout } from '@/features/auth/hooks/use-auth'

export function AppHeader() {
  const t = useTranslations('nav')
  const logout = useLogout()

  return (
    <header className="bg-white border-b border-secondary-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/courses" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary-600">StudentAid</span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/courses"
              className="text-sm text-secondary-600 hover:text-secondary-900"
            >
              {t('courses')}
            </Link>
            <Link
              href="/settings"
              className="text-sm text-secondary-600 hover:text-secondary-900"
            >
              {t('settings')}
            </Link>
            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="text-sm text-secondary-600 hover:text-secondary-900"
            >
              {t('signOut')}
            </button>
          </nav>
        </div>
      </div>
    </header>
  )
}
