import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth'
import { organizationApi, type TenantSettings } from '@/lib/api'

export function SettingsPage() {
  const { user, hasPermission } = useAuth()
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [locale, setLocale] = useState('')
  const [currency, setCurrency] = useState('')
  const [saving, setSaving] = useState(false)
  const canManage = hasPermission('users.manage')

  useEffect(() => {
    organizationApi
      .settings()
      .then((value) => {
        setSettings(value)
        setName(value.name)
        setTimezone(value.defaultTimezone)
        setLocale(value.defaultLocale)
        setCurrency(value.defaultCurrency)
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to load settings'))
  }, [])

  async function onSave() {
    setSaving(true)
    try {
      const updated = await organizationApi.updateSettings({
        name,
        defaultTimezone: timezone,
        defaultLocale: locale,
        defaultCurrency: currency,
      })
      setSettings(updated)
      toast.success('Tenant settings saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Settings" description="Manage your profile and tenant configuration." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Profile</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-slate-500">Name</div><div className="mt-1 font-medium text-slate-900">{user?.name ?? '—'}</div></div>
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-slate-500">Email</div><div className="mt-1 font-medium text-slate-900">{user?.email ?? '—'}</div></div>
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-slate-500">Roles</div><div className="mt-1 font-medium text-slate-900">{user?.roles.join(', ') || '—'}</div></div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Tenant settings</h2>
          {!settings ? (
            <p className="mt-4 text-sm text-slate-500">Loading tenant settings...</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 text-sm"><div className="text-slate-500">Workspace slug</div><div className="mt-1 font-medium text-slate-900">{settings.slug}</div></div>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Company name</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm disabled:bg-slate-100" /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Timezone</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!canManage} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm disabled:bg-slate-100" /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Locale</span><input value={locale} onChange={(event) => setLocale(event.target.value)} disabled={!canManage} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm disabled:bg-slate-100" /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Currency</span><input value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={!canManage} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm disabled:bg-slate-100" /></label>
              {canManage && <Button onClick={() => void onSave()} disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</Button>}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
