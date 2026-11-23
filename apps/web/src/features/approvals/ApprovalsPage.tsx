import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { approvalsApi, type ApprovalRecord } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function ApprovalsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<ApprovalRecord[]>([])
  const [scope, setScope] = useState<'inbox' | 'mine' | 'all'>('inbox')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [subject, setSubject] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await approvalsApi.list({ scope })
      setItems(result.data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load approvals')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { void load() }, [load])

  async function decide(id: string, decision: 'approved' | 'rejected') {
    try {
      await approvalsApi.decide(id, decision)
      toast.success(`Approval ${decision}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update approval')
    }
  }

  async function create() {
    try {
      await approvalsApi.create({
        type: 'generic',
        subjectType: 'request',
        subjectId: crypto.randomUUID(),
        steps: user ? [{ stepOrder: 1, approverUserId: user.id }] : [],
        metadata: { subject },
      })
      toast.success('Approval requested')
      setCreating(false)
      setSubject('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create approval')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflows"
        title="Approvals Inbox"
        description="Review and action pending approvals across leave, payroll, documents, and generic requests."
        action={<Button onClick={() => setCreating(true)}>New request</Button>}
      />
      <div className="flex gap-2">
        {(['inbox', 'mine', 'all'] as const).map((option) => (
          <Button key={option} variant={scope === option ? 'primary' : 'secondary'} onClick={() => setScope(option)}>
            {option === 'inbox' ? 'My inbox' : option === 'mine' ? 'Requested by me' : 'All'}
          </Button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500">
            <tr><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Subject</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Step</th><th className="px-5 py-3 font-medium">Requested</th><th className="px-5 py-3 font-medium">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-4 font-medium capitalize text-slate-900">{item.type}</td>
                <td className="px-5 py-4 text-slate-600">{item.subjectType} · {item.id.slice(0, 8)}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.status === 'pending' ? 'bg-amber-50 text-amber-700' : item.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.status}</span></td>
                <td className="px-5 py-4 text-slate-600">{item.currentStep}</td>
                <td className="px-5 py-4 text-slate-500">{new Date(item.requestedAt).toLocaleString()}</td>
                <td className="px-5 py-4">
                  {item.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => void decide(item.id, 'approved')}>Approve</Button>
                      <Button variant="ghost" onClick={() => void decide(item.id, 'rejected')}>Reject</Button>
                    </div>
                  ) : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{loading ? 'Loading approvals...' : 'No approvals found.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={creating} title="New approval request" onClose={() => setCreating(false)}>
        <div className="space-y-4">
          <input value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="What needs approval?" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={() => void create()} disabled={!subject.trim()}>Submit</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
