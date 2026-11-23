import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { adminApi, employeesApi, leaveApi, payrollApi, recruitingApi, type DashboardSummary } from '@/lib/api'

export function ReportsPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [headcount, setHeadcount] = useState(0)
  const [openPositions, setOpenPositions] = useState(0)
  const [leavePending, setLeavePending] = useState(0)
  const [payrollDraft, setPayrollDraft] = useState(0)
  const [averageBalance, setAverageBalance] = useState(0)

  const load = useCallback(async () => {
    const [dashboardResult, employeeResult, vacancyResult, leaveResult, balanceResult, payrollResult] = await Promise.allSettled([
      adminApi.dashboard(),
      employeesApi.list({ pageSize: 1 }),
      recruitingApi.vacancies(),
      leaveApi.requests({ status: 'pending' }),
      leaveApi.balances(),
      payrollApi.runs({ status: 'draft' }),
    ])
    if (dashboardResult.status === 'fulfilled') setSummary(dashboardResult.value)
    if (employeeResult.status === 'fulfilled') setHeadcount(employeeResult.value.meta.total)
    if (vacancyResult.status === 'fulfilled') setOpenPositions(vacancyResult.value.filter((row) => row.status === 'open').length)
    if (leaveResult.status === 'fulfilled') setLeavePending(leaveResult.value.length)
    if (balanceResult.status === 'fulfilled') {
      const rows = balanceResult.value
      setAverageBalance(rows.length ? Math.round((rows.reduce((sum, row) => sum + row.allowanceDays, 0) / rows.length) * 10) / 10 : 0)
    }
    if (payrollResult.status === 'fulfilled') setPayrollDraft(payrollResult.value.length)
  }, [])

  useEffect(() => { void load() }, [load])

  const cards = [
    ['Headcount', String(headcount)],
    ['Open positions', String(openPositions)],
    ['Pending leave', String(leavePending)],
    ['Draft payroll runs', String(payrollDraft)],
    ['Avg leave allowance', `${averageBalance} days`],
    ['Audit events (24h)', String(summary?.auditEvents24h ?? 0)],
  ]

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Reports & Analytics" description="Headcount, leave, recruiting, payroll, and audit indicators." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
        <div className="mb-4 text-sm font-semibold text-slate-900">Recent activity</div>
        <div className="divide-y divide-slate-100">
          {(summary?.recentActivity ?? []).map((event) => (
            <div key={event.id} className="flex items-center justify-between py-3 text-sm">
              <div><span className="font-medium text-slate-900">{event.action}</span> <span className="text-slate-500">on {event.resourceType}</span></div>
              <div className="text-xs text-slate-400">{new Date(event.occurredAt).toLocaleString()}</div>
            </div>
          ))}
          {!summary?.recentActivity.length && <div className="py-8 text-center text-sm text-slate-500">No activity available.</div>}
        </div>
      </div>
    </div>
  )
}
