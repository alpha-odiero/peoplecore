import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { approvalsApi, leaveApi, payrollApi, recruitingApi, type ApprovalRecord, type LeaveRequestRecord, type PayrollRunRecord } from '@/lib/api'

type Task = { id: string; title: string; detail: string; to: string; due: string }

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])

  const load = useCallback(async () => {
    const [approvalResult, leaveResult, payrollResult, applicationResult] = await Promise.allSettled([
      approvalsApi.list({ scope: 'inbox', status: 'pending' }),
      leaveApi.requests({ status: 'pending' }),
      payrollApi.runs({ status: 'draft' }),
      recruitingApi.applications({}),
    ])
    const next: Task[] = []
    if (approvalResult.status === 'fulfilled') {
      next.push(...approvalResult.value.data.map((row: ApprovalRecord) => ({
        id: `approval-${row.id}`,
        title: `Approve ${row.type} request`,
        detail: row.subjectType,
        to: '/approvals',
        due: row.requestedAt,
      })))
    }
    if (leaveResult.status === 'fulfilled') {
      next.push(...leaveResult.value.map((row: LeaveRequestRecord) => ({
        id: `leave-${row.id}`,
        title: 'Review leave request',
        detail: `${row.startDate.slice(0, 10)} → ${row.endDate.slice(0, 10)}`,
        to: '/leave',
        due: row.startDate,
      })))
    }
    if (payrollResult.status === 'fulfilled') {
      next.push(...payrollResult.value.data.map((row: PayrollRunRecord) => ({
        id: `payroll-${row.id}`,
        title: 'Approve payroll run',
        detail: `${row.periodStart.slice(0, 10)} → ${row.periodEnd.slice(0, 10)}`,
        to: '/payroll',
        due: row.periodEnd,
      })))
    }
    if (applicationResult.status === 'fulfilled') {
      next.push(...applicationResult.value.filter((row) => row.stage !== 'hired').map((row) => ({
        id: `application-${row.id}`,
        title: `Advance ${row.candidate.firstName} ${row.candidate.lastName}`,
        detail: row.vacancy.title,
        to: '/recruiting',
        due: row.appliedAt,
      })))
    }
    setTasks(next)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Workflows" title="Tasks & Reminders" description="Pending work collected from approvals, leave, payroll, and recruiting." />
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="divide-y divide-slate-100">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-sm font-medium text-slate-900">{task.title}</div>
                <div className="text-xs text-slate-500">{task.detail} · {new Date(task.due).toLocaleString()}</div>
              </div>
              <Link className="text-sm font-medium text-brand-600 hover:text-brand-700" to={task.to}>Open</Link>
            </div>
          ))}
          {tasks.length === 0 && <div className="px-5 py-12 text-center text-sm text-slate-500">No pending tasks or reminders.</div>}
        </div>
      </div>
    </div>
  )
}
