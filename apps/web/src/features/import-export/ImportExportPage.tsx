import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth'
import { importsApi, type ImportJobRecord } from '@/lib/api'

export function ImportExportPage() {
  const { hasPermission } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState('create_only')
  const [jobs, setJobs] = useState<ImportJobRecord[]>([])
  const [running, setRunning] = useState(false)

  async function load() {
    const result = await importsApi.list()
    setJobs(result.data)
  }

  useEffect(() => {
    void load()
  }, [])

  async function runImport() {
    if (!file) return
    setRunning(true)
    try {
      const presigned = await importsApi.presign({
        idempotencyKey: `${Date.now()}-${file.name}`,
        mode,
        fileName: file.name,
      })
      const response = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/csv' },
        body: file,
      })
      if (!response.ok) throw new Error('CSV upload failed')
      const job = await importsApi.start(presigned.jobId)
      toast.success(`Import ${job.status}: ${job.successRows} rows succeeded`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to run import')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Import / Export Hub" description="Bulk import employees with validate-first processing, idempotency, and job history." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Import employees (CSV)</h2>
          <p className="mt-1 text-sm text-slate-500">Required columns: employeeNumber, firstName, lastName. Optional: workEmail, departmentName, status.</p>
          <div className="mt-4 space-y-4">
            <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-sm text-slate-600" />
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm">
              <option value="create_only">Create only</option>
              <option value="upsert_by_employee_number">Upsert by employee number</option>
            </select>
            {hasPermission('imports.create') && <Button onClick={() => void runImport()} disabled={!file || running}>{running ? 'Running…' : 'Run import'}</Button>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Import jobs</h2>
          {jobs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No imports yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">{job.idempotencyKey}</span>
                    <span className="text-slate-500">{job.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{job.successRows} succeeded · {job.errorRows} failed · {job.totalRows} total</div>
                  {job.errors.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs text-rose-700">
                      {job.errors.slice(0, 5).map((error, index) => (
                        <div key={`${job.id}-${index}`}>Row {String(error.row)} · {String(error.field)}: {String(error.message)}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
