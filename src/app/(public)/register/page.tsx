import { RegisterForm } from '@/features/auth/components/register-form'

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-secondary-50 px-4">
      <RegisterForm />
    </main>
  )
}

export const metadata = {
  title: 'Create account - StudentAid',
  description: 'Create your StudentAid account to start studying smarter',
}
