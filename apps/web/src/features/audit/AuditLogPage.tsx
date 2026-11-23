import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { adminApi, type AuditEventRecord } from '@/lib/api'

const PAGE_SIZE = 10

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function AuditLogPage() {
  const [events, setEvents] = useState<AuditEventRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminApi.audit({ page, pageSize: PAGE_SIZE, q, action, resourceType })
      setEvents(result.data)
      setTotal(result.meta.total)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load audit events')
    } finally {
      setLoading(false)
    }
  }, [page, q, action, resourceType])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Audit Log" description="Immutable trail of sensitive actions. Filter by actor, action, and resource." />
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row">
          <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="Search actor or resource..." />
          <input value={action} onChange={(event) => { setAction(event.target.value); setPage(1) }} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="Action (e.g. employee.create)" />
          <input value={resourceType} onChange={(event) => { setResourceType(event.target.value); setPage(1) }} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="Resource type" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Action</th><th className="px-5 py-3 font-medium">Actor</th><th className="px-5 py-3 font-medium">Resource</th><th className="px-5 py-3 font-medium">Request</th><th className="px-5 py-3 font-medium">Occurred</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-4 font-medium text-slate-900">{event.action}</td>
                  <td className="px-5 py-4 text-slate-600">{event.actor}</td>
                  <td className="px-5 py-4 text-slate-600">{event.resourceType}{event.resourceId ? ` · ${event.resourceId.slice(0, 8)}` : ''}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">{event.requestId ?? '—'}</td>
                  <td className="px-5 py-4 text-slate-500">{formatDate(event.occurredAt)}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">{loading ? 'Loading audit events...' : 'No audit events match your filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
          <div>{total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}</div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Prev</Button><Button variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next</Button></div>
        </div>
      </div>
    </div>
  )
}
