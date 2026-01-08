'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/app-header'
import { useTokenStats } from '@/features/usage/hooks/use-token-stats'
import { QuotaOverview } from '@/features/usage/components/quota-overview'
import { TokenUsageChart } from '@/features/usage/components/token-usage-chart'
import { CostBreakdown } from '@/features/usage/components/cost-breakdown'
import { EstimatedMonthlyCost } from '@/features/usage/components/estimated-monthly-cost'
import { ResetDateDisplay } from '@/features/usage/components/reset-date-display'

export default function UsagePage() {
  const { data, isLoading, error, refetch } = useTokenStats()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <svg
              className="mx-auto w-12 h-12 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-red-600 mt-4 mb-4">Failed to load usage data</p>
            <button onClick={() => refetch()} className="btn-primary">
              Try Again
            </button>
          </div>
        </main>
      </div>
    )
  }

  // Transform operations to quota format for QuotaOverview
  const quotas = data.operations.map((op) => ({
    bucket: op.bucket,
    used: op.used,
    limit: getDefaultLimit(op.bucket),
  }))

  return (
    <div className="min-h-screen bg-secondary-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-secondary-500">
            <li>
              <Link href="/courses" className="hover:text-secondary-700">
                Courses
              </Link>
            </li>
            <li>/</li>
            <li className="text-secondary-900">Usage & Billing</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-secondary-900">Usage & Billing</h1>
          <p className="text-secondary-600 mt-1">
            Monitor your AI usage, token consumption, and estimated costs
          </p>
        </div>

        {/* Main grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Main stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Estimated cost card */}
            <EstimatedMonthlyCost
              currentCost={data.costs.currentPeriod}
              currentCostFormatted={data.costs.currentPeriodFormatted}
              projectedCost={data.costs.projectedMonthly}
              projectedCostFormatted={data.costs.projectedMonthlyFormatted}
              warningLevel={data.costs.warningLevel}
              daysElapsed={data.period.daysElapsed}
              daysRemaining={data.period.daysRemaining}
            />

            {/* Token usage chart */}
            <TokenUsageChart
              totalInput={data.tokens.totalInput}
              totalOutput={data.tokens.totalOutput}
              total={data.tokens.total}
            />

            {/* Cost breakdown */}
            <CostBreakdown operations={data.operations} totalCost={data.costs.currentPeriod} />
          </div>

          {/* Right column - Quotas and period */}
          <div className="space-y-6">
            {/* Reset date info */}
            <ResetDateDisplay
              nextResetDate={data.period.nextResetDate}
              daysRemaining={data.period.daysRemaining}
              daysElapsed={data.period.daysElapsed}
              registrationDay={data.period.registrationDay}
            />

            {/* Quota overview */}
            <QuotaOverview quotas={quotas} />
          </div>
        </div>

        {/* Info section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-blue-500 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-900">About Usage Tracking</h4>
              <p className="text-sm text-blue-700 mt-1">
                Usage is tracked monthly from your registration date. Quotas reset automatically on
                your monthly anniversary. Costs shown are estimates based on average token usage per
                operation and current OpenAI pricing.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// Default limits per bucket (should match API defaults)
function getDefaultLimit(bucket: string): number {
  const limits: Record<string, number> = {
    learningInteractions: 150,
    documentSummary: 10,
    sectionSummary: 30,
    courseSummary: 6,
    autoExplain: 100,
  }
  return limits[bucket] ?? 0
}
