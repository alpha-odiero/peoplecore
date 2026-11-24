import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ApprovalRequestListItem,
  ApprovalStatus,
  CollectionResponse,
} from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type { ApprovalQueryDto, CreateApprovalDto, DecideApprovalDto } from './dto/approval.dto';

const includeSteps = {
  steps: { orderBy: { stepOrder: 'asc' as const } },
} satisfies Prisma.ApprovalRequestInclude;
type ApprovalRecord = Prisma.ApprovalRequestGetPayload<{ include: typeof includeSteps }>;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    tenantId: string,
    requesterUserId: string,
    dto: CreateApprovalDto,
  ): Promise<ApprovalRequestListItem> {
    const stepAssignments: Array<{
      stepOrder: number;
      approverUserId: string | null;
      approverRoleId: string | null;
    }> = [];
    for (const step of dto.steps) {
      let approverUserId = step.approverUserId ?? null;
      let approverRoleId: string | null = null;
      if (step.approverRoleKey) {
        const role = await this.prisma.role.findFirst({
          where: { tenantId, key: step.approverRoleKey },
        });
        if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Approver role was not found');
        approverRoleId = role.id;
        if (!approverUserId) {
          const assignment = await this.prisma.userRole.findFirst({
            where: { tenantId, roleId: role.id },
            orderBy: { createdAt: 'asc' },
          });
          if (assignment) approverUserId = assignment.userId;
        }
      }
      if (!approverUserId && !approverRoleId) {
        throw new AppError(
          422,
          'APPROVER_REQUIRED',
          'Each step requires an approver or approver role',
        );
      }
      stepAssignments.push({ stepOrder: step.stepOrder, approverUserId, approverRoleId });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.create({
        data: {
          tenantId,
          type: dto.type,
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          requesterUserId,
          currentStep: Math.min(...dto.steps.map((step) => step.stepOrder)),
          metadata: toJson(dto.metadata ?? {}),
        },
        include: includeSteps,
      });
      for (const assignment of stepAssignments) {
        await tx.approvalStep.create({
          data: {
            tenantId,
            approvalRequestId: request.id,
            stepOrder: assignment.stepOrder,
            approverUserId: assignment.approverUserId,
            approverRoleId: assignment.approverRoleId,
          },
        });
      }
      await this.audit.write({
        tenantId,
        actorUserId: requesterUserId,
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: request.id,
        after: { type: dto.type, subjectType: dto.subjectType, subjectId: dto.subjectId },
      });
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'approval.requested',
          aggregateType: 'approval_request',
          aggregateId: request.id,
          payload: {
            recipientUserIds: stepAssignments.map((step) => step.approverUserId).filter(Boolean),
            subject: 'Approval requested',
            message: `A ${dto.type} approval is waiting for you`,
            approvalId: request.id,
          },
        },
        tx,
      );
      return tx.approvalRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: includeSteps,
      });
    });

    return this.toListItem(created);
  }

  async list(
    tenantId: string,
    userId: string,
    query: ApprovalQueryDto,
  ): Promise<CollectionResponse<ApprovalRequestListItem>> {
    const scope = query.scope ?? 'inbox';
    const where: Prisma.ApprovalRequestWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (scope === 'mine') where.requesterUserId = userId;
    if (scope === 'inbox') {
      where.status = query.status ?? 'pending';
      where.steps = { some: { approverUserId: userId, status: 'pending' } };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.approvalRequest.findMany({
        where,
        include: includeSteps,
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.approvalRequest.count({ where }),
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

  async get(tenantId: string, id: string): Promise<ApprovalRequestListItem> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id, tenantId },
      include: includeSteps,
    });
    if (!request) throw new AppError(404, 'APPROVAL_NOT_FOUND', 'Approval request was not found');
    return this.toListItem(request);
  }

  async decide(
    tenantId: string,
    userId: string,
    id: string,
    dto: DecideApprovalDto,
  ): Promise<ApprovalRequestListItem> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id, tenantId },
      include: includeSteps,
    });
    if (!request) throw new AppError(404, 'APPROVAL_NOT_FOUND', 'Approval request was not found');
    if (request.status !== 'pending') {
      throw new AppError(409, 'APPROVAL_CLOSED', 'Approval request is already completed');
    }
    const currentStep = request.steps.find(
      (step) => step.stepOrder === request.currentStep && step.status === 'pending',
    );
    if (!currentStep) throw new AppError(409, 'NO_PENDING_STEP', 'No pending approval step');
    if (currentStep.approverUserId !== userId) {
      throw new AppError(403, 'NOT_APPROVER', 'You are not assigned to this approval step');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: currentStep.id },
        data: {
          status: dto.decision,
          decidedAt: new Date(),
          comment: dto.comment,
        },
      });

      let status: ApprovalStatus = 'pending';
      let nextApproverId: string | null = null;
      if (dto.decision === 'rejected') {
        status = 'rejected';
        await tx.approvalStep.updateMany({
          where: {
            approvalRequestId: id,
            status: 'pending',
          },
          data: { status: 'skipped' },
        });
      } else {
        const next = await tx.approvalStep.findFirst({
          where: { approvalRequestId: id, status: 'pending' },
          orderBy: { stepOrder: 'asc' },
        });
        if (next) {
          nextApproverId = next.approverUserId;
        } else {
          status = 'approved';
        }
      }

      const final = await tx.approvalRequest.update({
        where: { id },
        data: {
          status,
          currentStep:
            status === 'pending' && nextApproverId
              ? currentStep.stepOrder + 1
              : request.currentStep,
          completedAt: status === 'pending' ? null : new Date(),
        },
        include: includeSteps,
      });

      await this.audit.write({
        tenantId,
        actorUserId: userId,
        action: dto.decision === 'approved' ? 'approval.approved' : 'approval.rejected',
        resourceType: 'approval_request',
        resourceId: id,
        after: { stepOrder: currentStep.stepOrder, decision: dto.decision, comment: dto.comment },
      });
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'approval.decided',
          aggregateType: 'approval_request',
          aggregateId: id,
          payload: {
            recipientUserIds: [
              request.requesterUserId,
              ...(nextApproverId ? [nextApproverId] : []),
            ],
            subject: `Approval ${dto.decision}`,
            message: `Approval ${id} was ${dto.decision}`,
            approvalId: id,
            decision: dto.decision,
            approverUserId: userId,
          },
        },
        tx,
      );
      return final;
    });

    return this.toListItem(updated);
  }

  private toListItem(request: ApprovalRecord): ApprovalRequestListItem {
    return {
      id: request.id,
      type: request.type,
      subjectType: request.subjectType,
      subjectId: request.subjectId,
      requesterUserId: request.requesterUserId,
      status: request.status,
      currentStep: request.currentStep,
      requestedAt: request.requestedAt.toISOString(),
      completedAt: request.completedAt ? request.completedAt.toISOString() : null,
      metadata: toRecord(request.metadata),
      steps: request.steps.map((step) => ({
        id: step.id,
        stepOrder: step.stepOrder,
        approverUserId: step.approverUserId,
        approverRoleId: step.approverRoleId,
        status: step.status,
        decidedAt: step.decidedAt ? step.decidedAt.toISOString() : null,
        comment: step.comment,
      })),
    };
  }
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
