import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'StudentAid - AI-Powered Study Assistant',
  description:
    'Upload your course materials, get AI-powered explanations, and study smarter with interactive annotations.',
  keywords: ['study', 'education', 'AI', 'PDF', 'notes', 'learning'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
