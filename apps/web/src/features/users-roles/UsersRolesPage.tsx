import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/lib/auth'
import { adminApi, type PermissionRecord, type RoleRecord, type UserRecord } from '@/lib/api'

const inviteSchema = z.object({
  email: z.string().email('Valid email required'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  roleKey: z.string().min(1, 'Role required'),
  password: z.string().min(12, 'At least 12 characters'),
})

export function UsersRolesPage() {
  const { hasPermission } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<RoleRecord[]>([])
  const [permissions, setPermissions] = useState<PermissionRecord[]>([])
  const [category, setCategory] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', firstName: '', lastName: '', roleKey: 'employee', password: '' },
  })

  const canReadUsers = hasPermission('users.read')
  const canManageUsers = hasPermission('users.manage')
  const canReadRoles = hasPermission('roles.read')
  const canManageRoles = hasPermission('roles.manage')
  const canReadPermissions = hasPermission('permissions.read')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.all([
        canReadUsers ? adminApi.users() : Promise.resolve([]),
        canReadRoles ? adminApi.roles() : Promise.resolve([]),
        canReadPermissions ? adminApi.permissions() : Promise.resolve([]),
      ])
      setUsers(results[0])
      setRoles(results[1])
      setPermissions(results[2])
      setCategory((current) => current || results[2][0]?.category || '')
      setAssignments(Object.fromEntries(results[1].map((role) => [role.id, role.key])))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load administration data')
    } finally {
      setLoading(false)
    }
  }, [canReadUsers, canReadRoles, canReadPermissions])

  useEffect(() => {
    void load()
  }, [load])

  const categories = useMemo(() => [...new Set(permissions.map((permission) => permission.category))], [permissions])
  const visiblePermissions = useMemo(() => permissions.filter((permission) => permission.category === category), [permissions, category])

  async function onInvite(values: z.infer<typeof inviteSchema>) {
    try {
      await adminApi.inviteUser(values)
      toast.success('User invited')
      form.reset()
      setInviteOpen(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to invite user')
    }
  }

  async function onAssign(userId: string) {
    const roleKey = assignments[userId]
    if (!roleKey) return
    try {
      await adminApi.assignRole({ userId, roleKey, scopeType: 'tenant' })
      toast.success('Role assigned')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assign role')
    }
  }

  async function togglePermission(role: RoleRecord, permissionKey: string) {
    const current = role.permissionKeys
    const next = current.includes(permissionKey)
      ? current.filter((key) => key !== permissionKey)
      : [...current, permissionKey]
    setRoles((previous) => previous.map((item) => item.id === role.id ? { ...item, permissionKeys: next } : item))
    try {
      const updated = await adminApi.updateRolePermissions(role.id, next)
      setRoles((previous) => previous.map((item) => item.id === role.id ? updated : item))
      toast.success('Permission updated')
    } catch (error) {
      setRoles((previous) => previous.map((item) => item.id === role.id ? role : item))
      toast.error(error instanceof Error ? error.message : 'Unable to update permission')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Users & Roles" description="Manage users, role assignments, and the permission matrix." action={canManageUsers ? <Button onClick={() => setInviteOpen(true)}>Invite user</Button> : undefined} />
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Users</h2>
          {!canReadUsers ? (
            <p className="mt-4 text-sm text-slate-500">You do not have permission to view users.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500"><tr><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Roles</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Assign role</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-3 py-3"><div className="font-medium text-slate-900">{user.firstName || user.lastName ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : user.email}</div><div className="text-slate-500">{user.email}</div></td>
                      <td className="px-3 py-3 text-slate-600">{user.roles.join(', ') || '—'}</td>
                      <td className="px-3 py-3 text-slate-600">{user.status}</td>
                      <td className="px-3 py-3">
                        {canManageUsers ? (
                          <div className="flex gap-2">
                            <select value={assignments[user.id] ?? ''} onChange={(event) => setAssignments((previous) => ({ ...previous, [user.id]: event.target.value }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                              {roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}
                            </select>
                            <Button variant="secondary" onClick={() => void onAssign(user.id)}>Assign</Button>
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">{loading ? 'Loading users...' : 'No users found.'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Roles</h2>
          {!canReadRoles ? (
            <p className="mt-4 text-sm text-slate-500">You do not have permission to view roles.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {roles.map((role) => <div key={role.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 text-sm"><span className="font-medium text-slate-700">{role.name}</span><span className="text-slate-400">{role.permissionKeys.length} perms</span></div>)}
              {roles.length === 0 && <p className="text-sm text-slate-500">No roles found.</p>}
            </div>
          )}
        </section>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-base font-semibold text-slate-900">Permission matrix</h2><p className="text-sm text-slate-500">Toggle permissions per role.</p></div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-4 py-3 font-medium">Permission</th>{roles.map((role) => <th key={role.id} className="px-4 py-3 font-medium">{role.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visiblePermissions.map((permission) => (
                <tr key={permission.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{permission.key}</td>
                  {roles.map((role) => {
                    const on = role.permissionKeys.includes(permission.key)
                    return <td key={role.id} className="px-4 py-3"><button disabled={!canManageRoles} onClick={() => void togglePermission(role, permission.key)} className={`h-6 w-10 rounded-full transition disabled:opacity-50 ${on ? 'bg-brand-600' : 'bg-slate-200'}`}><span className={`block h-4 w-4 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : 'translate-x-1'}`} /></button></td>
                  })}
                </tr>
              ))}
              {visiblePermissions.length === 0 && <tr><td colSpan={roles.length + 1} className="px-4 py-8 text-center text-slate-500">{canReadPermissions ? 'No permissions in this category.' : 'You do not have permission to view permissions.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <Modal open={inviteOpen} title="Invite user" onClose={() => setInviteOpen(false)}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onInvite)}>
          <Input label="Email" type="email" {...form.register('email')} error={form.formState.errors.email?.message} />
          <div className="grid grid-cols-2 gap-3"><Input label="First name" {...form.register('firstName')} /><Input label="Last name" {...form.register('lastName')} /></div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Role</span><select {...form.register('roleKey')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:bg-white">{roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}</select></label>
          <Input label="Temporary password" type="password" {...form.register('password')} error={form.formState.errors.password?.message} />
          <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button><Button type="submit">Invite user</Button></div>
        </form>
      </Modal>
    </div>
  )
}
