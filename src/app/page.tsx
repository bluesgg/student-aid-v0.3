import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary-600 mb-4">
          StudentAid
        </h1>
        <p className="text-lg text-secondary-600 mb-8">
          AI-Powered Study Assistant
        </p>
        <p className="text-secondary-500 mb-8">
          Your intelligent companion for learning and studying
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="px-6 py-3 bg-secondary-200 text-secondary-700 rounded-lg hover:bg-secondary-300 transition-colors"
          >
            Register
          </Link>
        </div>
      </div>
    </main>
  )
}
