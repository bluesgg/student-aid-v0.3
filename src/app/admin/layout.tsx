/**
 * Admin Layout
 *
 * Standalone layout for admin pages.
 * Does NOT require normal user authentication - uses ADMIN_SECRET instead.
 */

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-900">
      {children}
    </div>
  )
}
