import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { organizationApi, type DepartmentRecord } from '@/lib/api'

export function OrgChartPage() {
  const [departments, setDepartments] = useState<DepartmentRecord[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDepartments(await organizationApi.departments())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Core HR" title="Org Chart" description="Department structure and headcount distribution." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {departments.map((department) => (
          <div key={department.id} className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="text-base font-semibold text-slate-900">{department.name}</div>
            <div className="mt-1 text-sm text-slate-500">{department.code}</div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
              <span className="text-slate-500">Employees</span>
              <span className="font-semibold text-slate-900">{department.employees}</span>
            </div>
            <div className="mt-2 text-sm text-slate-600">Head: {department.head ?? 'Not assigned'}</div>
          </div>
        ))}
        {departments.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-white/90 p-10 text-center text-sm text-slate-500 backdrop-blur">
            {loading ? 'Loading organization data...' : 'No organization data available yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
