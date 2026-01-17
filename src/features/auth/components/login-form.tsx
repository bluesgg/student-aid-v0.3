'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLogin, useResendConfirmation } from '../hooks/use-auth'
import { ApiClientError } from '@/lib/api-client'

interface LoginFormProps {
  defaultError?: string | null
}

export function LoginForm({ defaultError }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showResend, setShowResend] = useState(false)
  const [resendEmail, setResendEmail] = useState('')

  const login = useLogin()
  const resendConfirmation = useResendConfirmation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate(
      { email, password },
      {
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === 'EMAIL_NOT_CONFIRMED') {
            setShowResend(true)
            setResendEmail(email)
          }
        },
      }
    )
  }

  const handleResend = async () => {
    resendConfirmation.mutate({ email: resendEmail })
  }

  const ERROR_MESSAGES: Record<string, string> = {
    verification_failed: 'Email verification failed or link expired. Please try again.',
    session_expired: 'Your session has expired. Please sign in again.',
    link_expired: 'The verification link has expired. Please request a new one.',
  }

  function getErrorMessage(): string | null {
    if (defaultError && ERROR_MESSAGES[defaultError]) {
      return ERROR_MESSAGES[defaultError]
    }
    if (login.error) {
      const isEmailNotConfirmed = login.error instanceof ApiClientError && login.error.code === 'EMAIL_NOT_CONFIRMED'
      return isEmailNotConfirmed ? 'Please verify your email before logging in.' : login.error.message
    }
    return null
  }

  const errorMessage = getErrorMessage()
  const showResendForError =
    defaultError === 'verification_failed' || defaultError === 'link_expired'

  return (
    <div className="w-full max-w-md">
      <div className="card">
        <h1 className="text-2xl font-bold text-center mb-6">Sign in</h1>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {errorMessage}
          </div>
        )}

        {resendConfirmation.isSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Confirmation email has been resent. Please check your inbox.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-secondary-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-secondary-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="btn-primary w-full"
          >
            {login.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {(showResend || showResendForError) && (
          <div className="mt-4 pt-4 border-t border-secondary-200">
            <p className="text-sm text-secondary-600 mb-2">
              Didn&apos;t receive the email?
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                className="input flex-1"
                placeholder="Enter your email"
              />
              <button
                onClick={handleResend}
                disabled={resendConfirmation.isPending || !resendEmail}
                className="btn-secondary"
              >
                {resendConfirmation.isPending ? 'Sending...' : 'Resend'}
              </button>
            </div>
            {resendConfirmation.error && (
              <p className="text-red-600 text-sm mt-2">
                {resendConfirmation.error.message}
              </p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-secondary-600">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
