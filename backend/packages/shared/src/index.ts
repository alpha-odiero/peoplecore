export const EMPLOYEE_STATUSES = [
  'draft',
  'onboarding',
  'active',
  'on_leave',
  'suspended',
  'terminated',
  'archived',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const USER_STATUSES = ['invited', 'active', 'suspended', 'locked', 'archived'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const CONTRACT_TYPES = ['permanent', 'fixed_term', 'casual', 'internship'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = ['draft', 'active', 'expired', 'terminated', 'cancelled'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const SCOPE_TYPES = ['self', 'direct_reports', 'department', 'location', 'tenant'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'push'] as const;

export const APPROVAL_TYPES = [
  'leave',
  'contract',
  'payroll',
  'document',
  'onboarding',
  'generic',
] as const;

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const PERMISSIONS = [
  'dashboard.read',
  'users.manage',
  'users.read',
  'roles.manage',
  'roles.read',
  'permissions.read',
  'departments.create',
  'departments.read',
  'departments.update',
  'departments.deactivate',
  'locations.create',
  'locations.read',
  'locations.update',
  'locations.deactivate',
  'job_profiles.create',
  'job_profiles.read',
  'job_profiles.update',
  'positions.create',
  'positions.read',
  'positions.update',
  'employees.create',
  'employees.read',
  'employees.update',
  'employees.change_status',
  'employees.read_sensitive',
  'employees.view_salary',
  'employees.get_history',
  'contracts.create',
  'contracts.read',
  'contracts.update',
  'documents.upload',
  'documents.read',
  'documents.download',
  'documents.delete',
  'audit.read',
  'approvals.create',
  'approvals.read',
  'approvals.decide',
  'notifications.read',
  'notifications.manage_preferences',
  'imports.create',
  'imports.read',
  'integrations.manage',
  'leave.request',
  'leave.read',
  'leave.approve',
  'leave.manage_policies',
  'attendance.record',
  'attendance.read',
  'attendance.manage',
  'timesheets.approve',
  'payroll.manage',
  'payroll.read',
  'payroll.approve',
  'payroll.export',
  'recruiting.manage',
  'recruiting.read',
  'onboarding.manage',
  'onboarding.read',
  'performance.read',
  'performance.manage',
  'performance.calibrate',
  'workforce.manage',
  'workforce.read',
  'workforce.approve',
  'reports.read',
  'reports.export',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  'tenant_admin',
  'hr_admin',
  'hr_manager',
  'manager',
  'employee',
  'auditor',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSION_CATEGORY_BY_PREFIX: Record<string, string> = {
  dashboard: 'Platform',
  users: 'Auth',
  roles: 'Auth',
  permissions: 'Auth',
  departments: 'Organization',
  locations: 'Organization',
  job_profiles: 'Organization',
  positions: 'Organization',
  employees: 'Employees',
  contracts: 'Contracts',
  documents: 'Documents',
  audit: 'Platform',
  approvals: 'Platform',
  notifications: 'Platform',
  imports: 'Platform',
  integrations: 'Platform',
  leave: 'Leave',
  attendance: 'Attendance',
  timesheets: 'Attendance',
  payroll: 'Payroll',
  recruiting: 'Recruiting',
  onboarding: 'Onboarding',
  performance: 'Performance',
  workforce: 'Workforce',
  reports: 'Reporting',
};

export const ROLE_NAMES: Record<RoleKey, string> = {
  tenant_admin: 'Tenant Admin',
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
};

export const READ_ONLY_PERMISSIONS: Permission[] = [
  'dashboard.read',
  'users.read',
  'roles.read',
  'permissions.read',
  'departments.read',
  'locations.read',
  'job_profiles.read',
  'positions.read',
  'employees.read',
  'employees.get_history',
  'contracts.read',
  'documents.read',
  'approvals.read',
  'notifications.read',
  'audit.read',
  'reports.read',
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  tenant_admin: [...PERMISSIONS],
  hr_admin: PERMISSIONS.filter(
    (permission) =>
      !['users.manage', 'roles.manage', 'integrations.manage', 'payroll.approve'].includes(
        permission,
      ),
  ),
  hr_manager: [
    'dashboard.read',
    'departments.read',
    'departments.update',
    'locations.read',
    'job_profiles.read',
    'positions.read',
    'employees.create',
    'employees.read',
    'employees.update',
    'employees.change_status',
    'employees.read_sensitive',
    'employees.view_salary',
    'employees.get_history',
    'contracts.create',
    'contracts.read',
    'contracts.update',
    'documents.upload',
    'documents.read',
    'documents.download',
    'approvals.create',
    'approvals.read',
    'approvals.decide',
    'notifications.read',
    'notifications.manage_preferences',
    'leave.request',
    'leave.read',
    'leave.approve',
    'leave.manage_policies',
    'attendance.record',
    'attendance.read',
    'attendance.manage',
    'timesheets.approve',
    'reports.read',
  ],
  manager: [
    'dashboard.read',
    'departments.read',
    'locations.read',
    'job_profiles.read',
    'positions.read',
    'employees.read',
    'employees.get_history',
    'approvals.create',
    'approvals.read',
    'approvals.decide',
    'notifications.read',
    'notifications.manage_preferences',
    'leave.request',
    'leave.read',
    'leave.approve',
    'attendance.read',
    'reports.read',
  ],
  employee: [
    'dashboard.read',
    'departments.read',
    'locations.read',
    'employees.read',
    'employees.get_history',
    'contracts.read',
    'documents.upload',
    'documents.read',
    'documents.download',
    'approvals.create',
    'approvals.read',
    'notifications.read',
    'notifications.manage_preferences',
    'leave.request',
    'leave.read',
    'attendance.record',
    'attendance.read',
    'reports.read',
  ],
  auditor: READ_ONLY_PERMISSIONS,
};

export const FRONTEND_PERMISSION_ALIASES: Record<string, Permission> = {
  'employees.manage_status': 'employees.change_status',
};

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageLinks {
  self: string;
  next: string | null;
  prev: string | null;
}

export interface DataResponse<T> {
  data: T;
}

export interface CollectionResponse<T> {
  data: T[];
  meta: PageMeta;
  links?: PageLinks;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
  code: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  permissions: string[];
  scopes: Array<{ type: ScopeType; refId: string | null }>;
  employeeId: string | null;
  permissionVersion?: number;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  tenantSlug: string;
  user: AuthenticatedUser;
}

export interface MeResponse extends AuthenticatedUser {}

export interface EmployeeListItem {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  workEmail: string | null;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  hireDate: string | null;
  terminationDate: string | null;
  departmentId: string | null;
  departmentName: string | null;
  title: string | null;
  locationId: string | null;
  positionId: string | null;
  managerEmployeeId: string | null;
  version: number;
}

export interface EmploymentHistoryListItem {
  id: string;
  eventType: string;
  fromValues: Record<string, unknown> | null;
  toValues: Record<string, unknown> | null;
  effectiveAt: string;
  reason: string | null;
}

export interface ContractListItem {
  id: string;
  contractNumber: string;
  employeeId: string;
  type: ContractType;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  salaryMinor: string | null;
  currency: string | null;
  payFrequency: string | null;
  workingHoursWeek: string | null;
  probationMonths: number | null;
  signedAt: string | null;
  legalEntityId: string | null;
  notes: string | null;
}

export interface DocumentListItem {
  id: string;
  employeeId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  checksumSha256: string;
  status: string;
  uploadedAt: string | null;
  confirmedAt: string | null;
  scanCompletedAt: string | null;
  createdAt: string;
}

export interface ImportJobListItem {
  id: string;
  type: string;
  mode: string;
  status: string;
  idempotencyKey: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errors: Array<Record<string, unknown>>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DepartmentListItem {
  id: string;
  code: string;
  name: string;
  head: string | null;
  employees: number;
  status: 'active' | 'inactive';
}

export interface DashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  activeDepartments: number;
  pendingApprovals: number;
  pendingLeaveRequests: number;
  attendanceToday: number;
  openPositions: number;
  auditEvents24h: number;
  recentActivity: Array<{
    id: string;
    action: string;
    resourceType: string;
    actor: string;
    occurredAt: string;
  }>;
}

export interface ApprovalStepItem {
  id: string;
  stepOrder: number;
  approverUserId: string | null;
  approverRoleId: string | null;
  status: string;
  decidedAt: string | null;
  comment: string | null;
}

export interface ApprovalRequestListItem {
  id: string;
  type: string;
  subjectType: string;
  subjectId: string;
  requesterUserId: string;
  status: string;
  currentStep: number;
  requestedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  steps: ApprovalStepItem[];
}

export interface NotificationListItem {
  id: string;
  templateKey: string;
  subject: string | null;
  body: string | null;
  channel: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationPreferenceItem {
  id: string;
  channel: string;
  category: string;
  enabled: boolean;
}

export interface AuditEventListItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actor: string;
  occurredAt: string;
  requestId: string | null;
}

export interface UserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: UserStatus;
  roles: string[];
  lastLoginAt: string | null;
}

export interface RoleListItem {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissionKeys: string[];
}

export interface PermissionListItem {
  id: string;
  key: string;
  category: string;
  description: string | null;
}

export interface TenantSettings {
  name: string;
  slug: string;
  defaultLocale: string;
  defaultTimezone: string;
  defaultCurrency: string;
  employeeNumberPrefix: string;
  employeeNumberPadding: number;
  settings: Record<string, unknown>;
}

export const EMPLOYEE_STATUS_TRANSITIONS: Record<EmployeeStatus, readonly EmployeeStatus[]> = {
  draft: ['onboarding', 'archived'],
  onboarding: ['active', 'suspended', 'archived'],
  active: ['on_leave', 'suspended', 'terminated', 'archived'],
  on_leave: ['active', 'suspended', 'terminated', 'archived'],
  suspended: ['active', 'terminated', 'archived'],
  terminated: ['archived'],
  archived: [],
};

export function canTransitionEmployeeStatus(from: EmployeeStatus, to: EmployeeStatus): boolean {
  return EMPLOYEE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const CONTRACT_STATUS_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['expired', 'terminated', 'cancelled'],
  expired: [],
  terminated: [],
  cancelled: [],
};

export function canTransitionContractStatus(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function toMinorUnits(amount: string | number): bigint {
  const value = typeof amount === 'number' ? amount.toFixed(2) : amount;
  const parts = value.split('.');
  if (parts.length > 2) throw new Error(`Invalid decimal amount: ${amount}`);
  const [whole, fraction = ''] = parts;
  if (!/^-?\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) {
    throw new Error(`Invalid decimal amount: ${amount}`);
  }
  const negative = whole.startsWith('-');
  const digits = `${negative ? whole.slice(1) : whole}${fraction.padEnd(2, '0')}`;
  return BigInt(`${negative ? '-' : ''}${digits}`);
}
