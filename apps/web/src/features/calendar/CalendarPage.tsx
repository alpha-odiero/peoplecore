import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { leaveApi, performanceApi, recruitingApi } from '@/lib/api'

type CalendarEvent = { id: string; title: string; date: string; kind: string }

export function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])

  const load = useCallback(async () => {
    const [leaveResult, applicationResult, cycleResult] = await Promise.allSettled([
      leaveApi.requests({ status: 'approved' }),
      recruitingApi.applications({}),
      performanceApi.cycles(),
    ])
    const next: CalendarEvent[] = []
    if (leaveResult.status === 'fulfilled') {
      next.push(...leaveResult.value.map((row) => ({
        id: `leave-${row.id}`,
        title: `${row.employee.firstName} ${row.employee.lastName} · ${row.leaveType.name}`,
        date: row.startDate,
        kind: 'Leave',
      })))
    }
    if (applicationResult.status === 'fulfilled') {
      for (const application of applicationResult.value) {
        for (const interview of application.interviews) {
          next.push({
            id: `interview-${interview.id}`,
            title: `${application.candidate.firstName} ${application.candidate.lastName} · ${application.vacancy.title}`,
            date: interview.scheduledAt,
            kind: 'Interview',
          })
        }
      }
    }
    if (cycleResult.status === 'fulfilled') {
      next.push(...cycleResult.value.map((row) => ({
        id: `cycle-${row.id}`,
        title: `${row.name} ends`,
        date: row.endDate,
        kind: 'Performance',
      })))
    }
    next.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    setEvents(next)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Workflows" title="Calendar" description="Unified view of leave, interviews, and performance cycles." />
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="divide-y divide-slate-100">
          {events.map((event) => (
            <div key={event.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="w-20 text-sm font-medium text-brand-600">{new Date(event.date).toLocaleDateString()}</div>
                <div>
                  <div className="text-sm font-medium text-slate-900">{event.title}</div>
                  <div className="text-xs text-slate-500">{event.kind}</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">{new Date(event.date).toLocaleTimeString()}</div>
            </div>
          ))}
          {events.length === 0 && <div className="px-5 py-12 text-center text-sm text-slate-500">No calendar events yet.</div>}
        </div>
      </div>
    </div>
  )
}
