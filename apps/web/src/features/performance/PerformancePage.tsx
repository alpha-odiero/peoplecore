import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { employeesApi, performanceApi, type PerformanceGoalRecord, type PerformanceReviewRecord } from '@/lib/api'

type Dialog = 'cycle' | 'goal' | 'review' | null

export function PerformancePage() {
  const [cycles, setCycles] = useState<Awaited<ReturnType<typeof performanceApi.cycles>>>([])
  const [goals, setGoals] = useState<PerformanceGoalRecord[]>([])
  const [reviews, setReviews] = useState<PerformanceReviewRecord[]>([])
  const [calibration, setCalibration] = useState<Array<{ key: string; submittedReviews: number; averageRating: number | null }>>([])
  const [employees, setEmployees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])
  const [cycleId, setCycleId] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const [cycleRows, employeeRows] = await Promise.all([
        performanceApi.cycles(),
        employeesApi.list({ pageSize: 100 }),
      ])
      setCycles(cycleRows)
      setEmployees(employeeRows.data)
      setCycleId((current) => current || cycleRows[0]?.id || '')
      const params = cycleRows[0]?.id ? { cycleId: cycleRows[0].id } : {}
      const [goalRows, reviewRows] = await Promise.all([
        performanceApi.goals(params),
        performanceApi.reviews(params),
      ])
      setGoals(goalRows)
      setReviews(reviewRows)
      if (cycleRows[0]?.id) {
        const calibrationRows = await performanceApi.calibration(cycleRows[0].id).catch(() => [])
        setCalibration(calibrationRows)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load performance data')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function reloadCycle(nextCycleId: string) {
    setCycleId(nextCycleId)
    try {
      const params = nextCycleId ? { cycleId: nextCycleId } : {}
      const [goalRows, reviewRows, calibrationRows] = await Promise.all([
        performanceApi.goals(params),
        performanceApi.reviews(params),
        nextCycleId ? performanceApi.calibration(nextCycleId).catch(() => []) : Promise.resolve([]),
      ])
      setGoals(goalRows)
      setReviews(reviewRows)
      setCalibration(calibrationRows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load cycle')
    }
  }

  function open(next: Dialog) {
    setDialog(next)
    setForm({})
  }

  async function submit() {
    try {
      if (dialog === 'cycle') {
        await performanceApi.createCycle({ name: form.name ?? '', startDate: form.startDate ?? '', endDate: form.endDate ?? '' })
      } else if (dialog === 'goal') {
        await performanceApi.createGoal({
          cycleId,
          employeeId: form.employeeId ?? '',
          title: form.title ?? '',
          description: form.description || undefined,
        })
      } else if (dialog === 'review') {
        await performanceApi.createReview({
          cycleId,
          employeeId: form.employeeId ?? '',
          rating: form.rating ? Number(form.rating) : undefined,
        })
      }
      toast.success('Saved')
      setDialog(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save')
    }
  }

  async function updateGoal(id: string, status: string) {
    try {
      await performanceApi.updateGoalStatus(id, status)
      await reloadCycle(cycleId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update goal')
    }
  }

  async function submitReview(id: string, rating: number) {
    try {
      await performanceApi.submitReview(id, rating)
      toast.success('Review submitted')
      await reloadCycle(cycleId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit review')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People Development" title="Performance" description="Cycles, goals, reviews, feedback, and calibration." action={<Button onClick={() => open('cycle')}>New cycle</Button>} />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center">
        <select value={cycleId} onChange={(event) => void reloadCycle(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500">
          <option value="">Select cycle</option>
          {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
        </select>
        <Button variant="secondary" onClick={() => open('goal')} disabled={!cycleId}>Add goal</Button>
        <Button variant="secondary" onClick={() => open('review')} disabled={!cycleId}>Create review</Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
          <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-900">Goals</div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-slate-500"><tr><th className="px-5 py-3 font-medium">Goal</th><th className="px-5 py-3 font-medium">Employee</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {goals.map((goal) => (
                <tr key={goal.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-4 font-medium text-slate-900">{goal.title}</td>
                  <td className="px-5 py-4 text-slate-600">{goal.employee.firstName} {goal.employee.lastName}</td>
                  <td className="px-5 py-4 capitalize text-slate-600">{goal.status.replace('_', ' ')}</td>
                  <td className="px-5 py-4">
                    <select value={goal.status} onChange={(event) => void updateGoal(goal.id, event.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-brand-500">
                      {['in_progress', 'completed', 'at_risk', 'cancelled'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {goals.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">No goals for this cycle.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
          <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-900">Reviews</div>
          <div className="divide-y divide-slate-100">
            {reviews.map((review) => (
              <div key={review.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-900">{review.employee.firstName} {review.employee.lastName}</div>
                  <div className="text-sm text-slate-500">{review.rating ? `${review.rating}/5` : 'Unrated'} · <span className="capitalize">{review.status}</span></div>
                </div>
                {review.status === 'draft' ? (
                  <div className="mt-3 flex gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => <Button key={rating} variant="secondary" onClick={() => void submitReview(review.id, rating)}>{rating}</Button>)}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.feedback.map((feedback) => <div key={feedback.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{feedback.comment}</div>)}
                  </div>
                )}
              </div>
            ))}
            {reviews.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-500">No reviews for this cycle.</div>}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
        <div className="mb-4 text-sm font-semibold text-slate-900">Calibration summary</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {calibration.map((row) => (
            <div key={row.key} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-900">{row.key}</div>
              <div>{row.submittedReviews} submitted</div>
              <div>{row.averageRating ? `${row.averageRating}/5 avg` : 'No ratings'}</div>
            </div>
          ))}
          {calibration.length === 0 && <div className="text-sm text-slate-500">No calibration data yet.</div>}
        </div>
      </div>
      <Modal open={dialog !== null} title={dialog === 'cycle' ? 'New performance cycle' : dialog === 'goal' ? 'Add goal' : 'Create review'} onClose={() => setDialog(null)}>
        <div className="space-y-4">
          {dialog === 'cycle' && <>
            <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Cycle name" value={form.name ?? ''} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm" value={form.startDate ?? ''} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
              <input type="date" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm" value={form.endDate ?? ''} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            </div>
          </>}
          {(dialog === 'goal' || dialog === 'review') && <>
            <select className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" value={form.employeeId ?? ''} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
              <option value="">Select employee</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
            </select>
            {dialog === 'goal' && <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" placeholder="Goal title" value={form.title ?? ''} onChange={(event) => setForm({ ...form, title: event.target.value })} />}
            {dialog === 'review' && <select className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" value={form.rating ?? ''} onChange={(event) => setForm({ ...form, rating: event.target.value })}><option value="">No rating yet</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select>}
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
