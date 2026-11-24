# 08 — Prisma Schema Design

Design draft for review only. It follows the PDF's "Prisma Schema Draft" `[REF]` and the full inventory in [doc 06](06-database-entity-inventory.md). `prisma validate`, `prisma migrate diff` and a real Postgres 16 instance are part of P0.1-5; anything not expressible in Prisma is listed in section 4 as raw SQL.

Money is `BigInt` minor units `[REF]`; all tenant-owned models carry `tenantId`; mutable models carry `createdAt`, `updatedAt`, `createdById`, `updatedById` and `version` (shown on `Employee` and applied by convention elsewhere).

## 1. `apps/api/prisma/schema.prisma` — P0/P1 models

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [citext]
}

// ---------- Enums ----------

enum TenantStatus        { active suspended archived }
enum UserStatus          { invited active suspended locked archived }
enum ScopeType           { self direct_reports department location tenant }
enum TokenStatus         { active rotated revoked expired }
enum ChecklistKind       { onboarding offboarding }
enum EmployeeStatus      { draft onboarding active on_leave suspended terminated archived }
enum EmploymentType      { full_time part_time contract intern }
enum ContractType        { permanent fixed_term casual internship }
enum ContractStatus      { draft active expired terminated cancelled }
enum HistoryEventType    { created updated status_changed manager_changed department_changed location_changed position_changed contract_created contract_updated }
enum DocumentType        { contract identification certificate policy performance other }
enum DocumentStatus      { pending_upload uploaded scanning clean infected rejected }
enum ActorType           { user system worker integration }
enum OutboxStatus        { pending published failed dead }
enum ApprovalType        { leave contract payroll document onboarding generic }
enum ApprovalStatus      { pending approved rejected cancelled expired }
enum StepStatus          { pending approved rejected skipped }
enum NotificationChannel { in_app email sms push }
enum NotificationStatus  { pending queued sent delivered failed }
enum ImportType          { employees }
enum ImportMode          { create_only upsert_by_employee_number }
enum ImportStatus        { pending validating running completed failed }
enum WebhookStatus       { active disabled }
enum DeliveryStatus      { pending retrying delivered dead }
enum IntegrationKind     { idp payroll accounting storage }
enum IntegrationStatus   { active disabled error }
enum ClosureKind         { department position }

// ---------- Identity and access ----------

model Tenant {
  id                    String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  name                  String       @db.Text
  slug                  String       @unique @db.Citext
  status                TenantStatus @default(active)
  defaultLocale         String       @default("en") @db.Text
  defaultTimezone       String       @default("UTC") @db.Text
  defaultCurrency       String       @default("USD") @db.Char(3)
  employeeNumberPrefix  String       @default("EMP") @db.Text
  employeeNumberPadding Int          @default(6)
  settings              Json         @default("{}") @db.JsonB
  legalHold             Boolean      @default(false)
  createdAt             DateTime     @default(now()) @db.Timestamptz(6)
  updatedAt             DateTime     @updatedAt @db.Timestamptz(6)

  users             User[]
  roles             Role[]
  departments       Department[]
  locations         Location[]
  jobProfiles       JobProfile[]
  positions         Position[]
  legalEntities     LegalEntity[]
  employees         Employee[]
  contracts         EmploymentContract[]
  history           EmploymentHistory[]
  documents         EmployeeDocument[]
  auditEvents       AuditEvent[]
  dataAccessEvents  DataAccessEvent[]
  outbox            DomainEventOutbox[]
  approvals         ApprovalRequest[]
  approvalSteps     ApprovalStep[]
  notifications     Notification[]
  notificationPrefs NotificationPreference[]
  idempotencyKeys   IdempotencyKey[]
  imports           ImportJob[]
  webhooks          WebhookSubscription[]
  deliveries        WebhookDelivery[]
  integrations      IntegrationConnection[]
  closures          OrgUnitClosure[]

  @@index([status])
}

model User {
  id                String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId          String     @db.Uuid
  tenant            Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  email             String     @db.Citext
  passwordHash      String     @db.Text
  firstName         String?    @db.Text
  lastName          String?    @db.Text
  status            UserStatus @default(invited)
  mfaEnabled        Boolean    @default(false)
  mfaSecretEnc      String?    @db.Text
  employeeId        String?    @db.Uuid
  employee          Employee?  @relation("UserEmployee", fields: [employeeId], references: [id], onDelete: SetNull)
  lastLoginAt       DateTime?  @db.Timestamptz(6)
  passwordChangedAt DateTime   @default(now()) @db.Timestamptz(6)
  failedLoginCount  Int        @default(0)
  lockedUntil       DateTime?  @db.Timestamptz(6)
  permissionVersion Int        @default(1)
  createdAt         DateTime   @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime   @updatedAt @db.Timestamptz(6)

  userRoles          UserRole[]
  refreshTokens      RefreshToken[]
  resetTokens        PasswordResetToken[]
  mfaRecoveryCodes   MfaRecoveryCode[]
  history            EmploymentHistory[]
  documents          EmployeeDocument[]
  auditEvents        AuditEvent[]
  dataAccessEvents   DataAccessEvent[]
  requestedApprovals ApprovalRequest[]
  approvalSteps      ApprovalStep[]
  notifications      Notification[]
  notificationPrefs  NotificationPreference[]
  imports            ImportJob[]

  @@unique([tenantId, email])
  @@index([tenantId, status])
  @@index([tenantId, lastName, firstName])
}

model Role {
  id          String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId    String   @db.Uuid
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  key         String   @db.Citext
  name        String   @db.Text
  description String?  @db.Text
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  rolePermissions RolePermission[]
  userRoles       UserRole[]
  approvalSteps   ApprovalStep[]

  @@unique([tenantId, key])
}

model Permission {
  id          String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  key         String   @unique @db.Text
  category    String   @db.Text
  description String?  @db.Text
  createdAt   DateTime @default(now()) @db.Timestamptz(6)

  rolePermissions RolePermission[]
  @@index([category])
}

model RolePermission {
  id           String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId     String   @db.Uuid
  roleId       String   @db.Uuid
  role         Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permissionId String   @db.Uuid
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  grantedAt    DateTime @default(now()) @db.Timestamptz(6)

  @@unique([tenantId, roleId, permissionId])
  @@index([tenantId, permissionId])
}

model UserRole {
  id         String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId   String     @db.Uuid
  userId     String     @db.Uuid
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  roleId     String     @db.Uuid
  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  scopeType  ScopeType  @default(self)
  scopeRefId String?    @db.Uuid
  expiresAt  DateTime?  @db.Timestamptz(6)
  createdAt  DateTime   @default(now()) @db.Timestamptz(6)

  @@unique([tenantId, userId, roleId, scopeType, scopeRefId])
  @@index([tenantId, userId])
  @@index([tenantId, roleId])
}

model RefreshToken {
  id           String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId     String      @db.Uuid
  userId       String      @db.Uuid
  user         User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  familyId     String      @db.Uuid
  tokenHash    String      @unique @db.Char(64)
  status       TokenStatus @default(active)
  expiresAt    DateTime    @db.Timestamptz(6)
  usedAt       DateTime?   @db.Timestamptz(6)
  revokedAt    DateTime?   @db.Timestamptz(6)
  replacedById String?     @db.Uuid
  replacedBy   RefreshToken? @relation("TokenReplacement", fields: [replacedById], references: [id], onDelete: SetNull)
  replaces     RefreshToken[] @relation("TokenReplacement")
  ip           String?     @db.Text
  userAgent    String?     @db.Text
  createdAt    DateTime    @default(now()) @db.Timestamptz(6)

  @@index([tenantId, userId, status])
  @@index([familyId])
  @@index([status, expiresAt])
}

model PasswordResetToken {
  id        String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId  String    @db.Uuid
  userId    String    @db.Uuid
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique @db.Char(64)
  expiresAt DateTime  @db.Timestamptz(6)
  usedAt    DateTime? @db.Timestamptz(6)
  ip        String?   @db.Text
  userAgent String?   @db.Text
  createdAt DateTime  @default(now()) @db.Timestamptz(6)

  @@index([tenantId, userId])
  @@index([expiresAt])
}

model MfaRecoveryCode {
  id       String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId String    @db.Uuid
  userId   String    @db.Uuid
  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  codeHash String    @db.Text
  usedAt   DateTime? @db.Timestamptz(6)

  @@unique([tenantId, userId, codeHash])
}

// ---------- Organization ----------

model LegalEntity {
  id                  String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId            String   @db.Uuid
  tenant              Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code                String   @db.Text
  name                String   @db.Text
  registrationNumber  String?  @db.Text
  countryCode         String   @db.Char(2)
  taxIdEnc            String?  @db.Text
  addressEnc          Json?    @db.JsonB
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now()) @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @db.Timestamptz(6)

  departments Department[]
  locations   Location[]
  contracts   EmploymentContract[]
  @@unique([tenantId, code])
}

model Department {
  id                 String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId           String      @db.Uuid
  tenant             Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code               String      @db.Text
  name               String      @db.Text
  parentId           String?     @db.Uuid
  parent             Department? @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children           Department[] @relation("DepartmentTree")
  managerEmployeeId  String?     @db.Uuid
  manager            Employee?   @relation("DepartmentManager", fields: [managerEmployeeId], references: [id], onDelete: SetNull)
  locationId         String?     @db.Uuid
  location           Location?   @relation(fields: [locationId], references: [id], onDelete: SetNull)
  legalEntityId      String?     @db.Uuid
  legalEntity        LegalEntity? @relation(fields: [legalEntityId], references: [id], onDelete: SetNull)
  costCenter         String?     @db.Text
  isActive           Boolean     @default(true)
  effectiveFrom      DateTime?   @db.Date
  effectiveTo        DateTime?   @db.Date
  createdAt          DateTime    @default(now()) @db.Timestamptz(6)
  updatedAt          DateTime    @updatedAt @db.Timestamptz(6)

  employees Employee[]
  @@unique([tenantId, code])
  @@index([tenantId, parentId])
}

model Location {
  id           String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId     String   @db.Uuid
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code         String   @db.Text
  name         String   @db.Text
  legalEntityId String? @db.Uuid
  legalEntity  LegalEntity? @relation(fields: [legalEntityId], references: [id], onDelete: SetNull)
  addressLine1 String?  @db.Text
  addressLine2 String?  @db.Text
  city         String?  @db.Text
  region       String?  @db.Text
  postalCode   String?  @db.Text
  countryCode  String   @db.Char(2)
  timezone     String   @db.Text
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)

  departments Department[]
  positions   Position[]
  employees   Employee[]
  @@unique([tenantId, code])
}

model JobProfile {
  id          String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId    String   @db.Uuid
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code        String   @db.Text
  title       String   @db.Text
  family      String?  @db.Text
  level       String?  @db.Text
  description String?  @db.Text
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  positions Position[]
  employees Employee[]
  @@unique([tenantId, code])
  @@index([tenantId, family, level])
}

model Position {
  id                  String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId            String     @db.Uuid
  tenant              Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code                String     @db.Text
  title               String     @db.Text
  departmentId        String     @db.Uuid
  department          Department @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  jobProfileId        String     @db.Uuid
  jobProfile          JobProfile @relation(fields: [jobProfileId], references: [id], onDelete: Restrict)
  locationId          String?    @db.Uuid
  location            Location?  @relation(fields: [locationId], references: [id], onDelete: SetNull)
  reportsToPositionId String?    @db.Uuid
  reportsTo           Position?  @relation("PositionTree", fields: [reportsToPositionId], references: [id], onDelete: SetNull)
  reports             Position[] @relation("PositionTree")
  isActive            Boolean    @default(true)
  effectiveFrom       DateTime?  @db.Date
  effectiveTo         DateTime?  @db.Date
  createdAt           DateTime   @default(now()) @db.Timestamptz(6)
  updatedAt           DateTime   @updatedAt @db.Timestamptz(6)

  employees Employee[]
  @@unique([tenantId, code])
  @@index([tenantId, departmentId])
}

model OrgUnitClosure {
  tenantId    String      @db.Uuid
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  kind        ClosureKind
  ancestorId  String      @db.Uuid
  descendantId String     @db.Uuid
  depth       Int

  @@id([tenantId, kind, ancestorId, descendantId])
  @@index([tenantId, descendantId, depth])
}

// ---------- Core HR ----------

model Employee {
  id                  String           @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId            String           @db.Uuid
  tenant              Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employeeNumber      String           @db.Text
  userId              String?          @db.Uuid
  user                User?            @relation("UserEmployee", fields: [userId], references: [id], onDelete: SetNull)
  firstName           String           @db.Text
  lastName            String           @db.Text
  preferredName       String?          @db.Text
  workEmail           String?          @db.Citext
  personalEmailEnc    String?          @db.Text
  phoneEnc            String?          @db.Text
  dateOfBirthEnc      String?          @db.Text
  nationalIdEnc       String?          @db.Text
  addressEnc          Json?            @db.JsonB
  gender              String?          @db.Text
  status              EmployeeStatus   @default(draft)
  employmentType      EmploymentType   @default(full_time)
  hireDate            DateTime?        @db.Date
  originalHireDate    DateTime?        @db.Date
  terminationDate     DateTime?        @db.Date
  managerEmployeeId   String?          @db.Uuid
  manager             Employee?        @relation("EmployeeManager", fields: [managerEmployeeId], references: [id], onDelete: SetNull)
  reports             Employee[]       @relation("EmployeeManager")
  departmentId        String?          @db.Uuid
  department          Department?      @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  locationId          String?          @db.Uuid
  location            Location?        @relation(fields: [locationId], references: [id], onDelete: SetNull)
  positionId          String?          @db.Uuid
  position            Position?        @relation(fields: [positionId], references: [id], onDelete: SetNull)
  jobProfileId        String?          @db.Uuid
  jobProfile          JobProfile?      @relation(fields: [jobProfileId], references: [id], onDelete: SetNull)
  probationEndDate    DateTime?        @db.Date
  avatarObjectKey     String?          @db.Text
  notesEnc            String?          @db.Text
  createdAt           DateTime         @default(now()) @db.Timestamptz(6)
  updatedAt           DateTime         @updatedAt @db.Timestamptz(6)
  createdById         String?          @db.Uuid
  updatedById         String?          @db.Uuid
  version             Int              @default(1)

  contracts EmploymentContract[]
  history   EmploymentHistory[]
  documents EmployeeDocument[]
  managedDepartments Department[] @relation("DepartmentManager")

  @@unique([tenantId, employeeNumber])
  @@index([tenantId, status])
  @@index([tenantId, departmentId])
  @@index([tenantId, managerEmployeeId])
  @@index([tenantId, locationId])
  @@index([tenantId, positionId])
  @@index([tenantId, lastName, firstName])
}

model EmploymentContract {
  id              String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String         @db.Uuid
  tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employeeId      String         @db.Uuid
  employee        Employee       @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  contractNumber  String         @db.Text
  type            ContractType
  status          ContractStatus @default(draft)
  startDate       DateTime       @db.Date
  endDate         DateTime?      @db.Date
  salaryMinor     BigInt?
  currency        String?        @db.Char(3)
  payFrequency    String?        @db.Text
  workingHoursWeek Decimal?      @db.Decimal(5, 2)
  probationMonths Int?
  signedAt        DateTime?      @db.Timestamptz(6)
  termsObjectKey  String?        @db.Text
  legalEntityId   String?        @db.Uuid
  legalEntity     LegalEntity?   @relation(fields: [legalEntityId], references: [id], onDelete: SetNull)
  notes           String?        @db.Text
  createdAt       DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt @db.Timestamptz(6)

  @@unique([tenantId, contractNumber])
  @@index([tenantId, employeeId, status])
}

model EmploymentHistory {
  id            String          @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String          @db.Uuid
  tenant        Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employeeId    String          @db.Uuid
  employee      Employee        @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  eventType     HistoryEventType
  fromValues    Json?           @db.JsonB
  toValues      Json            @db.JsonB
  effectiveAt   DateTime        @db.Timestamptz(6)
  actorUserId   String?         @db.Uuid
  actor         User?           @relation(fields: [actorUserId], references: [id], onDelete: SetNull)
  reason        String?         @db.Text
  correlationId String?         @db.Uuid
  occurredAt    DateTime        @default(now()) @db.Timestamptz(6)

  @@index([tenantId, employeeId, effectiveAt])
  @@index([tenantId, occurredAt])
}

model EmployeeDocument {
  id              String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String         @db.Uuid
  tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employeeId      String         @db.Uuid
  employee        Employee       @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  documentType    DocumentType
  objectKey       String         @db.Text
  fileName        String         @db.Text
  mimeType        String         @db.Text
  sizeBytes       BigInt
  checksumSha256  String         @db.Char(64)
  status          DocumentStatus @default(pending_upload)
  uploaderUserId  String         @db.Uuid
  uploader        User           @relation(fields: [uploaderUserId], references: [id], onDelete: Restrict)
  uploadedAt      DateTime?      @db.Timestamptz(6)
  confirmedAt     DateTime?      @db.Timestamptz(6)
  scanCompletedAt DateTime?      @db.Timestamptz(6)
  retentionClass  String?        @db.Text
  expiresAt       DateTime?      @db.Date
  createdAt       DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt @db.Timestamptz(6)

  @@unique([tenantId, objectKey])
  @@index([tenantId, employeeId, status])
}

// ---------- Platform services ----------

model AuditEvent {
  id            String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String    @db.Uuid
  tenant        Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  occurredAt    DateTime  @default(now()) @db.Timestamptz(6)
  actorUserId   String?   @db.Uuid
  actor         User?     @relation(fields: [actorUserId], references: [id], onDelete: SetNull)
  actorType     ActorType
  action        String    @db.Text
  resourceType  String    @db.Text
  resourceId    String?   @db.Uuid
  before        Json?     @db.JsonB
  after         Json?     @db.JsonB
  metadata      Json      @db.JsonB
  correlationId String?   @db.Uuid
  requestId     String?   @db.Text

  @@index([tenantId, occurredAt])
  @@index([tenantId, resourceType, resourceId])
  @@index([tenantId, actorUserId, occurredAt])
}

model DataAccessEvent {
  id             String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId       String   @db.Uuid
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  actorUserId    String   @db.Uuid
  actor          User     @relation(fields: [actorUserId], references: [id], onDelete: Restrict)
  resourceType   String   @db.Text
  resourceId     String   @db.Uuid
  fieldsAccessed String[]
  purpose        String?  @db.Text
  occurredAt     DateTime @default(now()) @db.Timestamptz(6)

  @@index([tenantId, resourceType, resourceId, occurredAt])
}

model DomainEventOutbox {
  id            String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String       @db.Uuid
  tenant        Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId       String       @db.Uuid
  eventType     String       @db.Text
  aggregateType String       @db.Text
  aggregateId   String       @db.Uuid
  payload       Json         @db.JsonB
  headers       Json         @default("{}") @db.JsonB
  status        OutboxStatus @default(pending)
  attempts      Int          @default(0)
  availableAt   DateTime     @default(now()) @db.Timestamptz(6)
  publishedAt   DateTime?    @db.Timestamptz(6)
  lastError     String?      @db.Text
  createdAt     DateTime     @default(now()) @db.Timestamptz(6)

  @@unique([tenantId, eventId])
  @@index([status, availableAt])
  @@index([tenantId, aggregateType, aggregateId])
}

model ApprovalRequest {
  id              String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String         @db.Uuid
  tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  type            ApprovalType
  subjectType     String         @db.Text
  subjectId       String         @db.Uuid
  requesterUserId String         @db.Uuid
  requester       User           @relation(fields: [requesterUserId], references: [id], onDelete: Restrict)
  status          ApprovalStatus @default(pending)
  currentStep     Int            @default(0)
  requestedAt     DateTime       @default(now()) @db.Timestamptz(6)
  completedAt     DateTime?      @db.Timestamptz(6)
  metadata        Json           @default("{}") @db.JsonB

  steps ApprovalStep[]
  @@index([tenantId, status, requestedAt])
  @@index([tenantId, subjectType, subjectId])
}

model ApprovalStep {
  id               String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId         String     @db.Uuid
  tenant           Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  approvalRequestId String    @db.Uuid
  request          ApprovalRequest @relation(fields: [approvalRequestId], references: [id], onDelete: Cascade)
  stepOrder        Int
  approverUserId   String?    @db.Uuid
  approverUser     User?      @relation(fields: [approverUserId], references: [id], onDelete: SetNull)
  approverRoleId   String?    @db.Uuid
  approverRole     Role?      @relation(fields: [approverRoleId], references: [id], onDelete: SetNull)
  status           StepStatus @default(pending)
  dueAt            DateTime?  @db.Timestamptz(6)
  decidedAt        DateTime?  @db.Timestamptz(6)
  comment          String?    @db.Text

  @@unique([approvalRequestId, stepOrder])
  @@index([tenantId, approverUserId, status])
}

model Notification {
  id           String             @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId     String             @db.Uuid
  tenant       Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId       String             @db.Uuid
  user         User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  channel      NotificationChannel
  templateKey  String             @db.Text
  subject      String?            @db.Text
  bodyRendered String?            @db.Text
  payload      Json               @db.JsonB
  status       NotificationStatus @default(pending)
  priority     Int                @default(0)
  dedupeKey    String?            @db.Text
  scheduledAt  DateTime           @default(now()) @db.Timestamptz(6)
  sentAt       DateTime?          @db.Timestamptz(6)
  readAt       DateTime?          @db.Timestamptz(6)
  jobId        String?            @db.Text

  @@unique([tenantId, dedupeKey])
  @@index([tenantId, userId, readAt])
  @@index([tenantId, status, scheduledAt])
}

model NotificationPreference {
  id         String             @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId   String             @db.Uuid
  tenant     Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId     String             @db.Uuid
  user       User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  channel    NotificationChannel
  category   String             @db.Text
  enabled    Boolean            @default(true)
  quietHours Json?              @db.JsonB

  @@unique([tenantId, userId, channel, category])
}

model IdempotencyKey {
  id            String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String    @db.Uuid
  tenant        Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  scope         String    @db.Text
  idemKey       String    @db.Text
  requestHash   String    @db.Char(64)
  responseStatus Int?
  responseBody  Json?     @db.JsonB
  resourceId    String?   @db.Uuid
  expiresAt     DateTime  @db.Timestamptz(6)
  createdAt     DateTime  @default(now()) @db.Timestamptz(6)

  @@unique([tenantId, scope, idemKey])
  @@index([expiresAt])
}

model ImportJob {
  id              String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String      @db.Uuid
  tenant          Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  type            ImportType
  mode            ImportMode
  status          ImportStatus @default(pending)
  idempotencyKey  String      @db.Text
  sourceObjectKey String      @db.Text
  totalRows       Int         @default(0)
  successRows     Int         @default(0)
  errorRows       Int         @default(0)
  errors          Json        @default("[]") @db.JsonB
  createdByUserId String      @db.Uuid
  creator         User        @relation(fields: [createdByUserId], references: [id], onDelete: Restrict)
  startedAt       DateTime?   @db.Timestamptz(6)
  completedAt     DateTime?   @db.Timestamptz(6)
  createdAt       DateTime    @default(now()) @db.Timestamptz(6)

  @@unique([tenantId, idempotencyKey])
  @@index([tenantId, status, createdAt])
}

model WebhookSubscription {
  id        String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId  String         @db.Uuid
  tenant    Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name      String         @db.Text
  urlEnc    String         @db.Text
  events    String[]
  secretEnc String         @db.Text
  status    WebhookStatus  @default(active)
  createdAt DateTime       @default(now()) @db.Timestamptz(6)

  deliveries WebhookDelivery[]
  @@unique([tenantId, name])
}

model WebhookDelivery {
  id             String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId       String         @db.Uuid
  tenant         Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  subscriptionId String         @db.Uuid
  subscription   WebhookSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  eventId        String         @db.Uuid
  attempts       Int            @default(0)
  status         DeliveryStatus @default(pending)
  nextAttemptAt  DateTime?      @db.Timestamptz(6)
  lastError      String?        @db.Text
  responseCode   Int?

  @@unique([subscriptionId, eventId])
  @@index([status, nextAttemptAt])
}

model IntegrationConnection {
  id         String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId   String            @db.Uuid
  tenant     Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  provider   String            @db.Text
  kind       IntegrationKind
  configEnc  Json              @db.JsonB
  status     IntegrationStatus @default(active)
  lastSyncAt DateTime?         @db.Timestamptz(6)

  @@unique([tenantId, provider, kind])
}
```

## 2. Future-domain models (design sketches for their assigned phases)

These follow the same conventions (tenant relation, UUIDs, audit fields, minor-unit money) and are promoted into `schema.prisma` in P2–P6. Each model name maps 1:1 to doc 06.

```prisma
// P4 — Recruiting
model Requisition       { id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* tenant, code, title, headcount, status, budgets */ }
model JobPosting        { id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* requisition, channel, status */ }
model Candidate         { id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* encrypted contact data, consent */ }
model Application       { id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* requisition, candidate, stage, status */ }
model PipelineStage     { id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* requisition?, order, isFinal */ }
model Interview         { id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* application, schedule, status */ }
model InterviewScorecard{ id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* interview, interviewer, scores */ }
model Offer             { id String @id @default(dbgenerated("uuidv7()")) @db.Uuid /* application, salaryMinor, acceptance */ }

// P4 — Onboarding / Offboarding
model ChecklistTemplate       { /* name, kind, isActive */ }
model ChecklistTaskTemplate   { /* template, title, dueOffsetDays, ownerRole */ }
model LifecycleCase           { /* employee, template, kind, status */ }
model LifecycleTask           { /* case, assignee, status, evidenceObjectKey */ }
model ProvisioningRequest     { /* case, resourceType, details, status */ }
model ProbationReview         { /* employee, dueAt, reviewer, outcome */ }
model ExitInterview           { /* case, responsesEnc */ }
model AssetReturn             { /* case, asset tag, status */ }
model AccessRevocationRequest { /* case, system, status */ }

// P2 — Time & Attendance
model ShiftTemplate      { /* code, times, timezone */ }
model Schedule           { /* employee, shift, date, start/end */ }
model AttendanceEvent    { /* employee, type, occurredAt, idempotencyKey */ }
model Timesheet          { /* employee, period, status */ }
model TimesheetEntry     { /* timesheet, date, hours, overtimeHours */ }
model OvertimeRule        { /* name, config */ }
model AttendanceException { /* employee, date, type, resolution */ }

// P2 — Leave
model LeaveType          { /* code, paid, approval, accrual rule */ }
model LeavePolicy        { /* eligibility/accrual/carryover/proration/blackout jsonb */ }
model LeaveAccrualLedger { /* immutable postings, balanceAfter */ }
model LeaveBalance       { /* employee, type, year, minutes */ }
model LeaveRequest       { /* employee, type, interval, approval */ }
model HolidayCalendar    { /* name, country, timezone */ }
model Holiday            { /* calendar, date, name */ }
model BlackoutPeriod     { /* interval, leaveType?, department? */ }

// P3 — Payroll
model CompensationPlan      { /* employee, salaryMinor, currency, effective dates */ }
model CompensationChange    { /* from/to minor, approval, actor */ }
model PayComponent          { /* code, type, calculation jsonb */ }
model BenefitDeduction      { /* code, config */ }
model TaxRuleSet            { /* jurisdiction, version, config, adapterKey */ }
model PayrollPeriod         { /* code, dates, status, locked* */ }
model PayrollRun            { /* period, status, snapshotHash, idempotencyKey */ }
model Payslip               { /* run, employee, gross/tax/deduction/net minor */ }
model PayslipLine           { /* payslip, component, amountMinor */ }
model PayrollAdjustment     { /* payslip, component, approval */ }
model PaymentExport         { /* run, provider, idempotencyKey */ }
model PayrollReconciliation { /* export, mismatches */ }
model StatutoryReport       { /* period, jurisdiction, objectKey */ }

// P5 — Performance
model ReviewCycle                  { /* name, type, dates, status */ }
model Goal                         { /* cycle, employee, parent, weight */ }
model CheckIn                      { /* cycle, employee, manager, notesEnc */ }
model Feedback                     { /* recipient, author, visibility, rating */ }
model Review                       { /* cycle, employee, reviewer, rating */ }
model RatingCalibration            { /* review, proposed/calibrated rating */ }
model Competency                   { /* code, name */ }
model CompetencyRating             { /* review, competency, rating */ }
model PerformanceImprovementPlan   { /* employee, goals, owner */ }
model PromotionRequest             { /* employee, positions, approval */ }

// P6 — Workforce
model WorkerProfile      { /* employee?, workerType, rateMinor */ }
model RateCard           { /* code, role, hourlyRateMinor */ }
model WorkOrder          { /* code, customer, status, budgetMinor */ }
model WorkAssignment     { /* order, worker, rate */ }
model ShiftClaim         { /* schedule, worker, status */ }
model CompletionProof    { /* assignment, objectKey, verification */ }
model WorkOrderApproval  { /* assignment, approver, hours, amount */ }
model BillingExport      { /* workOrder, provider, idempotencyKey */ }
```

## 3. Notable schema choices

| Choice                                                             | Reason                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `@db.Citext` for emails/slugs/role keys                            | Case-insensitive uniqueness required; raw `citext` extension needed `[REF]`.                             |
| `BigInt` for all money                                             | Integer minor units, no floating point `[REF][BRIEF]`.                                                   |
| `Json @db.JsonB` for configuration/snapshot fields                 | Flexible rule config `[REF]`; relational keys remain real columns.                                       |
| `onDelete: Restrict` on employee→contract/history/documents        | Prevent accidental orphaning of audit-relevant records.                                                  |
| `onDelete: SetNull` for optional actor references                  | Preserve audit rows when a user is removed.                                                              |
| `OrgUnitClosure` with polymorphic `kind`                           | Fast subtree/scope queries; Prisma cannot express its heterogeneous FKs — raw SQL enforces them.         |
| No `tenantId` on `Permission`                                      | Global catalogue `[ASSUMPTION]`; tenant isolation applies to assignments (`RolePermission`).             |
| Outbox has no FKs                                                  | Events may outlive aggregate deletion; `aggregate_id` is opaque.                                         |
| Unique nullable fields via Prisma `@@unique` with nullable columns | PostgreSQL treats NULLs as distinct; partial unique indexes added in raw SQL where strictness is needed. |

## 4. Raw SQL required alongside Prisma migrations `[REF]`

1. `CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_uuidv7;` (fallback `pgcrypto` for `gen_random_uuid()`).
2. `updated_at` trigger function applied to mutable tables.
3. CHECK constraints: `status` value sets are Prisma enums (native PG enums), plus cross-field checks e.g. contract `end_date >= start_date`, `currency` present iff `salary_minor` present, scope ref required for department/location scopes.
4. `COALESCE(scope_ref_id, '00000000-...')` unique expression index on `user_roles` (PDF explicitly requests it).
5. Immutability triggers blocking UPDATE/DELETE on `audit_events`, `employment_history`, `domain_event_outbox` (published rows), `payslips`, `leave_accrual_ledger`.
6. RLS policies on every tenant-owned table using `current_setting('app.tenant_id')::uuid`, with a non-bypassing app role (doc 09).
7. Partial indexes: pending outbox rows, active refresh tokens, non-deleted employees, active notifications.
8. `pg_trgm` index on employee name for fuzzy search `[ASSUMPTION]`.

P0.1-5 acceptance: `prisma validate`, `prisma migrate dev`, `prisma db seed`, and `prisma generate` all succeed against Postgres 16 in Docker, with the raw SQL applied through numbered migrations in `apps/api/prisma/migrations/`.
