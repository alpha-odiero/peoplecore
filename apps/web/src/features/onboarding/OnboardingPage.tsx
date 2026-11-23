import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { contractsApi, employeesApi, recruitingApi, type EmployeeRecord } from '@/lib/api'

export function OnboardingPage() {
  const [onboarding, setOnboarding] = useState<EmployeeRecord[]>([])
  const [hires, setHires] = useState<number>(0)
  const [contractCounts, setContractCounts] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    const [employeeResult, applicationResult] = await Promise.allSettled([
      employeesApi.list({ status: 'onboarding', pageSize: 100 }),
      recruitingApi.applications({ stage: 'hired' }),
    ])
    if (employeeResult.status === 'fulfilled') {
      const rows = employeeResult.value.data
      setOnboarding(rows)
      const counts: Record<string, number> = {}
      await Promise.all(rows.map(async (row) => {
        const contracts = await contractsApi.list(row.id).catch(() => ({ data: [] }))
        counts[row.id] = contracts.data.length
      }))
      setContractCounts(counts)
    }
    if (applicationResult.status === 'fulfilled') setHires(applicationResult.value.length)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Talent" title="Onboarding / Offboarding" description="Employees currently onboarding and completed hires." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur"><div className="text-sm text-slate-500">Onboarding employees</div><div className="mt-2 text-3xl font-bold text-slate-900">{onboarding.length}</div></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur"><div className="text-sm text-slate-500">Completed hires</div><div className="mt-2 text-3xl font-bold text-slate-900">{hires}</div></div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Employee</th><th className="px-5 py-3 font-medium">Number</th><th className="px-5 py-3 font-medium">Contracts</th><th className="px-5 py-3 font-medium">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {onboarding.map((employee) => (
              <tr key={employee.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-4 font-medium text-slate-900">{employee.firstName} {employee.lastName}</td>
                <td className="px-5 py-4 text-slate-600">{employee.employeeNumber}</td>
                <td className="px-5 py-4 text-slate-600">{contractCounts[employee.id] ?? 0}</td>
                <td className="px-5 py-4 capitalize text-slate-600">{employee.status}</td>
              </tr>
            ))}
            {onboarding.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">No employees in onboarding.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
