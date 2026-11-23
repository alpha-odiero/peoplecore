import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { StatCard } from '@/components/ui/StatCard'
import { adminApi, type DashboardSummary } from '@/lib/api'
import { useAuth } from '@/lib/auth'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function DashboardPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    adminApi
      .dashboard()
      .then(setSummary)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to load dashboard'))
  }, [])

  const stats = [
    { label: 'Total Employees', value: String(summary?.totalEmployees ?? '—'), detail: 'Across all departments', tone: 'blue' as const },
    { label: 'Active Employees', value: String(summary?.activeEmployees ?? '—'), detail: 'Currently active', tone: 'green' as const },
    { label: 'Active Departments', value: String(summary?.activeDepartments ?? '—'), detail: 'Currently operating', tone: 'blue' as const },
    { label: 'Pending Approvals', value: String(summary?.pendingApprovals ?? '—'), detail: 'Awaiting your review', tone: 'amber' as const },
    { label: 'Pending Leave', value: String(summary?.pendingLeaveRequests ?? '—'), detail: 'Awaiting decision', tone: 'amber' as const },
    { label: 'Attendance Today', value: String(summary?.attendanceToday ?? '—'), detail: 'Records today', tone: 'green' as const },
    { label: 'Open Positions', value: String(summary?.openPositions ?? '—'), detail: 'Active requisitions', tone: 'blue' as const },
    { label: 'Audit Events (24h)', value: String(summary?.auditEvents24h ?? '—'), detail: 'Recorded actions', tone: 'slate' as const },
  ]

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-brand-200/40 bg-gradient-to-r from-slate-900 via-slate-800 to-brand-900 p-6 text-white shadow-xl shadow-slate-900/10 sm:p-8">
        <div className="relative">
          <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 ring-1 ring-white/15">Workspace</div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Here is what is happening across your organization today.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
          <div className="mt-4 space-y-3">
            {!summary || summary.recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">No recent activity to display.</p>
            ) : summary.recentActivity.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{event.action}</div>
                  <div className="text-xs text-slate-500">{event.actor} · {event.resourceType}</div>
                </div>
                <div className="shrink-0 text-xs text-slate-400">{formatDate(event.occurredAt)}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Getting started</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="rounded-lg bg-slate-50 px-3 py-2">Create departments and organization structure.</li>
            <li className="rounded-lg bg-slate-50 px-3 py-2">Add employees and set up their profiles.</li>
            <li className="rounded-lg bg-slate-50 px-3 py-2">Review the audit log and assign roles.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
