import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/lib/auth'
import { organizationApi, type DepartmentRecord } from '@/lib/api'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  head: z.string().trim().optional(),
})

export function DepartmentsPage() {
  const { hasPermission } = useAuth()
  const [departments, setDepartments] = useState<DepartmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const form = useForm<{ name: string; head?: string }>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', head: '' },
  })
  const canCreate = hasPermission('departments.create')
  const canUpdate = hasPermission('departments.update')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDepartments(await organizationApi.departments())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load departments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(values: { name: string; head?: string }) {
    try {
      await organizationApi.createDepartment({
        name: values.name,
        managerEmployeeId: values.head || undefined,
      })
      toast.success('Department created')
      form.reset()
      setOpen(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create department')
    }
  }

  async function toggleStatus(department: DepartmentRecord) {
    try {
      await organizationApi.updateDepartment(department.id, { isActive: department.status === 'active' })
      toast.success(department.status === 'active' ? 'Department deactivated' : 'Department activated')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update department')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Core HR" title="Departments" description="Manage organization structure, department ownership, and reporting hierarchy." action={canCreate ? <Button onClick={() => setOpen(true)}>Add department</Button> : undefined} />
      {departments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 p-10 text-center text-sm text-slate-500 backdrop-blur">
          {loading ? 'Loading departments...' : 'No departments yet. Create your first department to get started.'}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {departments.map((department) => (
            <div key={department.id} className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{department.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{department.code}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${department.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{department.status === 'active' ? 'Active' : 'Inactive'}</span>
              </div>
              <p className="mt-3 text-sm text-slate-500">Head: {department.head ?? 'Not assigned'}</p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
                <span className="text-slate-500">Employees</span>
                <span className="font-semibold text-slate-900">{department.employees}</span>
              </div>
              {canUpdate && <Button variant="secondary" className="mt-4 w-full" onClick={() => void toggleStatus(department)}>{department.status === 'active' ? 'Deactivate' : 'Activate'}</Button>}
            </div>
          ))}
        </div>
      )}
      <Modal open={open} title="Add department" onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onCreate)}>
          <Input label="Department name" {...form.register('name')} error={form.formState.errors.name?.message} />
          <Input label="Department head (employee ID, optional)" {...form.register('head')} error={form.formState.errors.head?.message} />
          <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create department</Button></div>
        </form>
      </Modal>
    </div>
  )
}
