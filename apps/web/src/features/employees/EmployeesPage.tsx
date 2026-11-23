import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/lib/auth'
import { employeesApi, organizationApi, type EmployeeRecord, type EmployeeStatus } from '@/lib/api'

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email required'),
  department: z.string().min(1, 'Department is required'),
  title: z.string().min(2, 'Job title is required'),
})
type FormValues = z.infer<typeof schema>

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  draft: 'Draft',
  onboarding: 'Onboarding',
  active: 'Active',
  on_leave: 'On Leave',
  suspended: 'Suspended',
  terminated: 'Terminated',
  archived: 'Archived',
}

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  'On Leave': 'bg-amber-50 text-amber-700 ring-amber-100',
  Onboarding: 'bg-brand-50 text-brand-700 ring-brand-100',
  Terminated: 'bg-red-50 text-red-700 ring-red-100',
  Draft: 'bg-slate-50 text-slate-700 ring-slate-100',
  Suspended: 'bg-orange-50 text-orange-700 ring-orange-100',
  Archived: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const SUMMARY_STATUSES: EmployeeStatus[] = ['active', 'onboarding', 'on_leave', 'terminated']

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed'
}

export function EmployeesPage() {
  const { hasPermission } = useAuth()
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | ''>('')
  const [sortBy, setSortBy] = useState<'name' | 'department' | 'status'>('name')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [confirmIds, setConfirmIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const pageSize = 10
  const canCreate = hasPermission('employees.create')
  const canManageStatus = hasPermission('employees.change_status')
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', department: '', title: '' },
  })

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const result = await employeesApi.list({
        page,
        pageSize,
        q: query,
        status: statusFilter || undefined,
        sortBy,
      })
      setEmployees(result.data)
      setTotal(result.meta.total)
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setLoading(false)
    }
  }, [page, query, statusFilter, sortBy])

  useEffect(() => {
    void loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    organizationApi
      .departments()
      .then((items) => setDepartments(items.map((item) => ({ id: item.id, name: item.name }))))
      .catch((error) => toast.error(messageOf(error)))
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const status of SUMMARY_STATUSES) result[status] = 0
    for (const employee of employees) {
      if (employee.status in result) result[employee.status] += 1
    }
    return result
  }, [employees])

  async function onCreate(values: FormValues) {
    const [firstName, ...rest] = values.name.trim().split(/\s+/)
    try {
      await employeesApi.create({
        firstName,
        lastName: rest.join(' ') || firstName,
        workEmail: values.email,
        departmentId: values.department,
        jobProfileTitle: values.title,
        status: 'onboarding',
      })
      toast.success('Employee created', { description: `${values.name} added.` })
      form.reset()
      setOpen(false)
      setPage(1)
      await loadEmployees()
    } catch (error) {
      toast.error(messageOf(error))
    }
  }

  async function confirmTerminate() {
    if (confirmIds.length === 0) return
    try {
      if (confirmIds.length === 1) {
        await employeesApi.changeStatus(confirmIds[0]!, 'terminated')
      } else {
        await employeesApi.bulkChangeStatus(confirmIds, 'terminated')
      }
      toast.success('Employee status updated')
      setConfirmIds([])
      setSelected([])
      await loadEmployees()
    } catch (error) {
      toast.error(messageOf(error))
    }
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? employees.map((employee) => employee.id) : [])
  }
  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Core HR" title="Employees" description="Manage employee records, status transitions, contracts, and documents." action={canCreate ? <Button onClick={() => setOpen(true)}>Add employee</Button> : undefined} />

      <div className="grid gap-4 sm:grid-cols-4">
        {SUMMARY_STATUSES.map((status) => (
          <div key={status} className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="text-sm text-slate-500">{STATUS_LABELS[status]}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{counts[status] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className="w-full max-w-sm rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="Search employees..." />
          <div className="flex flex-wrap gap-2">
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as EmployeeStatus | ''); setPage(1) }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <option value="">All statuses</option>
              {SUMMARY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <option value="name">Sort: Name</option>
              <option value="department">Sort: Department</option>
              <option value="status">Sort: Status</option>
            </select>
            {canManageStatus && selected.length > 0 && <Button variant="danger" onClick={() => setConfirmIds(selected)}>Terminate selected ({selected.length})</Button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-slate-500"><tr>
              <th className="px-5 py-3"><input type="checkbox" checked={employees.length > 0 && selected.length === employees.length} onChange={(event) => toggleAll(event.target.checked)} /></th>
              <th className="px-5 py-3 font-medium">Employee</th><th className="px-5 py-3 font-medium">Department</th><th className="px-5 py-3 font-medium">Title</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((employee) => {
                const name = [employee.firstName, employee.lastName].join(' ')
                const label = STATUS_LABELS[employee.status] ?? employee.status
                return (
                  <tr key={employee.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => toggleOne(employee.id)} /></td>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div><Link to={`/employees/${employee.id}`} className="font-medium text-slate-900 hover:text-brand-700">{name}</Link><div className="text-slate-500">{employee.workEmail ?? '—'} · {employee.employeeNumber}</div></div></div></td>
                    <td className="px-5 py-4 text-slate-600">{employee.departmentName ?? '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{employee.title ?? '—'}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[label] ?? 'bg-slate-50 text-slate-700 ring-slate-100'}`}>{label}</span></td>
                    <td className="px-5 py-4">{canManageStatus && employee.status !== 'terminated' ? <button onClick={() => setConfirmIds([employee.id])} className="text-sm font-medium text-red-600 hover:text-red-700">Terminate</button> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                )
              })}
              {employees.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">{loading ? 'Loading employees...' : 'No employees found.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
          <div>Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}</div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Prev</Button><Button variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next</Button></div>
        </div>
      </div>

      <Modal open={open} title="Add employee" onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onCreate)}>
          <Input label="Full name" {...form.register('name')} error={form.formState.errors.name?.message} />
          <Input label="Work email" type="email" {...form.register('email')} error={form.formState.errors.email?.message} />
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Department</span><select {...form.register('department')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:bg-white"><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>{form.formState.errors.department?.message && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.department.message}</span>}</label>
          <Input label="Job title" {...form.register('title')} error={form.formState.errors.title?.message} />
          <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create employee</Button></div>
        </form>
      </Modal>

      <Modal open={confirmIds.length > 0} title="Confirm status change" onClose={() => setConfirmIds([])}>
        <p className="text-sm text-slate-600">Mark {confirmIds.length === 1 ? 'this employee' : `${confirmIds.length} employees`} as terminated?</p>
        <div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => setConfirmIds([])}>Cancel</Button><Button variant="danger" onClick={confirmTerminate}>Confirm</Button></div>
      </Modal>
    </div>
  )
}
