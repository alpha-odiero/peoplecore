import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatMoney, recruitingApi, type ApplicationRecord, type CandidateRecord, type VacancyRecord } from '@/lib/api'

type Dialog = 'vacancy' | 'candidate' | 'apply' | 'offer' | null

export function RecruitingPage() {
  const [vacancies, setVacancies] = useState<VacancyRecord[]>([])
  const [candidates, setCandidates] = useState<CandidateRecord[]>([])
  const [applications, setApplications] = useState<ApplicationRecord[]>([])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [activeApplicationId, setActiveApplicationId] = useState('')

  const load = useCallback(async () => {
    try {
      const [vacancyRows, candidateRows, applicationRows] = await Promise.all([
        recruitingApi.vacancies(),
        recruitingApi.candidates(),
        recruitingApi.applications({}),
      ])
      setVacancies(vacancyRows)
      setCandidates(candidateRows)
      setApplications(applicationRows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load recruiting data')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function open(next: Dialog, applicationId = '') {
    setDialog(next)
    setActiveApplicationId(applicationId)
    setForm({})
  }

  async function submit() {
    try {
      if (dialog === 'vacancy') {
        await recruitingApi.createVacancy({ code: form.code ?? '', title: form.title ?? '', currency: form.currency || undefined })
      } else if (dialog === 'candidate') {
        await recruitingApi.createCandidate({ firstName: form.firstName ?? '', lastName: form.lastName ?? '', email: form.email ?? '' })
      } else if (dialog === 'apply') {
        await recruitingApi.apply({ vacancyId: form.vacancyId ?? '', candidateId: form.candidateId ?? '' })
      } else if (dialog === 'offer') {
        const offer = await recruitingApi.createOffer(activeApplicationId, { salaryMinor: form.salaryMinor ?? '50000000', currency: 'USD', startDate: form.startDate ?? new Date().toISOString().slice(0, 10) })
        await recruitingApi.acceptOffer(offer.id)
      }
      toast.success('Saved')
      setDialog(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save')
    }
  }

  async function stage(id: string, next: string) {
    try {
      await recruitingApi.updateStage(id, next)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update stage')
    }
  }

  const stages = ['applied', 'screening', 'interview', 'offer', 'hired']

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Talent" title="Recruiting / ATS" description="Track vacancies, candidates, pipeline stages, offers, and hires." action={<Button onClick={() => open('vacancy')}>Create requisition</Button>} />
      <div className="grid gap-4 sm:grid-cols-5">
        {stages.map((stage) => (
          <div key={stage} className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="text-sm font-medium capitalize text-slate-500">{stage}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{applications.filter((application) => application.stage === stage).length}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => open('candidate')}>Add candidate</Button>
        <Button variant="secondary" onClick={() => open('apply')}>Add application</Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Candidate</th><th className="px-5 py-3 font-medium">Vacancy</th><th className="px-5 py-3 font-medium">Stage</th><th className="px-5 py-3 font-medium">Offer</th><th className="px-5 py-3 font-medium">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {applications.map((application) => (
              <tr key={application.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-4 font-medium text-slate-900">{application.candidate.firstName} {application.candidate.lastName}</td>
                <td className="px-5 py-4 text-slate-600">{application.vacancy.title}</td>
                <td className="px-5 py-4 capitalize text-slate-600">{application.stage}</td>
                <td className="px-5 py-4 text-slate-600">{application.offers[0] ? formatMoney(application.offers[0].salaryMinor, application.offers[0].currency) : '—'}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <select value={application.stage} onChange={(event) => void stage(application.id, event.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-brand-500">
                      {stages.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    {application.stage !== 'hired' && <Button variant="secondary" onClick={() => open('offer', application.id)}>Make offer</Button>}
                  </div>
                </td>
              </tr>
            ))}
            {applications.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No applications yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={dialog !== null} title={dialog === 'vacancy' ? 'Create requisition' : dialog === 'candidate' ? 'Add candidate' : dialog === 'apply' ? 'Add application' : 'Make offer'} onClose={() => setDialog(null)}>
        <div className="space-y-4">
          {dialog === 'vacancy' && <>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Code" value={form.code ?? ''} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Title" value={form.title ?? ''} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Currency (USD)" value={form.currency ?? ''} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
          </>}
          {dialog === 'candidate' && <>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="First name" value={form.firstName ?? ''} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Last name" value={form.lastName ?? ''} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </>}
          {dialog === 'apply' && <>
            <select className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" value={form.vacancyId ?? ''} onChange={(event) => setForm({ ...form, vacancyId: event.target.value })}>
              <option value="">Select vacancy</option>
              {vacancies.map((vacancy) => <option key={vacancy.id} value={vacancy.id}>{vacancy.title}</option>)}
            </select>
            <select className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" value={form.candidateId ?? ''} onChange={(event) => setForm({ ...form, candidateId: event.target.value })}>
              <option value="">Select candidate</option>
              {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.firstName} {candidate.lastName}</option>)}
            </select>
          </>}
          {dialog === 'offer' && <>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Salary (minor units)" value={form.salaryMinor ?? ''} onChange={(event) => setForm({ ...form, salaryMinor: event.target.value })} />
            <input type="date" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" value={form.startDate ?? ''} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
          </>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={() => void submit()}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
