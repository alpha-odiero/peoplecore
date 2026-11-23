import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { employeesApi, leaveApi, type LeaveBalanceRecord, type LeaveRequestRecord, type LeaveTypeRecord } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function LeavePage() {
  const { user } = useAuth()
  const [types, setTypes] = useState<LeaveTypeRecord[]>([])
  const [balances, setBalances] = useState<LeaveBalanceRecord[]>([])
  const [requests, setRequests] = useState<LeaveRequestRecord[]>([])
  const [employees, setEmployees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])
  const [employeeId, setEmployeeId] = useState('')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [typeRows, balanceRows, requestRows, employeeRows] = await Promise.all([
        leaveApi.types(),
        leaveApi.balances(),
        leaveApi.requests({}),
        employeesApi.list({ pageSize: 100 }),
      ])
      setTypes(typeRows)
      setBalances(balanceRows)
      setRequests(requestRows)
      setEmployees(employeeRows.data)
      setLeaveTypeId((current) => current || typeRows[0]?.id || '')
      setEmployeeId((current) => current || user?.employeeId || employeeRows.data[0]?.id || '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load leave data')
    } finally {
      setLoading(false)
    }
  }, [user?.employeeId])

  useEffect(() => { void load() }, [load])

  const summary = useMemo(() => ({
    allowance: balances.reduce((sum, row) => sum + row.allowanceDays, 0),
    used: balances.reduce((sum, row) => sum + row.usedDays, 0),
    pending: balances.reduce((sum, row) => sum + row.pendingDays, 0),
  }), [balances])

  async function submit() {
    try {
      await leaveApi.request({ employeeId, leaveTypeId, startDate, endDate, reason: reason || undefined })
      toast.success('Leave request submitted')
      setCreating(false)
      setStartDate('')
      setEndDate('')
      setReason('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit leave request')
    }
  }

  async function decide(id: string, decision: 'approved' | 'rejected') {
    try {
      await leaveApi.decide(id, decision)
      toast.success(`Leave ${decision}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update leave request')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Time & Leave" title="Leave Management" description="Leave balances, requests, and approvals." action={<Button onClick={() => setCreating(true)}>New leave request</Button>} />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Annual allowance', `${summary.allowance} days`],
          ['Used this year', `${summary.used} days`],
          ['Pending requests', `${summary.pending} days`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-900">Leave requests</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Employee</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Period</th><th className="px-5 py-3 font-medium">Days</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((request) => (
              <tr key={request.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-4 font-medium text-slate-900">{request.employee.firstName} {request.employee.lastName}</td>
                <td className="px-5 py-4 text-slate-600">{request.leaveType.name}</td>
                <td className="px-5 py-4 text-slate-600">{request.startDate.slice(0, 10)} → {request.endDate.slice(0, 10)}</td>
                <td className="px-5 py-4 text-slate-600">{request.days}</td>
                <td className="px-5 py-4 capitalize text-slate-600">{request.status}</td>
                <td className="px-5 py-4">
                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => void decide(request.id, 'approved')}>Approve</Button>
                      <Button variant="ghost" onClick={() => void decide(request.id, 'rejected')}>Reject</Button>
                    </div>
                  ) : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{loading ? 'Loading leave requests...' : 'No leave requests yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={creating} title="New leave request" onClose={() => setCreating(false)}>
        <div className="space-y-4">
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500">
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
          </select>
          <select value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500">
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" placeholder="Reason (optional)" rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={!employeeId || !leaveTypeId || !startDate || !endDate}>Submit request</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
