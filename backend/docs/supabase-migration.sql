-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'suspended', 'locked', 'archived');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('self', 'direct_reports', 'department', 'location', 'tenant');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('active', 'rotated', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('onboarding', 'offboarding');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('draft', 'onboarding', 'active', 'on_leave', 'terminated', 'archived');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'intern');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('permanent', 'fixed_term', 'casual', 'internship');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'active', 'expired', 'terminated', 'cancelled');

-- CreateEnum
CREATE TYPE "HistoryEventType" AS ENUM ('created', 'updated', 'status_changed', 'manager_changed', 'department_changed', 'location_changed', 'position_changed', 'contract_created', 'contract_updated');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('contract', 'identification', 'certificate', 'policy', 'other');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending_upload', 'uploaded', 'scanning', 'clean', 'infected', 'rejected');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'system', 'worker', 'integration');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'published', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('leave', 'contract', 'payroll', 'document', 'onboarding', 'generic');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'approved', 'rejected', 'skipped');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('employees');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('create_only', 'upsert_by_employee_number');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'validating', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'retrying', 'delivered', 'dead');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('idp', 'payroll', 'accounting', 'storage');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('active', 'disabled', 'error');

-- CreateEnum
CREATE TYPE "ClosureKind" AS ENUM ('department', 'position');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'USD',
    "employeeNumberPrefix" TEXT NOT NULL DEFAULT 'EMP',
    "employeeNumberPadding" INTEGER NOT NULL DEFAULT 6,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "employeeId" UUID,
    "lastLoginAt" TIMESTAMPTZ(6),
    "passwordChangedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(6),
    "permissionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "scopeType" "ScopeType" NOT NULL DEFAULT 'self',
    "scopeRefId" UUID,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "status" "TokenStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "replacedById" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(6),

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "countryCode" CHAR(2) NOT NULL,
    "taxIdEnc" TEXT,
    "addressEnc" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "managerEmployeeId" UUID,
    "locationId" UUID,
    "legalEntityId" UUID,
    "costCenter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalEntityId" UUID,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2) NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "family" TEXT,
    "level" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "JobProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" UUID NOT NULL,
    "jobProfileId" UUID NOT NULL,
    "locationId" UUID,
    "reportsToPositionId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnitClosure" (
    "tenantId" UUID NOT NULL,
    "kind" "ClosureKind" NOT NULL,
    "ancestorId" UUID NOT NULL,
    "descendantId" UUID NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "OrgUnitClosure_pkey" PRIMARY KEY ("tenantId","kind","ancestorId","descendantId")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "workEmail" CITEXT,
    "personalEmailEnc" TEXT,
    "phoneEnc" TEXT,
    "dateOfBirthEnc" TEXT,
    "nationalIdEnc" TEXT,
    "addressEnc" JSONB,
    "gender" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'draft',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "hireDate" DATE,
    "originalHireDate" DATE,
    "terminationDate" DATE,
    "managerEmployeeId" UUID,
    "departmentId" UUID,
    "locationId" UUID,
    "positionId" UUID,
    "jobProfileId" UUID,
    "probationEndDate" DATE,
    "avatarObjectKey" TEXT,
    "notesEnc" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "salaryMinor" BIGINT,
    "currency" CHAR(3),
    "payFrequency" TEXT,
    "workingHoursWeek" DECIMAL(5,2),
    "probationMonths" INTEGER,
    "signedAt" TIMESTAMPTZ(6),
    "termsObjectKey" TEXT,
    "legalEntityId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentHistory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "eventType" "HistoryEventType" NOT NULL,
    "fromValues" JSONB,
    "toValues" JSONB NOT NULL,
    "effectiveAt" TIMESTAMPTZ(6) NOT NULL,
    "actorUserId" UUID,
    "reason" TEXT,
    "correlationId" UUID,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending_upload',
    "uploaderUserId" UUID NOT NULL,
    "uploadedAt" TIMESTAMPTZ(6),
    "confirmedAt" TIMESTAMPTZ(6),
    "scanCompletedAt" TIMESTAMPTZ(6),
    "retentionClass" TEXT,
    "expiresAt" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "actorType" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL,
    "correlationId" UUID,
    "requestId" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataAccessEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "fieldsAccessed" TEXT[],
    "purpose" TEXT,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEventOutbox" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "requesterUserId" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "approvalRequestId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverUserId" UUID,
    "approverRoleId" UUID,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "dueAt" TIMESTAMPTZ(6),
    "decidedAt" TIMESTAMPTZ(6),
    "comment" TEXT,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "subject" TEXT,
    "bodyRendered" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(6),
    "readAt" TIMESTAMPTZ(6),
    "jobId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHours" JSONB,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "idemKey" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "resourceId" UUID,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "type" "ImportType" NOT NULL DEFAULT 'employees',
    "mode" "ImportMode" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "sourceObjectKey" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "urlEnc" TEXT NOT NULL,
    "events" TEXT[],
    "secretEnc" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "nextAttemptAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "responseCode" INTEGER,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "configEnc" JSONB NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMPTZ(6),

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_tenantId_status_idx" ON "User"("tenantId", "status");

-- CreateIndex
CREATE INDEX "User_tenantId_lastName_firstName_idx" ON "User"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_key_key" ON "Role"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Permission_category_idx" ON "Permission"("category");

-- CreateIndex
CREATE INDEX "RolePermission_tenantId_permissionId_idx" ON "RolePermission"("tenantId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_tenantId_roleId_permissionId_key" ON "RolePermission"("tenantId", "roleId", "permissionId");

-- CreateIndex
CREATE INDEX "UserRole_tenantId_userId_idx" ON "UserRole"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "UserRole_tenantId_roleId_idx" ON "UserRole"("tenantId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_tenantId_userId_roleId_scopeType_scopeRefId_key" ON "UserRole"("tenantId", "userId", "roleId", "scopeType", "scopeRefId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_tenantId_userId_status_idx" ON "RefreshToken"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_status_expiresAt_idx" ON "RefreshToken"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tenantId_userId_idx" ON "PasswordResetToken"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_tenantId_userId_codeHash_key" ON "MfaRecoveryCode"("tenantId", "userId", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "LegalEntity_tenantId_code_key" ON "LegalEntity"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Department_tenantId_parentId_idx" ON "Department"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_code_key" ON "Location"("tenantId", "code");

-- CreateIndex
CREATE INDEX "JobProfile_tenantId_family_level_idx" ON "JobProfile"("tenantId", "family", "level");

-- CreateIndex
CREATE UNIQUE INDEX "JobProfile_tenantId_code_key" ON "JobProfile"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Position_tenantId_departmentId_idx" ON "Position"("tenantId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_tenantId_code_key" ON "Position"("tenantId", "code");

-- CreateIndex
CREATE INDEX "OrgUnitClosure_tenantId_descendantId_depth_idx" ON "OrgUnitClosure"("tenantId", "descendantId", "depth");

-- CreateIndex
CREATE INDEX "Employee_tenantId_status_idx" ON "Employee"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Employee_tenantId_departmentId_idx" ON "Employee"("tenantId", "departmentId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_managerEmployeeId_idx" ON "Employee"("tenantId", "managerEmployeeId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_locationId_idx" ON "Employee"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_positionId_idx" ON "Employee"("tenantId", "positionId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_lastName_firstName_idx" ON "Employee"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_employeeNumber_key" ON "Employee"("tenantId", "employeeNumber");

-- CreateIndex
CREATE INDEX "EmploymentContract_tenantId_employeeId_status_idx" ON "EmploymentContract"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentContract_tenantId_contractNumber_key" ON "EmploymentContract"("tenantId", "contractNumber");

-- CreateIndex
CREATE INDEX "EmploymentHistory_tenantId_employeeId_effectiveAt_idx" ON "EmploymentHistory"("tenantId", "employeeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "EmploymentHistory_tenantId_occurredAt_idx" ON "EmploymentHistory"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "EmployeeDocument_tenantId_employeeId_status_idx" ON "EmployeeDocument"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocument_tenantId_objectKey_key" ON "EmployeeDocument"("tenantId", "objectKey");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_occurredAt_idx" ON "AuditEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_resourceType_resourceId_idx" ON "AuditEvent"("tenantId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_actorUserId_occurredAt_idx" ON "AuditEvent"("tenantId", "actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "DataAccessEvent_tenantId_resourceType_resourceId_occurredAt_idx" ON "DataAccessEvent"("tenantId", "resourceType", "resourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEventOutbox_status_availableAt_idx" ON "DomainEventOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "DomainEventOutbox_tenantId_aggregateType_aggregateId_idx" ON "DomainEventOutbox"("tenantId", "aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEventOutbox_tenantId_eventId_key" ON "DomainEventOutbox"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_tenantId_status_requestedAt_idx" ON "ApprovalRequest"("tenantId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_tenantId_subjectType_subjectId_idx" ON "ApprovalRequest"("tenantId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ApprovalStep_tenantId_approverUserId_status_idx" ON "ApprovalStep"("tenantId", "approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_approvalRequestId_stepOrder_key" ON "ApprovalStep"("approvalRequestId", "stepOrder");

-- CreateIndex
CREATE INDEX "Notification_tenantId_userId_readAt_idx" ON "Notification"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_status_scheduledAt_idx" ON "Notification"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_tenantId_dedupeKey_key" ON "Notification"("tenantId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_tenantId_userId_channel_category_key" ON "NotificationPreference"("tenantId", "userId", "channel", "category");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantId_scope_idemKey_key" ON "IdempotencyKey"("tenantId", "scope", "idemKey");

-- CreateIndex
CREATE INDEX "ImportJob_tenantId_status_createdAt_idx" ON "ImportJob"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_tenantId_idempotencyKey_key" ON "ImportJob"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSubscription_tenantId_name_key" ON "WebhookSubscription"("tenantId", "name");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_subscriptionId_eventId_key" ON "WebhookDelivery"("subscriptionId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_kind_key" ON "IntegrationConnection"("tenantId", "provider", "kind");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerEmployeeId_fkey" FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobProfile" ADD CONSTRAINT "JobProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_jobProfileId_fkey" FOREIGN KEY ("jobProfileId") REFERENCES "JobProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_reportsToPositionId_fkey" FOREIGN KEY ("reportsToPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitClosure" ADD CONSTRAINT "OrgUnitClosure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerEmployeeId_fkey" FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobProfileId_fkey" FOREIGN KEY ("jobProfileId") REFERENCES "JobProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataAccessEvent" ADD CONSTRAINT "DataAccessEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataAccessEvent" ADD CONSTRAINT "DataAccessEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approverRoleId_fkey" FOREIGN KEY ("approverRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foundation extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Cross-field constraints
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "contract_dates_valid" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "contract_currency_salary_pair" CHECK (("salaryMinor" IS NULL AND "currency" IS NULL) OR ("salaryMinor" IS NOT NULL AND "currency" IS NOT NULL));
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "contract_hours_positive" CHECK ("workingHoursWeek" IS NULL OR "workingHoursWeek" > 0);
ALTER TABLE "UserRole" ADD CONSTRAINT "user_role_scope_ref_required" CHECK ("scopeType" NOT IN ('department', 'location') OR "scopeRefId" IS NOT NULL);
ALTER TABLE "OrgUnitClosure" ADD CONSTRAINT "org_closure_depth_non_negative" CHECK ("depth" >= 0);
ALTER TABLE "Tenant" ADD CONSTRAINT "tenant_employee_number_padding_range" CHECK ("employeeNumberPadding" BETWEEN 3 AND 12);
ALTER TABLE "RefreshToken" ADD CONSTRAINT "refresh_token_expiry_future" CHECK ("expiresAt" > "createdAt");

-- Partial indexes for common hot paths
CREATE INDEX "outbox_pending_available_idx" ON "DomainEventOutbox" ("availableAt") WHERE "status" = 'pending';
CREATE INDEX "refresh_token_active_idx" ON "RefreshToken" ("tenantId", "userId") WHERE "status" = 'active';
CREATE INDEX "employee_active_name_idx" ON "Employee" ("lastName", "firstName") WHERE "status" <> 'archived';
CREATE INDEX "notification_unread_idx" ON "Notification" ("tenantId", "userId", "scheduledAt" DESC) WHERE "readAt" IS NULL;
CREATE INDEX "employee_name_trgm_idx" ON "Employee" USING gin (("firstName" || ' ' || "lastName") gin_trgm_ops);

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updatedAt'
    GROUP BY table_name
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END;
$$;

-- Append-only guards for audit and ledger-style tables
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER employment_history_immutable BEFORE UPDATE OR DELETE ON "EmploymentHistory" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER data_access_events_immutable BEFORE UPDATE OR DELETE ON "DataAccessEvent" FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE OR REPLACE FUNCTION protect_published_outbox() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'published' THEN
    RAISE EXCEPTION 'Published outbox rows are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_published_immutable BEFORE UPDATE OR DELETE ON "DomainEventOutbox" FOR EACH ROW EXECUTE FUNCTION protect_published_outbox();

-- Tenant row-level security on every tenant-owned table
DO $$
DECLARE t text;
DECLARE tenant_expr text := 'nullif(current_setting(''app.tenant_id'', true), '''')::uuid';
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenantId'
    GROUP BY table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = %s) WITH CHECK ("tenantId" = %s)',
      t, tenant_expr, tenant_expr
    );
  END LOOP;
END;
$$;

ALTER TABLE "Tenant" ALTER COLUMN "employeeNumberPrefix" SET DEFAULT 'EMP-';

UPDATE "Tenant"
SET "employeeNumberPrefix" = 'EMP-'
WHERE "employeeNumberPrefix" = 'EMP';

UPDATE "Employee"
SET "employeeNumber" = 'EMP-' || substring("employeeNumber" from 4)
WHERE "employeeNumber" LIKE 'EMP%' AND "employeeNumber" NOT LIKE 'EMP-%';

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('manual', 'self_service', 'import');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'approved', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('draft', 'open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "PerformanceCycleStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('in_progress', 'achieved', 'not_achieved');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('draft', 'submitted', 'acknowledged');

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualAllowanceDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "accrualPerMonthDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carryOverAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "allowanceDays" DECIMAL(6,2) NOT NULL,
    "usedDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "pendingDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "approvalRequestId" UUID,
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "decisionNote" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "clockIn" TIMESTAMPTZ(6),
    "clockOut" TIMESTAMPTZ(6),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL DEFAULT 'self_service',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "baseSalaryMinor" BIGINT NOT NULL,
    "allowanceMinor" BIGINT NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
    "totalGrossMinor" BIGINT NOT NULL DEFAULT 0,
    "totalDeductionsMinor" BIGINT NOT NULL DEFAULT 0,
    "totalNetMinor" BIGINT NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "payrollRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "baseMinor" BIGINT NOT NULL,
    "allowanceMinor" BIGINT NOT NULL DEFAULT 0,
    "grossMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "otherDeductionsMinor" BIGINT NOT NULL DEFAULT 0,
    "deductionsMinor" BIGINT NOT NULL,
    "netMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobVacancy" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" UUID,
    "locationId" UUID,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "salaryMinMinor" BIGINT,
    "salaryMaxMinor" BIGINT,
    "currency" CHAR(3),
    "description" TEXT,
    "status" "VacancyStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "JobVacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "vacancyId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "stage" "CandidateStage" NOT NULL DEFAULT 'applied',
    "rating" INTEGER,
    "notes" TEXT,
    "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "interviewerUserId" UUID NOT NULL,
    "notes" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOffer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "salaryMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "startDate" DATE NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceCycle" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PerformanceCycleStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PerformanceCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceGoal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" DECIMAL(12,2),
    "dueDate" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'in_progress',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PerformanceGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "reviewerUserId" UUID NOT NULL,
    "rating" INTEGER,
    "strengths" TEXT,
    "improvements" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceFeedback" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_tenantId_code_key" ON "LeaveType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LeaveBalance_tenantId_employeeId_year_idx" ON "LeaveBalance"("tenantId", "employeeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_tenantId_employeeId_leaveTypeId_year_key" ON "LeaveBalance"("tenantId", "employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenantId_employeeId_startDate_idx" ON "LeaveRequest"("tenantId", "employeeId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenantId_status_startDate_idx" ON "LeaveRequest"("tenantId", "status", "startDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_tenantId_workDate_idx" ON "AttendanceRecord"("tenantId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_tenantId_employeeId_workDate_key" ON "AttendanceRecord"("tenantId", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "SalaryStructure_tenantId_employeeId_isActive_idx" ON "SalaryStructure"("tenantId", "employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructure_tenantId_employeeId_effectiveFrom_key" ON "SalaryStructure"("tenantId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollRun_tenantId_status_idx" ON "PayrollRun"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_tenantId_periodStart_periodEnd_key" ON "PayrollRun"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Payslip_tenantId_employeeId_idx" ON "Payslip"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_tenantId_payrollRunId_employeeId_key" ON "Payslip"("tenantId", "payrollRunId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "JobVacancy_tenantId_code_key" ON "JobVacancy"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_lastName_firstName_idx" ON "Candidate"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_tenantId_email_key" ON "Candidate"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Application_tenantId_stage_idx" ON "Application"("tenantId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Application_tenantId_vacancyId_candidateId_key" ON "Application"("tenantId", "vacancyId", "candidateId");

-- CreateIndex
CREATE INDEX "Interview_tenantId_applicationId_idx" ON "Interview"("tenantId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOffer_tenantId_applicationId_key" ON "JobOffer"("tenantId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceCycle_tenantId_name_key" ON "PerformanceCycle"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PerformanceGoal_tenantId_cycleId_employeeId_idx" ON "PerformanceGoal"("tenantId", "cycleId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_tenantId_cycleId_employeeId_reviewerUserI_key" ON "PerformanceReview"("tenantId", "cycleId", "employeeId", "reviewerUserId");

-- CreateIndex
CREATE INDEX "PerformanceFeedback_tenantId_reviewId_idx" ON "PerformanceFeedback"("tenantId", "reviewId");

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobVacancy" ADD CONSTRAINT "JobVacancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "JobVacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceCycle" ADD CONSTRAINT "PerformanceCycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PerformanceCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PerformanceCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceFeedback" ADD CONSTRAINT "PerformanceFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceFeedback" ADD CONSTRAINT "PerformanceFeedback_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE t text;
DECLARE tenant_expr text := 'nullif(current_setting(''app.tenant_id'', true), '''')::uuid';
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenantId'
    GROUP BY table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = %s) WITH CHECK ("tenantId" = %s)',
      t, tenant_expr, tenant_expr
    );
  END LOOP;
END $$;
