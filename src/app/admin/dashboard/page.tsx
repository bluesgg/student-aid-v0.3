'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useAdminAnalytics } from '@/features/admin/hooks/use-admin-analytics'
import { useAdminMetrics } from '@/features/admin/hooks/use-admin-metrics'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

type TimeRange = 7 | 30 | 90

export default function AdminDashboardPage() {
  const router = useRouter()
  const [adminSecret, setAdminSecret] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange>(30)

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_secret')
    if (!stored) {
      router.push('/admin')
      return
    }
    setAdminSecret(stored)
  }, [router])

  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useAdminAnalytics(timeRange, adminSecret)

  const {
    data: metricsData,
    isLoading: metricsLoading,
  } = useAdminMetrics('day', adminSecret)

  const handleLogout = () => {
    sessionStorage.removeItem('admin_secret')
    router.push('/admin')
  }

  if (!adminSecret) {
    return null
  }

  const isLoading = analyticsLoading || metricsLoading

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading dashboard...
        </div>
      </div>
    )
  }

  if (analyticsError) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Failed to load analytics data</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  const overview = analyticsData?.overview
  const metrics = metricsData?.metrics
  const workerHealth = metricsData?.workerHealth
  const cacheEfficiency = metricsData?.cacheEfficiency

  // Calculate alerts
  const alerts: Array<{ type: 'error' | 'warning' | 'info'; message: string }> = []

  if (workerHealth && !workerHealth.isHealthy) {
    alerts.push({ type: 'error', message: 'Worker is unhealthy - jobs may be stuck' })
  }
  if (workerHealth && workerHealth.stuckJobs > 0) {
    alerts.push({ type: 'warning', message: `${workerHealth.stuckJobs} stuck jobs detected` })
  }
  if (analyticsData?.errors?.total && analyticsData.errors.total > 0) {
    const errorRate = overview
      ? (analyticsData.errors.total / (analyticsData.operations?.distribution?.reduce((sum, op) => sum + op.count, 0) || 1)) * 100
      : 0
    if (errorRate > 5) {
      alerts.push({ type: 'error', message: `High error rate: ${errorRate.toFixed(1)}%` })
    } else if (errorRate > 1) {
      alerts.push({ type: 'warning', message: `Error rate: ${errorRate.toFixed(1)}%` })
    }
  }
  if (overview && overview.totalCost > 100) {
    alerts.push({ type: 'warning', message: `High cost in period: $${overview.totalCost.toFixed(2)}` })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-400 text-sm">StudentAid Analytics</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Time range selector */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              {([7, 30, 90] as TimeRange[]).map((days) => (
                <button
                  key={days}
                  onClick={() => setTimeRange(days)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === days
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`px-4 py-3 rounded-lg flex items-center gap-3 ${
                  alert.type === 'error'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : alert.type === 'warning'
                      ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                      : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                {alert.message}
              </div>
            ))}
          </div>
        )}

        {/* Overview cards - Row 1: Users & Content */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
          <MetricCard title="Total Users" value={overview?.totalUsers || 0} />
          <MetricCard title="Total Courses" value={overview?.totalCourses || 0} />
          <MetricCard title="Total Files" value={overview?.totalFiles || 0} />
          <MetricCard title="Total Stickers" value={overview?.totalStickers || 0} />
          <MetricCard title="Q&A Interactions" value={overview?.totalQAInteractions || 0} />
          <MetricCard title="Summaries" value={overview?.totalSummaries || 0} />
        </div>

        {/* Overview cards - Row 2: Cost & Tokens */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
          <MetricCard
            title="Total Cost"
            value={`$${(overview?.totalCost || 0).toFixed(2)}`}
            subtitle={`${timeRange}d period`}
          />
          <MetricCard
            title="Input Tokens"
            value={formatNumber(overview?.totalInputTokens || 0)}
          />
          <MetricCard
            title="Output Tokens"
            value={formatNumber(overview?.totalOutputTokens || 0)}
          />
          <MetricCard
            title="Total Pages"
            value={formatNumber(analyticsData?.pdfStats?.totalPages || 0)}
            subtitle="All PDFs"
          />
          <MetricCard
            title="Avg Pages/File"
            value={analyticsData?.pdfStats?.avgPagesPerFile || 0}
          />
          <MetricCard
            title="Context Entries"
            value={overview?.totalContextEntries || 0}
          />
        </div>

        {/* Overview cards - Row 3: Period Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Files Uploaded"
            value={analyticsData?.pdfStats?.filesInPeriod || 0}
            subtitle={`Last ${timeRange}d`}
          />
          <MetricCard
            title="Q&A in Period"
            value={analyticsData?.qaStats?.inPeriod || 0}
            subtitle={`Last ${timeRange}d`}
          />
          <MetricCard
            title="Scanned PDFs"
            value={analyticsData?.pdfStats?.scannedFiles || 0}
            subtitle="Total"
          />
          <MetricCard
            title="Error Count"
            value={analyticsData?.errors?.total || 0}
            subtitle={`Last ${timeRange}d`}
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Active Users Chart */}
          <ChartCard title="Active Users">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData?.activeUsers?.byDay || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  tickFormatter={(value) => value.slice(5)}
                />
                <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8 }}
                  labelStyle={{ color: '#F3F4F6' }}
                />
                <Line
                  type="monotone"
                  dataKey="active_users"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  name="Active Users"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Operations Distribution */}
          <ChartCard title="Operations Distribution">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData?.operations?.distribution as Array<{ operation_type: string; count: number; unique_users: number }> || []}
                  dataKey="count"
                  nameKey="operation_type"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {(analyticsData?.operations?.distribution || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Error Distribution */}
          <ChartCard title="Error Distribution">
            {analyticsData?.errors?.distribution && analyticsData.errors.distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analyticsData.errors.distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="error_code"
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8 }}
                  />
                  <Bar dataKey="count" fill="#EF4444" name="Errors" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No errors in this period
              </div>
            )}
          </ChartCard>

          {/* Token Usage */}
          <ChartCard title="Token Usage">
            <div className="h-[300px] flex flex-col justify-center">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">Input Tokens</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {formatNumber(overview?.totalInputTokens || 0)}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">Output Tokens</p>
                  <p className="text-2xl font-bold text-green-400">
                    {formatNumber(overview?.totalOutputTokens || 0)}
                  </p>
                </div>
              </div>
              <div className="mt-4 bg-gray-800 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Estimated Cost</p>
                <p className="text-3xl font-bold text-yellow-400">
                  ${(overview?.totalCost || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Performance metrics */}
        {metrics && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <ChartCard title="Cache Performance">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Hit Rate</span>
                  <span className="text-xl font-bold text-green-400">
                    {(metrics.cacheHitRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-green-500 h-3 rounded-full"
                    style={{ width: `${metrics.cacheHitRate * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Hits</p>
                    <p className="text-white font-medium">{metrics.cacheHits}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Misses</p>
                    <p className="text-white font-medium">{metrics.cacheMisses}</p>
                  </div>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Generation Stats">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Success Rate</span>
                  <span className="text-xl font-bold text-green-400">
                    {(metrics.successRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Successful</p>
                    <p className="text-green-400 font-medium">{metrics.successfulGenerations}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Failed</p>
                    <p className="text-red-400 font-medium">{metrics.failedGenerations}</p>
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Total Generations</p>
                  <p className="text-white font-medium">{metrics.totalGenerations}</p>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Latency (ms)">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg</span>
                  <span className="text-white font-medium">{metrics.avgLatencyMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">P50</span>
                  <span className="text-white font-medium">{metrics.p50LatencyMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">P95</span>
                  <span className="text-yellow-400 font-medium">{metrics.p95LatencyMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">P99</span>
                  <span className="text-red-400 font-medium">{metrics.p99LatencyMs}ms</span>
                </div>
              </div>
            </ChartCard>
          </div>
        )}

        {/* Worker Health */}
        {workerHealth && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ChartCard title="Worker Health">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      workerHealth.isHealthy ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className={workerHealth.isHealthy ? 'text-green-400' : 'text-red-400'}>
                    {workerHealth.isHealthy ? 'Healthy' : 'Unhealthy'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Pending Jobs</p>
                    <p className="text-white font-medium">{workerHealth.pendingJobs}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Stuck Jobs</p>
                    <p
                      className={`font-medium ${workerHealth.stuckJobs > 0 ? 'text-red-400' : 'text-white'}`}
                    >
                      {workerHealth.stuckJobs}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Avg Duration</p>
                    <p className="text-white font-medium">{workerHealth.avgJobDuration}ms</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Last Run</p>
                    <p className="text-white font-medium text-xs">
                      {workerHealth.lastRunAt
                        ? new Date(workerHealth.lastRunAt).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            </ChartCard>

            {cacheEfficiency && (
              <ChartCard title="Cache Efficiency">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Canonical Docs</p>
                      <p className="text-white font-medium">{cacheEfficiency.totalCanonicalDocs}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Shared Stickers</p>
                      <p className="text-white font-medium">{cacheEfficiency.totalSharedStickers}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Avg References</p>
                      <p className="text-white font-medium">
                        {cacheEfficiency.avgReferencesPerDoc.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Cost Savings</p>
                      <p className="text-green-400 font-medium">
                        ${cacheEfficiency.estimatedCostSavings.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </ChartCard>
            )}
          </div>
        )}

        {/* Operations Table */}
        <ChartCard title="Operations by Type">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-3">Operation</th>
                  <th className="pb-3 text-right">Count</th>
                  <th className="pb-3 text-right">Unique Users</th>
                </tr>
              </thead>
              <tbody>
                {(analyticsData?.operations?.distribution || []).map((op, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-3">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      {op.operation_type}
                    </td>
                    <td className="py-3 text-right">{op.count.toLocaleString()}</td>
                    <td className="py-3 text-right">{op.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </main>
    </div>
  )
}

// Helper components
function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string
  value: string | number
  subtitle?: string
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-medium text-white mb-4">{title}</h3>
      {children}
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}
