import { Injectable } from '@nestjs/common';
import { PayrollRunStatus, Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { calculatePayslip } from './payroll-calculation';
import type {
  ApprovePayrollRunDto,
  CreatePayrollRunDto,
  CreateSalaryStructureDto,
  PayrollRunQueryDto,
} from './dto/payroll.dto';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  calculationRule() {
    return {
      formula:
        'gross = base + allowance; tax = round(gross * taxRateBps / 10000); deductions = tax + other; net = gross - deductions',
      units: 'all monetary fields are integer minor units',
    };
  }

  async createStructure(tenantId: string, dto: CreateSalaryStructureDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
    const structure = await this.prisma.salaryStructure.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        currency: dto.currency,
        baseSalaryMinor: BigInt(dto.baseSalaryMinor),
        allowanceMinor: BigInt(dto.allowanceMinor ?? '0'),
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });
    return serializeStructure(structure);
  }

  listStructures(tenantId: string, employeeId?: string) {
    return this.prisma.salaryStructure
      .findMany({
        where: { tenantId, ...(employeeId ? { employeeId } : {}) },
        orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
      })
      .then((rows) => rows.map(serializeStructure));
  }

  async createRun(tenantId: string, userId: string, dto: CreatePayrollRunDto) {
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new AppError(422, 'INVALID_PERIOD', 'Payroll period is invalid');
    }
    const structures = await this.prisma.salaryStructure.findMany({
      where: {
        tenantId,
        isActive: true,
        currency: dto.currency,
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
    });
    if (structures.length === 0) {
      throw new AppError(
        422,
        'NO_SALARY_STRUCTURES',
        'No active salary structures for this period',
      );
    }

    try {
      const run = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payrollRun.create({
          data: {
            tenantId,
            periodStart: start,
            periodEnd: end,
            currency: dto.currency,
            taxRateBps: dto.taxRateBps,
            createdByUserId: userId,
          },
        });
        let gross = 0n;
        let deductions = 0n;
        let net = 0n;
        for (const structure of structures) {
          const result = calculatePayslip({
            baseMinor: structure.baseSalaryMinor,
            allowanceMinor: structure.allowanceMinor,
            taxRateBps: dto.taxRateBps,
            otherDeductionsMinor: 0n,
          });
          await tx.payslip.create({
            data: {
              tenantId,
              payrollRunId: created.id,
              employeeId: structure.employeeId,
              currency: dto.currency,
              baseMinor: result.baseMinor,
              allowanceMinor: result.allowanceMinor,
              grossMinor: result.grossMinor,
              taxMinor: result.taxMinor,
              otherDeductionsMinor: result.otherDeductionsMinor,
              deductionsMinor: result.deductionsMinor,
              netMinor: result.netMinor,
            },
          });
          gross += result.grossMinor;
          deductions += result.deductionsMinor;
          net += result.netMinor;
        }
        const final = await tx.payrollRun.update({
          where: { id: created.id },
          data: { totalGrossMinor: gross, totalDeductionsMinor: deductions, totalNetMinor: net },
        });
        await this.audit.write({
          tenantId,
          actorUserId: userId,
          action: 'payroll.run_created',
          resourceType: 'payroll_run',
          resourceId: final.id,
          after: {
            periodStart: dto.periodStart,
            periodEnd: dto.periodEnd,
            employees: structures.length,
          },
        });
        await this.outbox.publish(
          {
            tenantId,
            eventType: 'payroll.run_created',
            aggregateType: 'payroll_run',
            aggregateId: final.id,
            payload: {
              subject: 'Payroll run created',
              message: `Payroll run for ${dto.periodStart} to ${dto.periodEnd} is ready for review`,
              payrollRunId: final.id,
            },
          },
          tx,
        );
        return final;
      });
      return serializeRun(run);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          409,
          'PAYROLL_PERIOD_EXISTS',
          'A payroll run already exists for this period',
        );
      }
      throw error;
    }
  }

  listRuns(tenantId: string, query: PayrollRunQueryDto) {
    const where: Prisma.PayrollRunWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status as PayrollRunStatus } : {}),
    };
    return this.prisma.payrollRun
      .findMany({
        where,
        orderBy: { periodStart: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      })
      .then((rows) => rows.map(serializeRun));
  }

  async getRun(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: {
        payslips: {
          include: {
            employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
          },
          orderBy: { employeeId: 'asc' },
        },
      },
    });
    if (!run) throw new AppError(404, 'PAYROLL_RUN_NOT_FOUND', 'Payroll run was not found');
    return {
      ...serializeRun(run),
      payslips: run.payslips.map((slip) => ({
        id: slip.id,
        employeeId: slip.employeeId,
        employee: slip.employee,
        currency: slip.currency,
        baseMinor: slip.baseMinor.toString(),
        allowanceMinor: slip.allowanceMinor.toString(),
        grossMinor: slip.grossMinor.toString(),
        taxMinor: slip.taxMinor.toString(),
        otherDeductionsMinor: slip.otherDeductionsMinor.toString(),
        deductionsMinor: slip.deductionsMinor.toString(),
        netMinor: slip.netMinor.toString(),
      })),
    };
  }

  async approve(tenantId: string, userId: string, id: string, dto: ApprovePayrollRunDto) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new AppError(404, 'PAYROLL_RUN_NOT_FOUND', 'Payroll run was not found');
    if (run.status !== 'draft')
      throw new AppError(409, 'PAYROLL_NOT_DRAFT', 'Only draft payroll runs can be approved');
    const approvedAt = dto.approvedAt ? new Date(dto.approvedAt) : new Date();
    if (Number.isNaN(approvedAt.getTime()))
      throw new AppError(422, 'INVALID_DATE', 'Invalid approval date');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'approved', approvedByUserId: userId, approvedAt },
      });
      await this.audit.write({
        tenantId,
        actorUserId: userId,
        action: 'payroll.run_approved',
        resourceType: 'payroll_run',
        resourceId: id,
        after: { approvedAt: approvedAt.toISOString(), note: dto.note },
      });
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'payroll.run_approved',
          aggregateType: 'payroll_run',
          aggregateId: id,
          payload: {
            subject: 'Payroll run approved',
            message: `Payroll run ${id} was approved`,
            payrollRunId: id,
          },
        },
        tx,
      );
    });
    return this.getRun(tenantId, id);
  }

  async markPaid(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new AppError(404, 'PAYROLL_RUN_NOT_FOUND', 'Payroll run was not found');
    if (run.status !== 'approved')
      throw new AppError(409, 'PAYROLL_NOT_APPROVED', 'Only approved payroll runs can be paid');
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'paid' },
    });
    return serializeRun(updated);
  }

  async exportCsv(tenantId: string, id: string): Promise<string> {
    const run = await this.getRun(tenantId, id);
    const header =
      'employeeId,employeeNumber,name,baseMinor,allowanceMinor,grossMinor,taxMinor,otherDeductionsMinor,deductionsMinor,netMinor';
    const lines = run.payslips.map((slip) =>
      [
        slip.employeeId,
        slip.employee.employeeNumber,
        `${slip.employee.firstName} ${slip.employee.lastName}`,
        slip.baseMinor,
        slip.allowanceMinor,
        slip.grossMinor,
        slip.taxMinor,
        slip.otherDeductionsMinor,
        slip.deductionsMinor,
        slip.netMinor,
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }
}

type SalaryStructureRow = {
  id: string;
  tenantId: string;
  employeeId: string;
  currency: string;
  baseSalaryMinor: bigint;
  allowanceMinor: bigint;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
};

type PayrollRunRow = {
  id: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  taxRateBps: number;
  status: string;
  totalGrossMinor: bigint;
  totalDeductionsMinor: bigint;
  totalNetMinor: bigint;
  createdByUserId: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function serializeStructure(row: SalaryStructureRow) {
  return {
    ...row,
    baseSalaryMinor: row.baseSalaryMinor.toString(),
    allowanceMinor: row.allowanceMinor.toString(),
  };
}

function serializeRun(row: PayrollRunRow) {
  return {
    ...row,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    totalGrossMinor: row.totalGrossMinor.toString(),
    totalDeductionsMinor: row.totalDeductionsMinor.toString(),
    totalNetMinor: row.totalNetMinor.toString(),
  };
}
