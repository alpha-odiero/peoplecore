import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  type AuditEventListItem,
  type CollectionResponse,
  type DashboardSummary,
  type PermissionListItem,
  type RoleListItem,
  type UserListItem,
} from '@peoplecore/shared';
import { hash } from 'argon2';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type {
  AssignRoleDto,
  AuditQueryDto,
  InviteUserDto,
  UpdateRolePermissionsDto,
} from './dto/admin.dto';

const userInclude = {
  userRoles: { include: { role: { select: { key: true } } } },
} satisfies Prisma.UserInclude;
type UserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }>;

const roleInclude = {
  rolePermissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;
type RoleRecord = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async dashboardSummary(tenantId: string): Promise<DashboardSummary> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [
      totalEmployees,
      activeEmployees,
      activeDepartments,
      pendingApprovals,
      pendingLeaveRequests,
      attendanceToday,
      openPositions,
      auditEvents24h,
      recent,
    ] = await this.prisma.$transaction([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.employee.count({ where: { tenantId, status: 'active' } }),
      this.prisma.department.count({ where: { tenantId, isActive: true } }),
      this.prisma.approvalRequest.count({ where: { tenantId, status: 'pending' } }),
      this.prisma.leaveRequest.count({ where: { tenantId, status: 'pending' } }),
      this.prisma.attendanceRecord.count({ where: { tenantId, workDate: today } }),
      this.prisma.jobVacancy.count({ where: { tenantId, status: 'open' } }),
      this.prisma.auditEvent.count({ where: { tenantId, occurredAt: { gte: since } } }),
      this.prisma.auditEvent.findMany({
        where: { tenantId },
        include: { actor: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      totalEmployees,
      activeEmployees,
      activeDepartments,
      pendingApprovals,
      pendingLeaveRequests,
      attendanceToday,
      openPositions,
      auditEvents24h,
      recentActivity: recent.map((event) => ({
        id: event.id,
        action: event.action,
        resourceType: event.resourceType,
        actor: actorName(event.actor?.firstName, event.actor?.lastName, event.actor?.email),
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }

  async listAudit(
    query: AuditQueryDto,
    tenantId: string,
  ): Promise<CollectionResponse<AuditEventListItem>> {
    const filters: Prisma.AuditEventWhereInput[] = [{ tenantId }];
    const search = query.q?.trim();
    if (search) {
      filters.push({
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { resourceType: { contains: search, mode: 'insensitive' } },
          { requestId: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.action) filters.push({ action: { contains: query.action, mode: 'insensitive' } });
    if (query.resourceType) {
      filters.push({ resourceType: { contains: query.resourceType, mode: 'insensitive' } });
    }
    if (query.resourceId) filters.push({ resourceId: query.resourceId });

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where: { AND: filters },
        include: { actor: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditEvent.count({ where: { AND: filters } }),
    ]);

    return {
      data: rows.map((event) => ({
        id: event.id,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        actor: actorName(event.actor?.firstName, event.actor?.lastName, event.actor?.email),
        occurredAt: event.occurredAt.toISOString(),
        requestId: event.requestId,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async listUsers(tenantId: string): Promise<UserListItem[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      include: userInclude,
      orderBy: { email: 'asc' },
    });
    return users.map((user) => this.toUserListItem(user));
  }

  async listRoles(tenantId: string): Promise<RoleListItem[]> {
    const roles = await this.prisma.role.findMany({
      where: { tenantId },
      include: roleInclude,
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => this.toRoleListItem(role));
  }

  async listPermissions(): Promise<PermissionListItem[]> {
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: [...PERMISSIONS] } },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    return permissions.map((permission) => ({
      id: permission.id,
      key: permission.key,
      category: permission.category,
      description: permission.description,
    }));
  }

  async inviteUser(
    dto: InviteUserDto,
    tenantId: string,
    actorUserId: string,
  ): Promise<UserListItem> {
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email } });
    if (existing) throw new AppError(409, 'EMAIL_IN_USE', 'A user with that email already exists');
    const role = await this.prisma.role.findFirst({ where: { tenantId, key: dto.roleKey } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');

    const passwordHash = await hash(dto.password, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 3,
      parallelism: 1,
    });
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: 'active',
        },
        include: userInclude,
      });
      await tx.userRole.create({
        data: { tenantId, userId: created.id, roleId: role.id, scopeType: 'tenant' },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId,
          actorType: 'user',
          action: 'user.invited',
          resourceType: 'user',
          resourceId: created.id,
          after: toJson({ email: created.email, role: role.key }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'user.invited',
          aggregateType: 'user',
          aggregateId: created.id,
          payload: { email: created.email, role: role.key },
        },
        tx,
      );
      return created;
    });
    return this.toUserListItem(user);
  }

  async assignRole(
    dto: AssignRoleDto,
    tenantId: string,
    actorUserId: string,
  ): Promise<UserListItem> {
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, tenantId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');

    const targetRole = await this.prisma.role.findFirst({
      where: { tenantId, key: dto.roleKey },
    });
    if (!targetRole) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');

    const existing = await this.prisma.userRole.findFirst({
      where: {
        tenantId,
        userId: dto.userId,
        roleId: targetRole.id,
        scopeType: dto.scopeType,
        scopeRefId: dto.scopeRefId ?? null,
      },
    });
    if (!existing) {
      await this.prisma.$transaction(async (tx) => {
        await tx.userRole.create({
          data: {
            tenantId,
            userId: dto.userId,
            roleId: targetRole.id,
            scopeType: dto.scopeType,
            scopeRefId: dto.scopeRefId,
          },
        });
        await tx.user.update({
          where: { id: dto.userId },
          data: { permissionVersion: { increment: 1 } },
        });
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorUserId,
            actorType: 'user',
            action: 'user.role_assigned',
            resourceType: 'user',
            resourceId: dto.userId,
            after: toJson({ role: targetRole.key, scopeType: dto.scopeType }),
            metadata: {} as Prisma.InputJsonValue,
            correlationId: getRequestContext().correlationId || undefined,
            requestId: getRequestContext().requestId || undefined,
          },
        });
      });
    }

    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id: dto.userId },
      include: userInclude,
    });
    return this.toUserListItem(updated);
  }

  async updateRolePermissions(
    dto: UpdateRolePermissionsDto,
    tenantId: string,
    actorUserId: string,
  ): Promise<RoleListItem> {
    const role = await this.prisma.role.findFirst({ where: { id: dto.roleId, tenantId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: dto.permissionKeys } },
      select: { id: true, key: true },
    });
    if (permissions.length !== dto.permissionKeys.length) {
      throw new AppError(422, 'INVALID_PERMISSIONS', 'One or more permissions are invalid');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { tenantId, roleId: dto.roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          tenantId,
          roleId: dto.roleId,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
      const assignments = await tx.userRole.findMany({
        where: { tenantId, roleId: dto.roleId },
        select: { userId: true },
      });
      const userIds = [...new Set(assignments.map((assignment) => assignment.userId))];
      if (userIds.length > 0) {
        await tx.user.updateMany({
          where: { tenantId, id: { in: userIds } },
          data: { permissionVersion: { increment: 1 } },
        });
      }
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId,
          actorType: 'user',
          action: 'role.permissions_updated',
          resourceType: 'role',
          resourceId: dto.roleId,
          after: toJson({ permissionKeys: dto.permissionKeys }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
    });

    const updated = await this.prisma.role.findUniqueOrThrow({
      where: { id: dto.roleId },
      include: roleInclude,
    });
    return this.toRoleListItem(updated);
  }

  private toUserListItem(user: UserRecord): UserListItem {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles: user.userRoles.map((assignment) => assignment.role.key),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }

  private toRoleListItem(role: RoleRecord): RoleListItem {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      permissionKeys: role.rolePermissions.map((grant) => grant.permission.key),
    };
  }
}

function actorName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  return [firstName, lastName].filter(Boolean).join(' ') || email || 'System';
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
