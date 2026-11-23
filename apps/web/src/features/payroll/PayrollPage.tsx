import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { employeesApi, formatMoney, payrollApi, type PayrollRunRecord } from '@/lib/api'

const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)

export function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRunRecord[]>([])
  const [rule, setRule] = useState('')
  const [structures, setStructures] = useState<Array<{ id: string }>>([])
  const [employees, setEmployees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])
  const [creating, setCreating] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [baseSalaryMinor, setBaseSalaryMinor] = useState('50000000')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [runRows, ruleResult, structureRows, employeeRows] = await Promise.all([
        payrollApi.runs({}),
        payrollApi.rule(),
        payrollApi.structures(),
        employeesApi.list({ pageSize: 100 }),
      ])
      setRuns(runRows)
      setRule(ruleResult.formula)
      setStructures(structureRows)
      setEmployees(employeeRows.data)
      setEmployeeId((current) => current || employeeRows.data[0]?.id || '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load payroll')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function createStructure() {
    try {
      await payrollApi.createStructure({ employeeId, currency: 'USD', baseSalaryMinor, effectiveFrom: monthStart })
      toast.success('Salary structure saved')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save salary structure')
    }
  }

  async function createRun() {
    try {
      await payrollApi.createRun({ periodStart: monthStart, periodEnd: monthEnd, currency: 'USD', taxRateBps: 1000 })
      toast.success('Payroll run created')
      setCreating(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create payroll run')
    }
  }

  async function approve(id: string) {
    try {
      await payrollApi.approve(id)
      toast.success('Payroll run approved')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to approve payroll run')
    }
  }

  const latest = runs[0]

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Payroll & Compensation" title="Payroll" description="Salary structures, payroll runs, approvals, and payslips." action={<Button onClick={() => setCreating(true)}>New payroll run</Button>} />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Current period', `${monthStart.slice(0, 7)}`],
          ['Salary structures', String(structures.length)],
          ['Latest gross', latest ? formatMoney(latest.totalGrossMinor, latest.currency) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-sm text-slate-600 shadow-sm backdrop-blur">
        <div className="font-medium text-slate-900">Calculation rule</div>
        <div className="mt-1">{rule || 'Loading...'}</div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
        <div className="mb-4 text-sm font-semibold text-slate-900">Add salary structure</div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500">
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
          </select>
          <input value={baseSalaryMinor} onChange={(event) => setBaseSalaryMinor(event.target.value)} className="w-48 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" placeholder="Base (minor)" />
          <Button variant="secondary" onClick={() => void createStructure()} disabled={!employeeId || !/^\d+$/.test(baseSalaryMinor)}>Save structure</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Period</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Gross</th><th className="px-5 py-3 font-medium">Deductions</th><th className="px-5 py-3 font-medium">Net</th><th className="px-5 py-3 font-medium">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-4 text-slate-700">{run.periodStart.slice(0, 10)} → {run.periodEnd.slice(0, 10)}</td>
                <td className="px-5 py-4 capitalize text-slate-600">{run.status}</td>
                <td className="px-5 py-4 text-slate-600">{formatMoney(run.totalGrossMinor, run.currency)}</td>
                <td className="px-5 py-4 text-slate-600">{formatMoney(run.totalDeductionsMinor, run.currency)}</td>
                <td className="px-5 py-4 font-medium text-slate-900">{formatMoney(run.totalNetMinor, run.currency)}</td>
                <td className="px-5 py-4">{run.status === 'draft' ? <Button variant="secondary" onClick={() => void approve(run.id)}>Approve</Button> : <span className="text-slate-400">—</span>}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{loading ? 'Loading payroll runs...' : 'No payroll runs yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={creating} title="Create payroll run" onClose={() => setCreating(false)}>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Period: {monthStart} → {monthEnd}<br />Currency: USD · Tax: 10%</div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={() => void createRun()}>Create run</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
