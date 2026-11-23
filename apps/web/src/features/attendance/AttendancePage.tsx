import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { attendanceApi, employeesApi, type AttendanceRecord } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function AttendancePage() {
  const { user } = useAuth()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [employees, setEmployees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])
  const [employeeId, setEmployeeId] = useState('')
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, employeeRows] = await Promise.all([
        attendanceApi.list({ from: today, to: today }),
        employeesApi.list({ pageSize: 100 }),
      ])
      setRecords(rows)
      setEmployees(employeeRows.data)
      setEmployeeId((current) => current || user?.employeeId || employeeRows.data[0]?.id || '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load attendance')
    } finally {
      setLoading(false)
    }
  }, [today, user?.employeeId])

  useEffect(() => { void load() }, [load])

  async function clock(action: 'in' | 'out') {
    try {
      if (action === 'in') await attendanceApi.clockIn({ employeeId })
      else await attendanceApi.clockOut({ employeeId })
      toast.success(`Clocked ${action}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to clock ${action}`)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Time & Leave" title="Attendance" description="Clock in and out and review today's records." />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center">
        <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500">
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
        </select>
        <Button onClick={() => void clock('in')} disabled={!employeeId}>Clock in</Button>
        <Button variant="secondary" onClick={() => void clock('out')} disabled={!employeeId}>Clock out</Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Employee</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Clock in</th><th className="px-5 py-3 font-medium">Clock out</th><th className="px-5 py-3 font-medium">Source</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-4 font-medium text-slate-900">{record.employee.firstName} {record.employee.lastName}</td>
                <td className="px-5 py-4 text-slate-600">{record.workDate.slice(0, 10)}</td>
                <td className="px-5 py-4 text-slate-600">{record.clockIn ? new Date(record.clockIn).toLocaleTimeString() : '—'}</td>
                <td className="px-5 py-4 text-slate-600">{record.clockOut ? new Date(record.clockOut).toLocaleTimeString() : '—'}</td>
                <td className="px-5 py-4 capitalize text-slate-500">{record.source}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">{loading ? 'Loading attendance...' : 'No attendance records for today.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
