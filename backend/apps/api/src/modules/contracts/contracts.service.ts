import { Injectable } from '@nestjs/common';
import {
  canTransitionContractStatus,
  type AuthenticatedUser,
  type CollectionResponse,
  type ContractListItem,
  type ContractStatus,
} from '@peoplecore/shared';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import type { ContractQueryDto, CreateContractDto, UpdateContractDto } from './dto/contracts.dto';

type ContractRecord = Prisma.EmploymentContractGetPayload<object>;

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly policy: PolicyService,
  ) {}

  async list(
    query: ContractQueryDto,
    principal: AuthenticatedUser,
  ): Promise<CollectionResponse<ContractListItem>> {
    const andFilters: Prisma.EmploymentContractWhereInput[] = [
      { tenantId: principal.tenantId },
      { employee: { is: this.policy.employeeWhere(principal) } },
    ];
    if (query.employeeId) andFilters.push({ employeeId: query.employeeId });
    const where: Prisma.EmploymentContractWhereInput = { AND: andFilters };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employmentContract.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.employmentContract.count({ where }),
    ]);
    const canViewSalary = principal.permissions.includes('employees.view_salary');
    return {
      data: rows.map((row) => this.toListItem(row, canViewSalary)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async findOne(id: string, principal: AuthenticatedUser): Promise<ContractListItem> {
    const contract = await this.findRecord(id, principal);
    return this.toListItem(contract, principal.permissions.includes('employees.view_salary'));
  }

  async create(dto: CreateContractDto, principal: AuthenticatedUser): Promise<ContractListItem> {
    await this.ensureEmployee(dto.employeeId, principal);
    if (dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new AppError(422, 'INVALID_DATE_RANGE', 'End date must be after start date');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const count = await tx.employmentContract.count({ where: { tenantId: principal.tenantId } });
      const contract = await tx.employmentContract.create({
        data: {
          tenantId: principal.tenantId,
          employeeId: dto.employeeId,
          contractNumber: `CON-${String(count + 1).padStart(6, '0')}`,
          type: dto.type,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          salaryMinor: dto.salaryMinor === undefined ? null : BigInt(dto.salaryMinor),
          currency: dto.currency,
          payFrequency: dto.payFrequency,
          workingHoursWeek:
            dto.workingHoursWeek === undefined ? null : new Prisma.Decimal(dto.workingHoursWeek),
          probationMonths: dto.probationMonths,
          signedAt: new Date(),
          legalEntityId: dto.legalEntityId,
          notes: dto.notes,
        },
      });
      await tx.employmentHistory.create({
        data: {
          tenantId: principal.tenantId,
          employeeId: dto.employeeId,
          eventType: 'contract_created',
          fromValues: Prisma.JsonNull,
          toValues: toJson({
            contractId: contract.id,
            type: contract.type,
            status: contract.status,
          }),
          effectiveAt: contract.startDate,
          actorUserId: principal.id,
          correlationId: getRequestContext().correlationId || undefined,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.id,
          actorType: 'user',
          action: 'contract.create',
          resourceType: 'contract',
          resourceId: contract.id,
          after: toJson(snapshot(contract, true)),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'contract.created',
          aggregateType: 'contract',
          aggregateId: contract.id,
          payload: {
            employeeId: contract.employeeId,
            type: contract.type,
            status: contract.status,
          },
        },
        tx,
      );
      return contract;
    });

    return this.toListItem(created, principal.permissions.includes('employees.view_salary'));
  }

  async update(
    id: string,
    dto: UpdateContractDto,
    principal: AuthenticatedUser,
  ): Promise<ContractListItem> {
    const existing = await this.findRecord(id, principal);
    if (
      dto.status &&
      dto.status !== existing.status &&
      !canTransitionContractStatus(existing.status, dto.status as ContractStatus)
    ) {
      throw new AppError(
        409,
        'INVALID_CONTRACT_TRANSITION',
        `Cannot change contract status from ${existing.status} to ${dto.status}`,
      );
    }
    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate === undefined ? existing.endDate : new Date(dto.endDate);
    if (endDate && endDate < startDate) {
      throw new AppError(422, 'INVALID_DATE_RANGE', 'End date must be after start date');
    }
    const terminating = dto.status === 'terminated' && existing.status !== 'terminated';
    if (terminating && !dto.reason?.trim()) {
      throw new AppError(422, 'TERMINATION_REASON_REQUIRED', 'Termination reason is required');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.employmentContract.update({
        where: { id },
        data: {
          type: dto.type,
          status: dto.status,
          startDate,
          endDate,
          salaryMinor: dto.salaryMinor === undefined ? undefined : BigInt(dto.salaryMinor),
          currency: dto.currency,
          payFrequency: dto.payFrequency,
          workingHoursWeek:
            dto.workingHoursWeek === undefined
              ? undefined
              : new Prisma.Decimal(dto.workingHoursWeek),
          probationMonths: dto.probationMonths,
          legalEntityId: dto.legalEntityId,
          notes: dto.notes,
        },
      });
      await tx.employmentHistory.create({
        data: {
          tenantId: principal.tenantId,
          employeeId: contract.employeeId,
          eventType: 'contract_updated',
          fromValues: toJson(snapshot(existing, true)),
          toValues: toJson(snapshot(contract, true)),
          effectiveAt: new Date(),
          actorUserId: principal.id,
          reason: dto.reason,
          correlationId: getRequestContext().correlationId || undefined,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.id,
          actorType: 'user',
          action: 'contract.updated',
          resourceType: 'contract',
          resourceId: contract.id,
          before: toJson(snapshot(existing, true)),
          after: toJson({ ...snapshot(contract, true), reason: dto.reason ?? null }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'contract.updated',
          aggregateType: 'contract',
          aggregateId: contract.id,
          payload: {
            status: contract.status,
            version: contract.updatedAt.toISOString(),
            reason: dto.reason ?? null,
          },
        },
        tx,
      );

      if (terminating) {
        const employeeBefore = await tx.employee.findUnique({
          where: { id: contract.employeeId },
          select: { status: true },
        });
        if (!employeeBefore) {
          throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
        }
        const terminationDate = new Date(
          dto.terminationDate ?? dto.endDate ?? new Date().toISOString().slice(0, 10),
        );
        await tx.employee.update({
          where: { id: contract.employeeId },
          data: {
            status: 'terminated',
            terminationDate,
            updatedById: principal.id,
            version: { increment: 1 },
          },
        });
        await tx.employmentHistory.create({
          data: {
            tenantId: principal.tenantId,
            employeeId: contract.employeeId,
            eventType: 'status_changed',
            fromValues: toJson({ status: employeeBefore.status }),
            toValues: toJson({
              status: 'terminated',
              contractId: contract.id,
              terminationDate: terminationDate.toISOString().slice(0, 10),
            }),
            effectiveAt: terminationDate,
            actorUserId: principal.id,
            reason: dto.reason,
            correlationId: getRequestContext().correlationId || undefined,
          },
        });
        await tx.auditEvent.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.id,
            actorType: 'user',
            action: 'employee.status_changed',
            resourceType: 'employee',
            resourceId: contract.employeeId,
            before: toJson({ status: employeeBefore.status }),
            after: toJson({
              status: 'terminated',
              reason: dto.reason ?? null,
              terminationDate: terminationDate.toISOString().slice(0, 10),
            }),
            metadata: {} as Prisma.InputJsonValue,
            correlationId: getRequestContext().correlationId || undefined,
            requestId: getRequestContext().requestId || undefined,
          },
        });
        await this.outbox.publish(
          {
            tenantId: principal.tenantId,
            eventType: 'employee.status_changed',
            aggregateType: 'employee',
            aggregateId: contract.employeeId,
            payload: { from: employeeBefore.status, to: 'terminated', reason: dto.reason ?? null },
          },
          tx,
        );
        await this.outbox.publish(
          {
            tenantId: principal.tenantId,
            eventType: 'offboarding.triggered',
            aggregateType: 'employee',
            aggregateId: contract.employeeId,
            payload: {
              reason: dto.reason ?? null,
              terminationDate: terminationDate.toISOString().slice(0, 10),
            },
          },
          tx,
        );
      }
      return contract;
    });

    return this.toListItem(updated, principal.permissions.includes('employees.view_salary'));
  }

  private async ensureEmployee(employeeId: string, principal: AuthenticatedUser): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        AND: [
          { tenantId: principal.tenantId },
          { id: employeeId },
          this.policy.employeeWhere(principal),
        ],
      },
      select: { id: true },
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
  }

  private async findRecord(id: string, principal: AuthenticatedUser): Promise<ContractRecord> {
    const contract = await this.prisma.employmentContract.findFirst({
      where: {
        AND: [
          { tenantId: principal.tenantId },
          { id },
          { employee: { is: this.policy.employeeWhere(principal) } },
        ],
      },
    });
    if (!contract) throw new AppError(404, 'CONTRACT_NOT_FOUND', 'Contract was not found');
    return contract;
  }

  private toListItem(contract: ContractRecord, canViewSalary: boolean): ContractListItem {
    return {
      id: contract.id,
      contractNumber: contract.contractNumber,
      employeeId: contract.employeeId,
      type: contract.type,
      status: contract.status,
      startDate: contract.startDate.toISOString().slice(0, 10),
      endDate: contract.endDate ? contract.endDate.toISOString().slice(0, 10) : null,
      salaryMinor: canViewSalary ? (contract.salaryMinor?.toString() ?? null) : null,
      currency: canViewSalary ? contract.currency : null,
      payFrequency: contract.payFrequency,
      workingHoursWeek: contract.workingHoursWeek?.toString() ?? null,
      probationMonths: contract.probationMonths,
      signedAt: contract.signedAt?.toISOString() ?? null,
      legalEntityId: contract.legalEntityId,
      notes: contract.notes,
    };
  }
}

function snapshot(contract: ContractRecord, canViewSalary: boolean): Record<string, unknown> {
  return {
    id: contract.id,
    contractNumber: contract.contractNumber,
    employeeId: contract.employeeId,
    type: contract.type,
    status: contract.status,
    startDate: contract.startDate.toISOString().slice(0, 10),
    endDate: contract.endDate?.toISOString().slice(0, 10) ?? null,
    salaryMinor: canViewSalary ? (contract.salaryMinor?.toString() ?? null) : null,
    currency: canViewSalary ? contract.currency : null,
    payFrequency: contract.payFrequency,
    probationMonths: contract.probationMonths,
  };
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
