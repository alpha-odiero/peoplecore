import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  canTransitionEmployeeStatus,
  type AuthenticatedUser,
  type CollectionResponse,
  type EmployeeListItem,
  type EmployeeStatus,
  type EmploymentHistoryListItem,
} from '@peoplecore/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import type {
  BulkChangeEmployeeStatusDto,
  ChangeEmployeeStatusDto,
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
} from './dto/employees.dto';

const employeeInclude = {
  department: { select: { name: true } },
  jobProfile: { select: { title: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRecord = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly policy: PolicyService,
  ) {}

  async list(
    query: EmployeeQueryDto,
    principal: AuthenticatedUser,
  ): Promise<CollectionResponse<EmployeeListItem>> {
    const search = query.q?.trim();
    const filters: Prisma.EmployeeWhereInput[] = [this.policy.employeeWhere(principal)];
    if (query.status) filters.push({ status: query.status });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });
    if (search) {
      filters.push({
        OR: [
          { employeeNumber: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { workEmail: { contains: search, mode: 'insensitive' } },
          { department: { name: { contains: search, mode: 'insensitive' } } },
          { jobProfile: { title: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    const orderBy: Prisma.EmployeeOrderByWithRelationInput =
      query.sortBy === 'department'
        ? { department: { name: 'asc' } }
        : query.sortBy === 'status'
          ? { status: 'asc' }
          : { lastName: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where: { AND: filters },
        include: employeeInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.employee.count({ where: { AND: filters } }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async create(dto: CreateEmployeeDto, principal: AuthenticatedUser): Promise<EmployeeListItem> {
    const tenantId = principal.tenantId;
    const employeeNumber = await this.nextEmployeeNumber(tenantId);
    const status = dto.status ?? 'onboarding';

    const created = await this.prisma.$transaction(async (tx) => {
      const jobProfileId = dto.jobProfileTitle
        ? await this.resolveJobProfile(tx, tenantId, dto.jobProfileTitle)
        : undefined;
      const employee = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber,
          firstName: dto.firstName,
          lastName: dto.lastName,
          workEmail: dto.workEmail,
          departmentId: dto.departmentId,
          managerEmployeeId: dto.managerEmployeeId,
          jobProfileId,
          employmentType: dto.employmentType ?? 'full_time',
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          status,
          createdById: principal.id,
          updatedById: principal.id,
        },
        include: employeeInclude,
      });
      await tx.employmentHistory.create({
        data: {
          tenantId,
          employeeId: employee.id,
          eventType: 'created',
          toValues: toJson({
            employeeNumber,
            firstName: employee.firstName,
            lastName: employee.lastName,
            status: employee.status,
          }),
          effectiveAt: new Date(),
          actorUserId: principal.id,
          correlationId: getRequestContext().correlationId || undefined,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId: principal.id,
          actorType: 'user',
          action: 'employee.create',
          resourceType: 'employee',
          resourceId: employee.id,
          after: toJson({ employeeNumber, status }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'employee.created',
          aggregateType: 'employee',
          aggregateId: employee.id,
          payload: { employeeNumber, status },
        },
        tx,
      );
      return employee;
    });

    return this.toListItem(created);
  }

  async findOne(id: string, principal: AuthenticatedUser): Promise<EmployeeListItem> {
    const employee = await this.prisma.employee.findFirst({
      where: { AND: [this.policy.employeeWhere(principal), { id }] },
      include: employeeInclude,
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
    await this.recordDataAccess(principal, id, ['identity', 'status', 'organization']);
    return this.toListItem(employee);
  }

  async history(id: string, principal: AuthenticatedUser): Promise<EmploymentHistoryListItem[]> {
    await this.findRecord(id, principal);
    const rows = await this.prisma.employmentHistory.findMany({
      where: { tenantId: principal.tenantId, employeeId: id },
      orderBy: { effectiveAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      fromValues: asRecord(row.fromValues),
      toValues: asRecord(row.toValues),
      effectiveAt: row.effectiveAt.toISOString(),
      reason: row.reason,
    }));
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    principal: AuthenticatedUser,
  ): Promise<EmployeeListItem> {
    const existing = await this.findRecord(id, principal);
    const jobProfileId =
      dto.jobProfileTitle === undefined
        ? existing.jobProfileId
        : await this.resolveJobProfile(this.prisma, principal.tenantId, dto.jobProfileTitle);

    const updated = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          firstName: dto.firstName ?? existing.firstName,
          lastName: dto.lastName ?? existing.lastName,
          workEmail: dto.workEmail ?? existing.workEmail,
          departmentId: dto.departmentId ?? existing.departmentId,
          managerEmployeeId: dto.managerEmployeeId ?? existing.managerEmployeeId,
          jobProfileId,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : existing.hireDate,
          updatedById: principal.id,
          version: { increment: 1 },
        },
        include: employeeInclude,
      });
      await tx.employmentHistory.create({
        data: {
          tenantId: principal.tenantId,
          employeeId: id,
          eventType: 'updated',
          fromValues: snapshot(existing),
          toValues: snapshot(employee),
          effectiveAt: new Date(),
          actorUserId: principal.id,
          correlationId: getRequestContext().correlationId || undefined,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.id,
          actorType: 'user',
          action: 'employee.update',
          resourceType: 'employee',
          resourceId: id,
          before: snapshot(existing),
          after: snapshot(employee),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'employee.updated',
          aggregateType: 'employee',
          aggregateId: id,
          payload: { version: employee.version },
        },
        tx,
      );
      return employee;
    });

    return this.toListItem(updated);
  }

  async changeStatus(
    id: string,
    dto: ChangeEmployeeStatusDto,
    principal: AuthenticatedUser,
  ): Promise<EmployeeListItem> {
    const existing = await this.findRecord(id, principal);
    return this.applyStatusChange(existing, dto.status, dto.reason, principal);
  }

  async bulkChangeStatus(
    dto: BulkChangeEmployeeStatusDto,
    principal: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    const employees = await this.prisma.employee.findMany({
      where: { AND: [this.policy.employeeWhere(principal), { id: { in: dto.ids } }] },
      include: employeeInclude,
    });
    if (employees.length !== dto.ids.length) {
      throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'One or more employees were not found');
    }
    for (const employee of employees) {
      if (!canTransitionEmployeeStatus(employee.status, dto.status)) {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          `Cannot change ${employee.employeeNumber} from ${employee.status} to ${dto.status}`,
        );
      }
    }

    let updated = 0;
    for (const employee of employees) {
      await this.applyStatusChange(employee, dto.status, dto.reason, principal);
      updated += 1;
    }
    return { updated };
  }

  private async applyStatusChange(
    existing: EmployeeRecord,
    status: EmployeeStatus,
    reason: string | undefined,
    principal: AuthenticatedUser,
  ): Promise<EmployeeListItem> {
    if (existing.status === status) {
      throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Employee already has that status');
    }
    if (!canTransitionEmployeeStatus(existing.status, status)) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Cannot change status from ${existing.status} to ${status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.employee.updateMany({
        where: { id: existing.id, version: existing.version },
        data: {
          status,
          terminationDate: status === 'terminated' ? new Date() : existing.terminationDate,
          updatedById: principal.id,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Employee was changed by another request');
      }
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: existing.id },
        include: employeeInclude,
      });
      await tx.employmentHistory.create({
        data: {
          tenantId: principal.tenantId,
          employeeId: existing.id,
          eventType: 'status_changed',
          fromValues: toJson({ status: existing.status }),
          toValues: toJson({ status }),
          effectiveAt: new Date(),
          actorUserId: principal.id,
          reason,
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
          resourceId: existing.id,
          before: toJson({ status: existing.status }),
          after: toJson({ status, reason: reason ?? null }),
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
          aggregateId: existing.id,
          payload: { from: existing.status, to: status, reason: reason ?? null },
        },
        tx,
      );
      return employee;
    });
    return this.toListItem(updated);
  }

  private async findRecord(id: string, principal: AuthenticatedUser): Promise<EmployeeRecord> {
    const employee = await this.prisma.employee.findFirst({
      where: { AND: [this.policy.employeeWhere(principal), { id }] },
      include: employeeInclude,
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
    return employee;
  }

  private async nextEmployeeNumber(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const prefix = tenant.employeeNumberPrefix;
    const last = await this.prisma.employee.findFirst({
      where: { tenantId, employeeNumber: { startsWith: prefix } },
      orderBy: { employeeNumber: 'desc' },
      select: { employeeNumber: true },
    });
    const suffix = Number(last?.employeeNumber.slice(prefix.length) ?? '0');
    return `${prefix}${String(Number.isFinite(suffix) ? suffix + 1 : 1).padStart(tenant.employeeNumberPadding, '0')}`;
  }

  private async resolveJobProfile(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    title: string,
  ): Promise<string> {
    const existing = await client.jobProfile.findFirst({
      where: { tenantId, title: { equals: title, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const code = `${slugify(title)}-${randomUUID().slice(0, 6)}`;
    const created = await client.jobProfile.create({
      data: { tenantId, code, title },
      select: { id: true },
    });
    return created.id;
  }

  private async recordDataAccess(
    principal: AuthenticatedUser,
    employeeId: string,
    fields: string[],
  ): Promise<void> {
    await this.prisma.dataAccessEvent.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.id,
        resourceType: 'employee',
        resourceId: employeeId,
        fieldsAccessed: fields,
        purpose: 'employee_profile_view',
      },
    });
  }

  private toListItem(employee: EmployeeRecord): EmployeeListItem {
    return {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      preferredName: employee.preferredName,
      workEmail: employee.workEmail,
      status: employee.status,
      employmentType: employee.employmentType,
      hireDate: employee.hireDate ? employee.hireDate.toISOString().slice(0, 10) : null,
      terminationDate: employee.terminationDate
        ? employee.terminationDate.toISOString().slice(0, 10)
        : null,
      departmentId: employee.departmentId,
      departmentName: employee.department?.name ?? null,
      title: employee.jobProfile?.title ?? null,
      locationId: employee.locationId,
      positionId: employee.positionId,
      managerEmployeeId: employee.managerEmployeeId,
      version: employee.version,
    };
  }
}

function snapshot(employee: EmployeeRecord): Prisma.InputJsonValue {
  return toJson({
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    departmentId: employee.departmentId,
    managerEmployeeId: employee.managerEmployeeId,
    jobProfileId: employee.jobProfileId,
    status: employee.status,
    employmentType: employee.employmentType,
    hireDate: employee.hireDate?.toISOString().slice(0, 10) ?? null,
    version: employee.version,
  });
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'role'
  );
}
