import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { adminApi, type AuditEventRecord } from '@/lib/api'

export function ActivityFeedPage() {
  const [events, setEvents] = useState<AuditEventRecord[]>([])
  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminApi.audit({ page, pageSize: 30, action: action || undefined, resourceType: resourceType || undefined })
      setEvents(result.data)
    } finally {
      setLoading(false)
    }
  }, [action, page, resourceType])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Overview" title="Activity Feed" description="Recent changes across modules with actor, action, target, and time." />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur sm:flex-row">
        <input value={action} onChange={(event) => { setPage(1); setAction(event.target.value) }} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" placeholder="Filter by action" />
        <input value={resourceType} onChange={(event) => { setPage(1); setResourceType(event.target.value) }} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" placeholder="Filter by resource" />
        <Button variant="secondary" onClick={() => void load()}>Apply</Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Action</th><th className="px-5 py-3 font-medium">Target</th><th className="px-5 py-3 font-medium">Actor</th><th className="px-5 py-3 font-medium">Time</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-4 font-medium text-slate-900">{event.action}</td>
                <td className="px-5 py-4 text-slate-600">{event.resourceType}{event.resourceId ? ` · ${event.resourceId.slice(0, 8)}` : ''}</td>
                <td className="px-5 py-4 text-slate-600">{event.actor}</td>
                <td className="px-5 py-4 text-slate-500">{new Date(event.occurredAt).toLocaleString()}</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">{loading ? 'Loading activity...' : 'No activity found.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</Button>
        <span className="text-sm text-slate-500">Page {page}</span>
        <Button variant="secondary" onClick={() => setPage((current) => current + 1)} disabled={events.length < 30}>Next</Button>
      </div>
    </div>
  )
}
