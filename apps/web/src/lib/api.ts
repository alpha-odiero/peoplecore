const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'
const DEFAULT_TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG ?? 'demo'
const TOKEN_KEY = 'ems_access_token'
const SESSION_KEY = 'ems_auth_session'
const TENANT_KEY = 'ems_tenant_slug'

export type AuthUser = {
  id: string
  tenantId: string
  email: string
  firstName: string | null
  lastName: string | null
  name?: string
  roles: string[]
  permissions: string[]
  scopes: Array<{ type: string; refId: string | null }>
  employeeId: string | null
}

export type AuthResult = {
  accessToken: string
  expiresIn: number
  tenantSlug: string
  user: AuthUser
}

type StoredSession = AuthResult & { expiresAt: number }

type RequestOptions = Omit<RequestInit, 'headers'> & {
  auth?: boolean
  retry?: boolean
  headers?: Record<string, string>
}

export class ApiError extends Error {
  status: number
  data: unknown
  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

export function getToken(): string | null {
  const session = readSession()
  if (session && session.expiresAt > Date.now()) return session.accessToken
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  return readSession()?.user ?? null
}

export function getTenantSlug(): string {
  return localStorage.getItem(TENANT_KEY) ?? DEFAULT_TENANT_SLUG
}

export function storeAuthResult(result: AuthResult): void {
  const displayName = result.user.name ?? [result.user.firstName, result.user.lastName].filter(Boolean).join(' ')
  const session: StoredSession = {
    ...result,
    user: { ...result.user, name: displayName || result.user.email },
    expiresAt: Date.now() + result.expiresIn * 1000 - 30_000,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  localStorage.setItem(TOKEN_KEY, result.accessToken)
  localStorage.setItem(TENANT_KEY, result.tenantSlug)
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TENANT_KEY)
  localStorage.removeItem('ems_session')
  localStorage.removeItem('ems_users')
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)pc_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1] ?? '') : null
}

function baseHeaders(headers?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Slug': getTenantSlug(),
    ...(headers ?? {}),
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }
  return response.text().catch(() => null)
}

function unwrap<T>(data: unknown): T {
  if (
    data &&
    typeof data === 'object' &&
    'data' in data &&
    !('meta' in data) &&
    !('type' in data)
  ) {
    return (data as { data: T }).data
  }
  return data as T
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const candidate = data as { detail?: unknown; message?: unknown }
    if (typeof candidate.detail === 'string') return candidate.detail
    if (typeof candidate.message === 'string') return candidate.message
  }
  return `Request failed (${status})`
}

let refreshInFlight: Promise<boolean> | null = null

async function performRefresh(): Promise<boolean> {
  try {
    const csrf = getCsrfToken()
    const timeout = withTimeout()
    let response: Response
    try {
      response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: timeout.signal,
        headers: {
          ...baseHeaders(),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      })
    } finally {
      timeout.cleanup()
    }
    const data = await parseResponse(response)
    if (!response.ok) {
      clearSession()
      return false
    }
    storeAuthResult(unwrap<AuthResult>(data))
    return true
  } catch {
    clearSession()
    return false
  }
}

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

const REQUEST_TIMEOUT_MS = 15_000

function withTimeout(signal?: AbortSignal | null): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, retry = true, headers, ...rest } = options
  const token = getToken()
  const csrf = getCsrfToken()
  const method = (rest.method ?? 'GET').toUpperCase()
  const timeout = withTimeout(rest.signal)
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      credentials: 'include',
      signal: timeout.signal,
      headers: {
        ...baseHeaders(headers),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrf && method !== 'GET' && method !== 'HEAD' ? { 'X-CSRF-Token': csrf } : {}),
      },
    })
  } finally {
    timeout.cleanup()
  }

  if (response.status === 401 && auth && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return api<T>(path, { ...options, retry: false })
    clearSession()
  }

  const data = await parseResponse(response)
  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.status), response.status, data)
  }
  return unwrap<T>(data)
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => api<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => api<T>(path, {
    ...options,
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => api<T>(path, {
    ...options,
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  delete: <T>(path: string, options?: RequestOptions) => api<T>(path, { ...options, method: 'DELETE' }),
}

export const authApi = {
  login: (email: string, password: string, tenantSlug?: string) =>
    apiClient.post<AuthResult>('/auth/login', { email, password, tenantSlug }),
  register: (name: string, tenantName: string, email: string, password: string) =>
    apiClient.post<AuthResult>('/auth/register', { name, tenantName, email, password }),
  me: async () => {
    const user = await apiClient.get<AuthUser>('/auth/me')
    return {
      ...user,
      name: user.name ?? ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email),
    }
  },
  logout: () => apiClient.post<void>('/auth/logout'),
}

export type EmployeeStatus = 'draft' | 'onboarding' | 'active' | 'on_leave' | 'suspended' | 'terminated' | 'archived'

export type EmployeeRecord = {
  id: string
  employeeNumber: string
  firstName: string
  lastName: string
  preferredName: string | null
  workEmail: string | null
  status: EmployeeStatus
  employmentType: string
  hireDate: string | null
  terminationDate: string | null
  departmentId: string | null
  departmentName: string | null
  title: string | null
  locationId: string | null
  positionId: string | null
  managerEmployeeId: string | null
  version: number
}

export type EmploymentHistoryRecord = {
  id: string
  eventType: string
  fromValues: Record<string, unknown> | null
  toValues: Record<string, unknown> | null
  effectiveAt: string
  reason: string | null
}

export type DocumentRecord = {
  id: string
  employeeId: string
  documentType: string
  fileName: string
  mimeType: string
  sizeBytes: string
  checksumSha256: string
  status: string
  uploadedAt: string | null
  confirmedAt: string | null
  scanCompletedAt: string | null
  createdAt: string
}

export type ImportJobRecord = {
  id: string
  type: string
  mode: string
  status: string
  idempotencyKey: string
  totalRows: number
  successRows: number
  errorRows: number
  errors: Array<Record<string, unknown>>
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export type ContractRecord = {
  id: string
  contractNumber: string
  employeeId: string
  type: string
  status: string
  startDate: string
  endDate: string | null
  salaryMinor: string | null
  currency: string | null
  payFrequency: string | null
  workingHoursWeek: string | null
  probationMonths: number | null
  signedAt: string | null
  legalEntityId: string | null
  notes: string | null
}

export type Page<T> = {
  data: T[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export type DepartmentRecord = {
  id: string
  code: string
  name: string
  head: string | null
  employees: number
  status: 'active' | 'inactive'
}

export type DashboardSummary = {
  totalEmployees: number
  activeEmployees: number
  activeDepartments: number
  pendingApprovals: number
  pendingLeaveRequests: number
  attendanceToday: number
  openPositions: number
  auditEvents24h: number
  recentActivity: Array<{ id: string; action: string; resourceType: string; actor: string; occurredAt: string }>
}

export type AuditEventRecord = {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  actor: string
  occurredAt: string
  requestId: string | null
}

export type UserRecord = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  status: string
  roles: string[]
  lastLoginAt: string | null
}

export type RoleRecord = {
  id: string
  key: string
  name: string
  isSystem: boolean
  permissionKeys: string[]
}

export type PermissionRecord = { id: string; key: string; category: string; description: string | null }

export type TenantSettings = {
  name: string
  slug: string
  defaultLocale: string
  defaultTimezone: string
  defaultCurrency: string
  employeeNumberPrefix: string
  employeeNumberPadding: number
  settings: Record<string, unknown>
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value))
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export const employeesApi = {
  list: (params: { page?: number; pageSize?: number; q?: string; status?: EmployeeStatus; departmentId?: string; sortBy?: string } = {}) =>
    apiClient.get<Page<EmployeeRecord>>(`/employees${queryString(params)}`),
  get: (id: string) => apiClient.get<EmployeeRecord>(`/employees/${id}`),
  history: (id: string) => apiClient.get<EmploymentHistoryRecord[]>(`/employees/${id}/history`),
  create: (body: { firstName: string; lastName: string; workEmail?: string; departmentId?: string; jobProfileTitle?: string; status?: EmployeeStatus }) =>
    apiClient.post<EmployeeRecord>('/employees', body),
  changeStatus: (id: string, status: EmployeeStatus, reason?: string) =>
    apiClient.patch<EmployeeRecord>(`/employees/${id}/status`, { status, reason }),
  bulkChangeStatus: (ids: string[], status: EmployeeStatus, reason?: string) =>
    apiClient.post<{ updated: number }>('/employees/bulk-status', { ids, status, reason }),
}

export const contractsApi = {
  list: (employeeId: string) => apiClient.get<Page<ContractRecord>>(`/contracts${queryString({ employeeId, pageSize: 100 })}`),
  create: (body: { employeeId: string; type: string; startDate: string; endDate?: string; salaryMinor?: string; currency?: string; payFrequency?: string; workingHoursWeek?: number; probationMonths?: number; notes?: string }) =>
    apiClient.post<ContractRecord>('/contracts', body),
  update: (id: string, body: { status?: string; endDate?: string; notes?: string; terminationDate?: string; reason?: string }) =>
    apiClient.patch<ContractRecord>(`/contracts/${id}`, body),
}

export const documentsApi = {
  list: (employeeId: string) => apiClient.get<Page<DocumentRecord>>(`/documents${queryString({ employeeId, pageSize: 100 })}`),
  presign: (body: { employeeId: string; documentType: string; fileName: string; mimeType: string; sizeBytes: string; checksumSha256: string }) =>
    apiClient.post<{ documentId: string; objectKey: string; uploadUrl: string; expiresIn: number }>('/documents/presign', body),
  confirm: (id: string, checksumSha256: string) =>
    apiClient.post<DocumentRecord>(`/documents/${id}/confirm`, { checksumSha256 }),
  download: (id: string) =>
    apiClient.get<{ documentId: string; downloadUrl: string; expiresIn: number }>(`/documents/${id}/download`),
  remove: (id: string) => apiClient.delete<{ deleted: true }>(`/documents/${id}`),
}

export const importsApi = {
  presign: (body: { idempotencyKey: string; mode: string; fileName: string }) =>
    apiClient.post<{ jobId: string; objectKey: string; uploadUrl: string; expiresIn: number }>('/imports/presign', body),
  start: (jobId: string) => apiClient.post<ImportJobRecord>(`/imports/${jobId}/start`, {}),
  list: () => apiClient.get<Page<ImportJobRecord>>('/imports?pageSize=50'),
}

export const organizationApi = {
  departments: () => apiClient.get<DepartmentRecord[]>('/departments'),
  createDepartment: (body: { name: string; managerEmployeeId?: string }) =>
    apiClient.post<DepartmentRecord>('/departments', body),
  updateDepartment: (id: string, body: { name?: string; managerEmployeeId?: string; isActive?: boolean }) =>
    apiClient.patch<DepartmentRecord>(`/departments/${id}`, body),
  settings: () => apiClient.get<TenantSettings>('/tenant/settings'),
  updateSettings: (body: Partial<Pick<TenantSettings, 'name' | 'defaultLocale' | 'defaultTimezone' | 'defaultCurrency'>>) =>
    apiClient.patch<TenantSettings>('/tenant/settings', body),
}

export const adminApi = {
  dashboard: () => apiClient.get<DashboardSummary>('/dashboard/summary'),
  audit: (params: { page?: number; pageSize?: number; q?: string; action?: string; resourceType?: string; resourceId?: string } = {}) =>
    apiClient.get<Page<AuditEventRecord>>(`/audit${queryString(params)}`),
  users: () => apiClient.get<UserRecord[]>('/users'),
  inviteUser: (body: { email: string; firstName?: string; lastName?: string; roleKey: string; password: string }) =>
    apiClient.post<UserRecord>('/users', body),
  assignRole: (body: { userId: string; roleKey: string; scopeType: string; scopeRefId?: string }) =>
    apiClient.post<UserRecord>('/users/assign-role', body),
  roles: () => apiClient.get<RoleRecord[]>('/roles'),
  permissions: () => apiClient.get<PermissionRecord[]>('/permissions'),
  updateRolePermissions: (roleId: string, permissionKeys: string[]) =>
    apiClient.patch<RoleRecord>(`/roles/${roleId}/permissions`, { permissionKeys }),
}

export type LeaveTypeRecord = {
  id: string
  code: string
  name: string
  annualAllowanceDays: string
  accrualPerMonthDays: string
  carryOverAllowed: boolean
  isActive: boolean
}

export type LeaveBalanceRecord = {
  id: string
  employeeId: string
  leaveTypeId: string
  code: string
  name: string
  year: number
  allowanceDays: number
  usedDays: number
  pendingDays: number
  remainingDays: number
}

export type LeaveRequestRecord = {
  id: string
  employeeId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approvalRequestId: string | null
  employee: { employeeNumber: string; firstName: string; lastName: string }
  leaveType: { code: string; name: string }
}

export type ApprovalStepRecord = {
  id: string
  stepOrder: number
  approverUserId: string | null
  approverRoleId: string | null
  status: string
  decidedAt: string | null
  comment: string | null
}

export type ApprovalRecord = {
  id: string
  type: string
  subjectType: string
  subjectId: string
  requesterUserId: string
  status: string
  currentStep: number
  requestedAt: string
  completedAt: string | null
  metadata: Record<string, unknown>
  steps: ApprovalStepRecord[]
}

export type NotificationRecord = {
  id: string
  templateKey: string
  subject: string | null
  body: string | null
  channel: string
  status: string
  readAt: string | null
  createdAt: string
}

export type AttendanceRecord = {
  id: string
  employeeId: string
  workDate: string
  clockIn: string | null
  clockOut: string | null
  breakMinutes: number
  source: string
  note: string | null
  employee: { employeeNumber: string; firstName: string; lastName: string }
}

export type PayrollRunRecord = {
  id: string
  periodStart: string
  periodEnd: string
  currency: string
  taxRateBps: number
  status: string
  totalGrossMinor: string
  totalDeductionsMinor: string
  totalNetMinor: string
  approvedAt: string | null
}

export type PayslipRecord = {
  id: string
  employeeId: string
  employee: { employeeNumber: string; firstName: string; lastName: string }
  grossMinor: string
  taxMinor: string
  deductionsMinor: string
  netMinor: string
}

export type VacancyRecord = {
  id: string
  code: string
  title: string
  status: string
  employmentType: string
  salaryMinMinor: string | null
  salaryMaxMinor: string | null
  currency: string | null
}

export type CandidateRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  source: string | null
}

export type ApplicationRecord = {
  id: string
  vacancyId: string
  candidateId: string
  appliedAt: string
  stage: string
  rating: number | null
  notes: string | null
  candidate: CandidateRecord
  vacancy: { id: string; title: string; code: string }
  interviews: Array<{ id: string; scheduledAt: string; interviewerUserId: string }>
  offers: Array<{ id: string; status: string; salaryMinor: string; currency: string }>
}

export type PerformanceCycleRecord = {
  id: string
  name: string
  startDate: string
  endDate: string
  status: string
  _count: { goals: number; reviews: number }
}

export type PerformanceGoalRecord = {
  id: string
  cycleId: string
  employeeId: string
  title: string
  status: string
  employee: { employeeNumber: string; firstName: string; lastName: string }
}

export type PerformanceReviewRecord = {
  id: string
  cycleId: string
  employeeId: string
  reviewerUserId: string
  rating: number | null
  status: string
  submittedAt: string | null
  employee: { employeeNumber: string; firstName: string; lastName: string }
  feedback: Array<{ id: string; comment: string }>
}

export const leaveApi = {
  types: () => apiClient.get<LeaveTypeRecord[]>('/leave/types'),
  createType: (body: { code: string; name: string; annualAllowanceDays?: number; accrualPerMonthDays?: number }) =>
    apiClient.post<LeaveTypeRecord>('/leave/types', body),
  balances: (employeeId?: string) => apiClient.get<LeaveBalanceRecord[]>(`/leave/balances${queryString({ employeeId })}`),
  requests: (params: { employeeId?: string; status?: string } = {}) =>
    apiClient.get<LeaveRequestRecord[]>(`/leave/requests${queryString(params)}`),
  request: (body: { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; reason?: string }) =>
    apiClient.post<LeaveRequestRecord>('/leave/requests', body),
  decide: (id: string, decision: 'approved' | 'rejected') =>
    apiClient.patch<LeaveRequestRecord>(`/leave/requests/${id}/decision`, { decision }),
  cancel: (id: string) => apiClient.patch<LeaveRequestRecord>(`/leave/requests/${id}/cancel`, {}),
}

export const approvalsApi = {
  list: (params: { scope?: 'inbox' | 'mine' | 'all'; status?: string } = {}) =>
    apiClient.get<Page<ApprovalRecord>>(`/approvals${queryString(params)}`),
  create: (body: { type: string; subjectType: string; subjectId: string; steps: Array<{ stepOrder: number; approverUserId?: string; approverRoleKey?: string }>; metadata?: Record<string, unknown> }) =>
    apiClient.post<ApprovalRecord>('/approvals', body),
  get: (id: string) => apiClient.get<ApprovalRecord>(`/approvals/${id}`),
  decide: (id: string, decision: 'approved' | 'rejected', comment?: string) =>
    apiClient.patch<ApprovalRecord>(`/approvals/${id}/decision`, { decision, comment }),
}

export const notificationsApi = {
  list: (params: { unreadOnly?: boolean } = {}) =>
    apiClient.get<Page<NotificationRecord>>(`/notifications${queryString({ unreadOnly: params.unreadOnly ? 'true' : undefined })}`),
  unreadCount: () => apiClient.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiClient.patch<NotificationRecord>(`/notifications/${id}/read`, {}),
  markAllRead: () => apiClient.patch<{ updated: number }>('/notifications/read-all', {}),
}

export const attendanceApi = {
  list: (params: { employeeId?: string; from?: string; to?: string } = {}) =>
    apiClient.get<AttendanceRecord[]>(`/attendance${queryString(params)}`),
  summary: (params: { employeeId?: string; from: string; to: string }) =>
    apiClient.get<Array<{ employeeId: string; days: number; hours: number }>>(`/attendance/summary${queryString(params)}`),
  clockIn: (body: { employeeId?: string; at?: string }) => apiClient.post<AttendanceRecord>('/attendance/clock-in', body),
  clockOut: (body: { employeeId?: string; at?: string }) => apiClient.post<AttendanceRecord>('/attendance/clock-out', body),
}

export const payrollApi = {
  rule: () => apiClient.get<{ formula: string; units: string }>('/payroll/calculation-rule'),
  structures: (employeeId?: string) => apiClient.get<Array<{ id: string; employeeId: string; currency: string; baseSalaryMinor: string; allowanceMinor: string; effectiveFrom: string }>>(`/payroll/structures${queryString({ employeeId })}`),
  createStructure: (body: { employeeId: string; currency: string; baseSalaryMinor: string; allowanceMinor?: string; effectiveFrom: string }) =>
    apiClient.post<{ id: string }>('/payroll/structures', body),
  runs: (params: { status?: string } = {}) => apiClient.get<Page<PayrollRunRecord>>(`/payroll/runs${queryString(params)}`),
  run: (id: string) => apiClient.get<PayrollRunRecord & { payslips: PayslipRecord[] }>(`/payroll/runs/${id}`),
  createRun: (body: { periodStart: string; periodEnd: string; currency: string; taxRateBps: number }) =>
    apiClient.post<PayrollRunRecord>('/payroll/runs', body),
  approve: (id: string) => apiClient.patch<PayrollRunRecord>(`/payroll/runs/${id}/approve`, {}),
  markPaid: (id: string) => apiClient.patch<PayrollRunRecord>(`/payroll/runs/${id}/paid`, {}),
}

export const recruitingApi = {
  vacancies: () => apiClient.get<VacancyRecord[]>('/recruiting/vacancies'),
  createVacancy: (body: { code: string; title: string; description?: string; currency?: string; salaryMinMinor?: string; salaryMaxMinor?: string }) =>
    apiClient.post<VacancyRecord>('/recruiting/vacancies', body),
  candidates: () => apiClient.get<CandidateRecord[]>('/recruiting/candidates'),
  createCandidate: (body: { firstName: string; lastName: string; email: string; source?: string }) =>
    apiClient.post<CandidateRecord>('/recruiting/candidates', body),
  applications: (params: { vacancyId?: string; stage?: string } = {}) =>
    apiClient.get<ApplicationRecord[]>(`/recruiting/applications${queryString(params)}`),
  apply: (body: { vacancyId: string; candidateId: string; notes?: string }) =>
    apiClient.post<ApplicationRecord>('/recruiting/applications', body),
  updateStage: (id: string, stage: string) => apiClient.patch<ApplicationRecord>(`/recruiting/applications/${id}/stage`, { stage }),
  createOffer: (id: string, body: { salaryMinor: string; currency: string; startDate: string }) =>
    apiClient.post<{ id: string }>(`/recruiting/applications/${id}/offers`, body),
  acceptOffer: (id: string) => apiClient.patch<{ id: string; status: string }>(`/recruiting/offers/${id}/accept`, {}),
}

export const performanceApi = {
  cycles: () => apiClient.get<PerformanceCycleRecord[]>('/performance/cycles'),
  createCycle: (body: { name: string; startDate: string; endDate: string }) =>
    apiClient.post<PerformanceCycleRecord>('/performance/cycles', body),
  goals: (params: { cycleId?: string; employeeId?: string } = {}) =>
    apiClient.get<PerformanceGoalRecord[]>(`/performance/goals${queryString(params)}`),
  createGoal: (body: { cycleId: string; employeeId: string; title: string; description?: string; targetValue?: number; dueDate?: string }) =>
    apiClient.post<PerformanceGoalRecord>('/performance/goals', body),
  updateGoalStatus: (id: string, status: string) => apiClient.patch<PerformanceGoalRecord>(`/performance/goals/${id}/status`, { status }),
  reviews: (params: { cycleId?: string; employeeId?: string } = {}) =>
    apiClient.get<PerformanceReviewRecord[]>(`/performance/reviews${queryString(params)}`),
  createReview: (body: { cycleId: string; employeeId: string; rating?: number }) =>
    apiClient.post<PerformanceReviewRecord>('/performance/reviews', body),
  submitReview: (id: string, rating: number) => apiClient.patch<PerformanceReviewRecord>(`/performance/reviews/${id}/submit`, { rating }),
  addFeedback: (id: string, comment: string) => apiClient.patch<PerformanceReviewRecord>(`/performance/reviews/${id}/feedback`, { comment }),
  calibration: (cycleId: string) => apiClient.get<Array<{ departmentId: string | null; key: string; submittedReviews: number; averageRating: number | null }>>(`/performance/calibration${queryString({ cycleId })}`),
}

export function formatMoney(minor: string, currency = 'USD'): string {
  const amount = Number(minor) / 100
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
}
