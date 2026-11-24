import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma, type LeaveRequestStatus } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { workingDaysBetween } from '../../common/working-days';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type { DomainEvent } from '../../platform/outbox/outbox-dispatcher.service';
import { OutboxDispatcherService } from '../../platform/outbox/outbox-dispatcher.service';
import { ApprovalsService } from '../approvals/approvals.service';
import type { CreateLeaveRequestDto, CreateLeaveTypeDto, LeaveQueryDto } from './dto/leave.dto';

@Injectable()
export class LeaveService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly dispatcher: OutboxDispatcherService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register('approval.decided', (event) => this.onApprovalDecided(event));
  }

  listTypes(tenantId: string) {
    return this.prisma.leaveType.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
  }

  createType(tenantId: string, dto: CreateLeaveTypeDto) {
    return this.prisma.leaveType.create({
      data: {
        tenantId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        annualAllowanceDays: dto.annualAllowanceDays ?? 0,
        accrualPerMonthDays: dto.accrualPerMonthDays ?? 0,
        carryOverAllowed: dto.carryOverAllowed ?? false,
      },
    });
  }

  async listBalances(tenantId: string, employeeId?: string) {
    const rows = await this.prisma.leaveBalance.findMany({
      where: { tenantId, ...(employeeId ? { employeeId } : {}) },
      include: { leaveType: { select: { code: true, name: true } } },
      orderBy: [{ employeeId: 'asc' }, { year: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      leaveTypeId: row.leaveTypeId,
      code: row.leaveType.code,
      name: row.leaveType.name,
      year: row.year,
      allowanceDays: row.allowanceDays.toNumber(),
      usedDays: row.usedDays.toNumber(),
      pendingDays: row.pendingDays.toNumber(),
      remainingDays:
        row.allowanceDays.toNumber() - row.usedDays.toNumber() - row.pendingDays.toNumber(),
    }));
  }

  async createRequest(tenantId: string, requesterUserId: string, dto: CreateLeaveRequestDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId, tenantId, isActive: true },
    });
    if (!leaveType) throw new AppError(404, 'LEAVE_TYPE_NOT_FOUND', 'Leave type was not found');

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new AppError(422, 'INVALID_DATES', 'Leave end date must be on or after start date');
    }
    const days = workingDaysBetween(start, end);
    if (days < 1)
      throw new AppError(422, 'INVALID_DATES', 'Leave request must cover at least one working day');

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        employeeId: dto.employeeId,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap)
      throw new AppError(409, 'LEAVE_OVERLAP', 'Employee already has leave in this period');

    const year = start.getUTCFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        tenantId_employeeId_leaveTypeId_year: {
          tenantId,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          year,
        },
      },
    });
    const allowance = balance?.allowanceDays.toNumber() ?? leaveType.annualAllowanceDays.toNumber();
    const used = balance?.usedDays.toNumber() ?? 0;
    const pending = balance?.pendingDays.toNumber() ?? 0;
    if (allowance - used - pending < days) {
      throw new AppError(422, 'INSUFFICIENT_BALANCE', 'Insufficient leave balance');
    }

    const approverUserId = await this.resolveApprover(
      tenantId,
      dto.approverUserId,
      requesterUserId,
    );
    const request = await this.prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate: start,
        endDate: end,
        days,
        reason: dto.reason,
        status: 'pending',
        createdByUserId: requesterUserId,
      },
    });

    try {
      const approval = await this.approvals.create(tenantId, requesterUserId, {
        type: 'leave',
        subjectType: 'leave_request',
        subjectId: request.id,
        steps: [{ stepOrder: 1, approverUserId }],
        metadata: { days, startDate: dto.startDate, endDate: dto.endDate },
      });
      const updated = await this.prisma.leaveRequest.update({
        where: { id: request.id },
        data: { approvalRequestId: approval.id },
      });
      await this.prisma.leaveBalance.upsert({
        where: {
          tenantId_employeeId_leaveTypeId_year: {
            tenantId,
            employeeId: dto.employeeId,
            leaveTypeId: dto.leaveTypeId,
            year,
          },
        },
        update: { allowanceDays: allowance, pendingDays: { increment: days } },
        create: {
          tenantId,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          year,
          allowanceDays: allowance,
          pendingDays: days,
        },
      });
      await this.audit.write({
        tenantId,
        actorUserId: requesterUserId,
        action: 'leave.requested',
        resourceType: 'leave_request',
        resourceId: request.id,
        after: { days, startDate: dto.startDate, endDate: dto.endDate, employeeId: dto.employeeId },
      });
      await this.outbox.publish({
        tenantId,
        eventType: 'leave.requested',
        aggregateType: 'leave_request',
        aggregateId: request.id,
        payload: {
          recipientUserIds: [approverUserId],
          subject: 'Leave requested',
          message: `Leave request for ${days} working day(s) is waiting for approval`,
          leaveRequestId: request.id,
        },
      });
      return { ...updated, days: updated.days.toNumber() };
    } catch (error) {
      await this.prisma.leaveRequest.delete({ where: { id: request.id } });
      throw error;
    }
  }

  listRequests(tenantId: string, query: LeaveQueryDto) {
    const where: Prisma.LeaveRequestWhereInput = {
      tenantId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status as LeaveRequestStatus } : {}),
    };
    return this.prisma.leaveRequest.findMany({
      where,
      include: {
        employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
        leaveType: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async decide(tenantId: string, userId: string, id: string, decision: 'approved' | 'rejected') {
    const request = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!request) throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'Leave request was not found');
    if (request.status !== 'pending') {
      throw new AppError(409, 'LEAVE_CLOSED', 'Leave request is already completed');
    }
    if (!request.approvalRequestId) {
      throw new AppError(409, 'NO_APPROVAL', 'Leave request has no approval workflow');
    }
    await this.approvals.decide(tenantId, userId, request.approvalRequestId, { decision });
    return this.prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
  }

  async cancel(tenantId: string, userId: string, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!request) throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'Leave request was not found');
    if (request.status !== 'pending') {
      throw new AppError(409, 'LEAVE_CLOSED', 'Only pending leave can be cancelled');
    }
    const days = request.days.toNumber();
    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: { status: 'cancelled', decidedByUserId: userId, decidedAt: new Date() },
      });
      await tx.leaveBalance.updateMany({
        where: {
          tenantId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year: request.startDate.getUTCFullYear(),
        },
        data: { pendingDays: { decrement: days } },
      });
    });
    return this.prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
  }

  private async resolveApprover(
    tenantId: string,
    requested: string | undefined,
    requesterUserId: string,
  ) {
    if (requested) {
      const user = await this.prisma.user.findFirst({
        where: { id: requested, tenantId, status: 'active' },
      });
      if (!user) throw new AppError(404, 'APPROVER_NOT_FOUND', 'Approver was not found');
      return requested;
    }
    const managerRole = await this.prisma.role.findFirst({ where: { tenantId, key: 'manager' } });
    const assignment = managerRole
      ? await this.prisma.userRole.findFirst({
          where: { tenantId, roleId: managerRole.id },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    if (assignment) return assignment.userId;
    const admin = await this.prisma.user.findFirst({
      where: { tenantId, status: 'active', userRoles: { some: { role: { key: 'tenant_admin' } } } },
    });
    return admin?.id ?? requesterUserId;
  }

  private async onApprovalDecided(event: DomainEvent): Promise<void> {
    const payload = toRecord(event.payload);
    const approvalId = typeof payload.approvalId === 'string' ? payload.approvalId : null;
    const decision =
      payload.decision === 'approved'
        ? 'approved'
        : payload.decision === 'rejected'
          ? 'rejected'
          : null;
    if (!approvalId || !decision) return;
    const request = await this.prisma.leaveRequest.findFirst({
      where: { tenantId: event.tenantId, approvalRequestId: approvalId },
    });
    if (!request || request.status !== 'pending') return;

    const days = request.days.toNumber();
    const year = request.startDate.getUTCFullYear();
    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: decision,
          decidedByUserId:
            typeof payload.approverUserId === 'string' ? payload.approverUserId : null,
          decidedAt: new Date(),
        },
      });
      await tx.leaveBalance.updateMany({
        where: {
          tenantId: event.tenantId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
        data: {
          pendingDays: { decrement: days },
          ...(decision === 'approved' ? { usedDays: { increment: days } } : {}),
        },
      });
    });
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
