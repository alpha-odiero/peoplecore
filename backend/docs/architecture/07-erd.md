# 07 — Entity Relationship Diagrams

Four Mermaid diagrams: (1) P0/P1 core, (2) platform services, (3) future business domains, (4) cross-domain event flow. Attribute lists show key columns only; the full attribute/nullability inventory is [doc 06](06-database-entity-inventory.md). Cardinality notation: `||--o{` = one-to-many, `|o--o{` = zero/one-to-many, `}o--o{` = many-to-many (resolved by a join table).

## 1. Identity, organization and Core HR

```mermaid
erDiagram
  TENANT ||--o{ USER : owns
  TENANT ||--o{ ROLE : owns
  TENANT ||--o{ DEPARTMENT : owns
  TENANT ||--o{ LOCATION : owns
  TENANT ||--o{ JOB_PROFILE : owns
  TENANT ||--o{ POSITION : owns
  TENANT ||--o{ LEGAL_ENTITY : owns
  TENANT ||--o{ EMPLOYEE : owns
  TENANT ||--o{ EMPLOYMENT_CONTRACT : owns
  TENANT ||--o{ EMPLOYMENT_HISTORY : owns
  TENANT ||--o{ EMPLOYEE_DOCUMENT : owns

  USER ||--o{ USER_ROLE : assigned
  ROLE ||--o{ USER_ROLE : granted_through
  ROLE ||--o{ ROLE_PERMISSION : contains
  PERMISSION ||--o{ ROLE_PERMISSION : listed_in
  USER ||--o{ REFRESH_TOKEN : rotates
  USER ||--o{ PASSWORD_RESET_TOKEN : recovers
  USER ||--o{ MFA_RECOVERY_CODE : uses
  USER |o--|| EMPLOYEE : linked_to

  DEPARTMENT |o--o{ DEPARTMENT : parent_of
  DEPARTMENT |o--o{ EMPLOYEE : employs
  LOCATION |o--o{ EMPLOYEE : hosts
  JOB_PROFILE |o--o{ EMPLOYEE : classifies
  POSITION |o--o{ EMPLOYEE : filled_by
  EMPLOYEE |o--o{ EMPLOYEE : manages
  EMPLOYEE ||--o{ EMPLOYMENT_CONTRACT : has
  EMPLOYEE ||--o{ EMPLOYMENT_HISTORY : records
  EMPLOYEE ||--o{ EMPLOYEE_DOCUMENT : owns
  POSITION |o--o{ POSITION : reports_to
  LEGAL_ENTITY |o--o{ EMPLOYMENT_CONTRACT : employs_under

  TENANT {
    uuid id PK
    citext slug UK
    tenant_status status
    char3 default_currency
  }
  USER {
    uuid id PK
    citext email UK
    text password_hash
    user_status status
    uuid employee_id FK
    int permission_version
  }
  USER_ROLE {
    uuid id PK
    uuid user_id FK
    uuid role_id FK
    scope_type scope
    uuid scope_ref_id
  }
  EMPLOYEE {
    uuid id PK
    text employee_number UK
    employee_status status
    uuid manager_employee_id FK
    uuid department_id FK
    uuid location_id FK
    uuid position_id FK
  }
  EMPLOYMENT_CONTRACT {
    uuid id PK
    uuid employee_id FK
    bigint salary_minor
    char3 currency
    contract_status status
  }
  EMPLOYMENT_HISTORY {
    uuid id PK
    uuid employee_id FK
    history_event_type event_type
    jsonb from_values
    jsonb to_values
  }
  EMPLOYEE_DOCUMENT {
    uuid id PK
    uuid employee_id FK
    text object_key UK
    document_status status
  }
```

## 2. Platform services

```mermaid
erDiagram
  TENANT ||--o{ AUDIT_EVENT : records
  TENANT ||--o{ DATA_ACCESS_EVENT : records
  TENANT ||--o{ DOMAIN_EVENT_OUTBOX : queues
  TENANT ||--o{ APPROVAL_REQUEST : tracks
  TENANT ||--o{ NOTIFICATION : sends
  TENANT ||--o{ NOTIFICATION_PREFERENCE : configures
  TENANT ||--o{ IDEMPOTENCY_KEY : dedupes
  TENANT ||--o{ IMPORT_JOB : runs
  TENANT ||--o{ WEBHOOK_SUBSCRIPTION : configures
  TENANT ||--o{ INTEGRATION_CONNECTION : connects

  USER |o--o{ AUDIT_EVENT : actor
  USER |o--o{ DATA_ACCESS_EVENT : actor
  USER ||--o{ APPROVAL_REQUEST : requests
  APPROVAL_REQUEST ||--o{ APPROVAL_STEP : has
  USER |o--o{ APPROVAL_STEP : approves
  ROLE |o--o{ APPROVAL_STEP : approves_as
  USER ||--o{ NOTIFICATION : receives
  USER ||--o{ NOTIFICATION_PREFERENCE : sets
  WEBHOOK_SUBSCRIPTION ||--o{ WEBHOOK_DELIVERY : attempts
  DOMAIN_EVENT_OUTBOX |o--o{ WEBHOOK_DELIVERY : delivered_by

  AUDIT_EVENT {
    uuid id PK
    uuid tenant_id
    text action
    text resource_type
    uuid resource_id
    jsonb before
    jsonb after
  }
  DOMAIN_EVENT_OUTBOX {
    uuid id PK
    uuid event_id UK
    text event_type
    outbox_status status
    int attempts
    timestamptz available_at
  }
  APPROVAL_REQUEST {
    uuid id PK
    approval_type type
    uuid subject_id
    approval_status status
  }
  APPROVAL_STEP {
    uuid id PK
    uuid approval_request_id FK
    int step_order UK
    step_status status
  }
  IMPORT_JOB {
    uuid id PK
    import_mode mode
    text idempotency_key UK
    import_status status
  }
```

## 3. Future business domains

```mermaid
erDiagram
  EMPLOYEE ||--o{ REQUISITION : hiring_manager
  REQUISITION ||--o{ JOB_POSTING : published_as
  REQUISITION ||--o{ PIPELINE_STAGE : has
  REQUISITION ||--o{ APPLICATION : receives
  CANDIDATE ||--o{ APPLICATION : submits
  APPLICATION ||--o{ INTERVIEW : schedules
  INTERVIEW ||--o{ INTERVIEW_SCORECARD : evaluated_by
  APPLICATION ||--o{ OFFER : results_in

  EMPLOYEE ||--o{ LIFECYCLE_CASE : onboarded_by
  CHECKLIST_TEMPLATE ||--o{ CHECKLIST_TASK_TEMPLATE : contains
  CHECKLIST_TEMPLATE ||--o{ LIFECYCLE_CASE : instantiates
  LIFECYCLE_CASE ||--o{ LIFECYCLE_TASK : contains
  LIFECYCLE_CASE ||--o{ PROVISIONING_REQUEST : requests
  LIFECYCLE_CASE ||--o| EXIT_INTERVIEW : includes
  LIFECYCLE_CASE ||--o{ ASSET_RETURN : tracks
  LIFECYCLE_CASE ||--o{ ACCESS_REVOCATION_REQUEST : requests
  EMPLOYEE ||--o{ PROBATION_REVIEW : reviews

  EMPLOYEE ||--o{ SCHEDULE : assigned
  SHIFT_TEMPLATE ||--o{ SCHEDULE : generates
  EMPLOYEE ||--o{ ATTENDANCE_EVENT : clocks
  EMPLOYEE ||--o{ TIMESHEET : submits
  TIMESHEET ||--o{ TIMESHEET_ENTRY : contains
  EMPLOYEE ||--o{ ATTENDANCE_EXCEPTION : flagged

  EMPLOYEE ||--o{ LEAVE_REQUEST : submits
  LEAVE_TYPE ||--o{ LEAVE_REQUEST : categorizes
  LEAVE_POLICY ||--o{ LEAVE_ACCRUAL_LEDGER : governs
  EMPLOYEE ||--o{ LEAVE_BALANCE : holds
  EMPLOYEE ||--o{ LEAVE_ACCRUAL_LEDGER : accrues
  HOLIDAY_CALENDAR ||--o{ HOLIDAY : contains

  EMPLOYEE ||--o{ COMPENSATION_PLAN : paid_under
  EMPLOYEE ||--o{ COMPENSATION_CHANGE : changed
  PAYROLL_PERIOD ||--o{ PAYROLL_RUN : calculates
  PAYROLL_RUN ||--o{ PAYSLIP : produces
  PAYSLIP ||--o{ PAYSLIP_LINE : breaks_down
  PAYROLL_RUN ||--o{ PAYMENT_EXPORT : exported_as
  PAYMENT_EXPORT ||--o| PAYROLL_RECONCILIATION : reconciled_by
  PAYROLL_PERIOD ||--o{ STATUTORY_REPORT : files

  REVIEW_CYCLE ||--o{ GOAL : contains
  EMPLOYEE ||--o{ GOAL : owns
  GOAL |o--o{ GOAL : parent_of
  REVIEW_CYCLE ||--o{ REVIEW : runs
  REVIEW ||--o{ COMPETENCY_RATING : rates
  REVIEW ||--o| RATING_CALIBRATION : calibrated_by
  EMPLOYEE ||--o{ FEEDBACK : receives
  EMPLOYEE ||--o{ CHECK_IN : attends
  EMPLOYEE ||--o{ PERFORMANCE_IMPROVEMENT_PLAN : subject_of
  EMPLOYEE ||--o{ PROMOTION_REQUEST : promoted_by

  WORKER_PROFILE |o--|| EMPLOYEE : based_on
  WORK_ORDER ||--o{ WORK_ASSIGNMENT : staffed_by
  WORKER_PROFILE ||--o{ WORK_ASSIGNMENT : works
  WORK_ASSIGNMENT ||--o{ COMPLETION_PROOF : proves
  WORK_ASSIGNMENT ||--o{ WORK_ORDER_APPROVAL : approved_by
  WORK_ORDER ||--o{ BILLING_EXPORT : billed_through
  SCHEDULE ||--o{ SHIFT_CLAIM : claimed_through
```

## 4. Cross-domain flow (event-driven boundaries)

```mermaid
flowchart LR
  ATS[Recruiting\nOfferAccepted] -->|creates case + pending employee| ONB[Onboarding]
  ONB -->|hire complete| EMP[Core HR\nEmployeeStatusChanged]
  EMP -->|EmployeeCreated| ALL[All modules]
  EMP -->|ManagerChanged| ORG[Organization read model]
  EMP -->|EmployeeStatusChanged| PAY[Payroll]
  EMP -->|EmployeeStatusChanged| SEC[Access revocation]
  TAA[Time & Attendance\nTimesheetApproved] --> PAY
  LEAVE[Leave\nLeaveApproved] --> PAY
  WFM[Workforce\nWorkOrderApproved] --> PAY
  PAY --> BILL[Accounting / ERP]
  ALL --> OUT[DomainEventOutbox] --> BUS[BullMQ] --> WRK[Workers] --> NOTIF[Notifications]
  WRK --> AUD[Audit / DLQ]
```

All relationships carry `tenant_id`; joint reads must include the same tenant predicate on every joined table, plus RLS as defence-in-depth (doc 09).
