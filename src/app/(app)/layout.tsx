import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LanguageModalTrigger } from '@/components/language-modal-trigger'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <>
      {children}
      <LanguageModalTrigger />
    </>
  )
}
