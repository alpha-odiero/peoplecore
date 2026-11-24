import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DepartmentListItem, TenantSettings } from '@peoplecore/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  UpdateTenantSettingsDto,
} from './dto/organization.dto';

const departmentInclude = {
  _count: { select: { employees: true } },
  manager: { select: { firstName: true, lastName: true } },
} satisfies Prisma.DepartmentInclude;

type DepartmentRecord = Prisma.DepartmentGetPayload<{ include: typeof departmentInclude }>;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async listDepartments(tenantId: string): Promise<DepartmentListItem[]> {
    const departments = await this.prisma.department.findMany({
      where: { tenantId },
      include: departmentInclude,
      orderBy: { name: 'asc' },
    });
    return departments.map((department) => this.toDepartmentListItem(department));
  }

  async createDepartment(
    dto: CreateDepartmentDto,
    tenantId: string,
    actorUserId: string,
  ): Promise<DepartmentListItem> {
    const code = dto.code ?? `${slugify(dto.name)}-${randomUUID().slice(0, 4)}`;
    const existing = await this.prisma.department.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (existing) throw new AppError(409, 'CODE_CONFLICT', 'Department code already exists');

    const created = await this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          tenantId,
          name: dto.name,
          code,
          parentId: dto.parentId,
          managerEmployeeId: dto.managerEmployeeId,
          locationId: dto.locationId,
          costCenter: dto.costCenter,
        },
        include: departmentInclude,
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId,
          actorType: 'user',
          action: 'department.create',
          resourceType: 'department',
          resourceId: department.id,
          after: toJson({ name: department.name, code: department.code }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'department.created',
          aggregateType: 'department',
          aggregateId: department.id,
          payload: { name: department.name, code: department.code },
        },
        tx,
      );
      return department;
    });
    return this.toDepartmentListItem(created);
  }

  async updateDepartment(
    id: string,
    dto: UpdateDepartmentDto,
    tenantId: string,
    actorUserId: string,
  ): Promise<DepartmentListItem> {
    const existing = await this.prisma.department.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department was not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const department = await tx.department.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          managerEmployeeId: dto.managerEmployeeId ?? existing.managerEmployeeId,
          isActive: dto.isActive ?? existing.isActive,
        },
        include: departmentInclude,
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId,
          actorType: 'user',
          action: dto.isActive === false ? 'department.deactivate' : 'department.update',
          resourceType: 'department',
          resourceId: id,
          before: toJson({ name: existing.name, isActive: existing.isActive }),
          after: toJson({ name: department.name, isActive: department.isActive }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      return department;
    });
    return this.toDepartmentListItem(updated);
  }

  async getTenantSettings(tenantId: string): Promise<TenantSettings> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return {
      name: tenant.name,
      slug: tenant.slug,
      defaultLocale: tenant.defaultLocale,
      defaultTimezone: tenant.defaultTimezone,
      defaultCurrency: tenant.defaultCurrency,
      employeeNumberPrefix: tenant.employeeNumberPrefix,
      employeeNumberPadding: tenant.employeeNumberPadding,
      settings: tenant.settings as Record<string, unknown>,
    };
  }

  async updateTenantSettings(
    dto: UpdateTenantSettingsDto,
    tenantId: string,
    actorUserId: string,
  ): Promise<TenantSettings> {
    const existing = await this.getTenantSettings(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: dto.name ?? existing.name,
          defaultLocale: dto.defaultLocale ?? existing.defaultLocale,
          defaultTimezone: dto.defaultTimezone ?? existing.defaultTimezone,
          defaultCurrency: dto.defaultCurrency?.toUpperCase() ?? existing.defaultCurrency,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId,
          actorType: 'user',
          action: 'tenant.settings_updated',
          resourceType: 'tenant',
          resourceId: tenantId,
          before: toJson(existing as unknown as Record<string, unknown>),
          after: toJson({ ...existing, ...dto } as Record<string, unknown>),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
    });
    return this.getTenantSettings(tenantId);
  }

  private toDepartmentListItem(department: DepartmentRecord): DepartmentListItem {
    const manager = department.manager;
    const head = manager ? [manager.firstName, manager.lastName].filter(Boolean).join(' ') : null;
    return {
      id: department.id,
      code: department.code,
      name: department.name,
      head: head || null,
      employees: department._count.employees,
      status: department.isActive ? 'active' : 'inactive',
    };
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'dept'
  );
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
