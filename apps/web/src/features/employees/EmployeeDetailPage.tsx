import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/lib/auth'
import { adminApi, contractsApi, documentsApi, employeesApi, type AuditEventRecord, type ContractRecord, type DocumentRecord, type EmployeeRecord, type EmploymentHistoryRecord } from '@/lib/api'

const tabs = ['Profile', 'History', 'Contracts', 'Documents', 'Activity'] as const
type Tab = typeof tabs[number]

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function formatSalary(contract: ContractRecord): string {
  if (!contract.salaryMinor) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: contract.currency ?? 'USD',
  }).format(Number(contract.salaryMinor) / 100)
}

function formatValues(value: Record<string, unknown> | null): string {
  if (!value) return '—'
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(', ')
}

export function EmployeeDetailPage() {
  const { id } = useParams()
  const { hasPermission } = useAuth()
  const [tab, setTab] = useState<Tab>('Profile')
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null)
  const [history, setHistory] = useState<EmploymentHistoryRecord[]>([])
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [activity, setActivity] = useState<AuditEventRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [contractOpen, setContractOpen] = useState(false)
  const [contractType, setContractType] = useState('permanent')
  const [contractStart, setContractStart] = useState(new Date().toISOString().slice(0, 10))
  const [contractSalary, setContractSalary] = useState('')
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const canCreateContract = hasPermission('contracts.create')
  const canUpdateContract = hasPermission('contracts.update')
  const canUploadDocument = hasPermission('documents.upload')
  const canDownloadDocument = hasPermission('documents.download')
  const canDeleteDocument = hasPermission('documents.delete')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [record, employmentHistory, contractList, documentList, audit] = await Promise.all([
        employeesApi.get(id),
        employeesApi.history(id),
        contractsApi.list(id),
        documentsApi.list(id),
        adminApi.audit({ resourceType: 'employee', resourceId: id, pageSize: 20 }),
      ])
      setEmployee(record)
      setHistory(employmentHistory)
      setContracts(contractList.data)
      setDocuments(documentList.data)
      setActivity(audit.data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load employee')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const name = employee ? `${employee.firstName} ${employee.lastName}` : 'Employee'
  const profile = employee ? [
    ['Employee number', employee.employeeNumber],
    ['Work email', employee.workEmail ?? '—'],
    ['Status', employee.status.replaceAll('_', ' ')],
    ['Department', employee.departmentName ?? '—'],
    ['Job title', employee.title ?? '—'],
    ['Employment type', employee.employmentType],
    ['Hire date', employee.hireDate ?? '—'],
    ['Version', String(employee.version)],
  ] : []

  async function createContract() {
    if (!id) return
    try {
      await contractsApi.create({
        employeeId: id,
        type: contractType,
        startDate: contractStart,
        ...(contractSalary ? { salaryMinor: contractSalary.replace(/\D/g, '') } : {}),
      })
      toast.success('Contract created')
      setContractOpen(false)
      setContractSalary('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create contract')
    }
  }

  async function activateContract(contract: ContractRecord) {
    try {
      await contractsApi.update(contract.id, { status: 'active' })
      toast.success('Contract activated')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to activate contract')
    }
  }

  async function terminateContract(contract: ContractRecord) {
    const reason = window.prompt('Termination reason')
    if (!reason?.trim()) return
    try {
      await contractsApi.update(contract.id, { status: 'terminated', reason: reason.trim() })
      toast.success('Contract terminated')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to terminate contract')
    }
  }

  async function uploadDocument() {
    if (!id || !documentFile) return
    try {
      const checksum = await sha256(documentFile)
      const presigned = await documentsApi.presign({
        employeeId: id,
        documentType: 'other',
        fileName: documentFile.name,
        mimeType: documentFile.type || 'application/octet-stream',
        sizeBytes: String(documentFile.size),
        checksumSha256: checksum,
      })
      const response = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': documentFile.type || 'application/octet-stream' },
        body: documentFile,
      })
      if (!response.ok) throw new Error('Document upload failed')
      const confirmed = await documentsApi.confirm(presigned.documentId, checksum)
      toast.success(confirmed.status === 'clean' ? 'Document uploaded' : `Document status: ${confirmed.status}`)
      setDocumentFile(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to upload document')
    }
  }

  async function downloadDocument(document: DocumentRecord) {
    try {
      const result = await documentsApi.download(document.id)
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to download document')
    }
  }

  async function deleteDocument(document: DocumentRecord) {
    try {
      await documentsApi.remove(document.id)
      toast.success('Document deleted')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete document')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Core HR" title={loading ? 'Loading employee...' : name} description="Profile, employment history, and audit activity." action={<Link to="/employees" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Back</Link>} />
      <div className="flex flex-wrap gap-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === item ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{item}</button>)}</div>

      {tab === 'Profile' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Profile</h2>
          {!employee ? (
            <p className="mt-4 text-sm text-slate-500">{loading ? 'Loading profile...' : 'Employee not found.'}</p>
          ) : (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {profile.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 font-medium capitalize text-slate-900">{value}</dd></div>)}
            </dl>
          )}
        </div>
      )}
      {tab === 'History' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Employment history</h2>
          <div className="mt-4 space-y-3">
            {history.length === 0 ? <p className="text-sm text-slate-500">No history records yet.</p> : history.map((event) => (
              <div key={event.id} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4"><div className="font-medium text-slate-900">{event.eventType.replaceAll('_', ' ')}</div><div className="shrink-0 text-xs text-slate-400">{formatDate(event.effectiveAt)}</div></div>
                <div className="mt-2 text-sm text-slate-600">From: {formatValues(event.fromValues)}</div>
                <div className="text-sm text-slate-600">To: {formatValues(event.toValues)}</div>
                {event.reason && <div className="mt-2 text-sm italic text-slate-500">{event.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'Contracts' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Contracts</h2>
            {canCreateContract && <Button onClick={() => setContractOpen(true)}>Add contract</Button>}
          </div>
          {contracts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No contracts yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500"><tr><th className="px-3 py-2 font-medium">Number</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Start</th><th className="px-3 py-2 font-medium">End</th><th className="px-3 py-2 font-medium">Salary</th><th className="px-3 py-2 font-medium">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td className="px-3 py-3 font-medium text-slate-900">{contract.contractNumber}</td>
                      <td className="px-3 py-3 text-slate-600">{contract.type.replaceAll('_', ' ')}</td>
                      <td className="px-3 py-3 text-slate-600">{contract.status}</td>
                      <td className="px-3 py-3 text-slate-600">{contract.startDate}</td>
                      <td className="px-3 py-3 text-slate-600">{contract.endDate ?? '—'}</td>
                      <td className="px-3 py-3 text-slate-600">{formatSalary(contract)}</td>
                      <td className="px-3 py-3">{canUpdateContract && contract.status === 'draft' ? <button onClick={() => void activateContract(contract)} className="font-medium text-brand-700 hover:text-brand-800">Activate</button> : canUpdateContract && contract.status === 'active' ? <button onClick={() => void terminateContract(contract)} className="font-medium text-rose-700 hover:text-rose-800">Terminate</button> : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === 'Documents' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Documents</h2>
          {canUploadDocument && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} className="text-sm text-slate-600" />
              <Button onClick={() => void uploadDocument()} disabled={!documentFile}>Upload</Button>
            </div>
          )}
          {documents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No documents yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {documents.map((document) => (
                <div key={document.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{document.fileName}</div>
                    <div className="text-xs text-slate-500">{document.documentType} · {document.status} · {document.mimeType}</div>
                  </div>
                  <div className="flex gap-3">
                    {canDownloadDocument && document.status === 'clean' && <button onClick={() => void downloadDocument(document)} className="text-sm font-medium text-brand-700">Download</button>}
                    {canDeleteDocument && <button onClick={() => void deleteDocument(document)} className="text-sm font-medium text-rose-700">Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'Activity' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Audit activity</h2>
          <div className="mt-4 space-y-3">
            {activity.length === 0 ? <p className="text-sm text-slate-500">No activity recorded.</p> : activity.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                <div><div className="text-sm font-medium text-slate-900">{event.action}</div><div className="text-xs text-slate-500">{event.actor} · {event.resourceType}</div></div>
                <div className="shrink-0 text-xs text-slate-400">{formatDate(event.occurredAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Modal open={contractOpen} title="Add contract" onClose={() => setContractOpen(false)}>
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span><select value={contractType} onChange={(event) => setContractType(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm"><option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="casual">Casual</option><option value="internship">Internship</option></select></label>
          <Input label="Start date" type="date" value={contractStart} onChange={(event) => setContractStart(event.target.value)} />
          <Input label="Annual salary in minor units" value={contractSalary} onChange={(event) => setContractSalary(event.target.value)} placeholder="7500000" />
          <div className="flex justify-end gap-3 pt-2"><Button variant="secondary" onClick={() => setContractOpen(false)}>Cancel</Button><Button onClick={() => void createContract()}>Create contract</Button></div>
        </div>
      </Modal>
    </div>
  )
}
