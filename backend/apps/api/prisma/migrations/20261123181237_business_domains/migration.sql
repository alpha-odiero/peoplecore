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
