import { LoginForm } from '@/features/auth/components/login-form'

interface LoginPageProps {
  searchParams: { error?: string; redirect?: string }
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-secondary-50 px-4">
      <LoginForm defaultError={searchParams.error} />
    </main>
  )
}

export const metadata = {
  title: 'Sign in - StudentAid',
  description: 'Sign in to your StudentAid account',
}
