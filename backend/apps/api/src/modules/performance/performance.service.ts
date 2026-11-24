import { Injectable } from '@nestjs/common';
import { GoalStatus, PerformanceCycleStatus, Prisma, ReviewStatus } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import type {
  CreateFeedbackDto,
  CreatePerformanceCycleDto,
  CreatePerformanceGoalDto,
  CreatePerformanceReviewDto,
  SubmitReviewDto,
  UpdateGoalStatusDto,
} from './dto/performance.dto';

const GOAL_STATUSES = Object.values(GoalStatus);

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  createCycle(tenantId: string, dto: CreatePerformanceCycleDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new AppError(422, 'INVALID_PERIOD', 'Cycle period is invalid');
    }
    return this.prisma.performanceCycle.create({
      data: { tenantId, name: dto.name, startDate: start, endDate: end, status: 'active' },
    });
  }

  listCycles(tenantId: string) {
    return this.prisma.performanceCycle.findMany({
      where: { tenantId },
      include: { _count: { select: { goals: true, reviews: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async createGoal(tenantId: string, userId: string, dto: CreatePerformanceGoalDto) {
    await this.activeCycle(tenantId, dto.cycleId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
    const goal = await this.prisma.performanceGoal.create({
      data: {
        tenantId,
        cycleId: dto.cycleId,
        employeeId: dto.employeeId,
        title: dto.title,
        description: dto.description,
        targetValue: dto.targetValue,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: GoalStatus.in_progress,
      },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'performance.goal_created',
      resourceType: 'performance_goal',
      resourceId: goal.id,
      after: { cycleId: dto.cycleId, employeeId: dto.employeeId },
    });
    return goal;
  }

  listGoals(tenantId: string, cycleId?: string, employeeId?: string) {
    const where: Prisma.PerformanceGoalWhereInput = {
      tenantId,
      ...(cycleId ? { cycleId } : {}),
      ...(employeeId ? { employeeId } : {}),
    };
    return this.prisma.performanceGoal.findMany({
      where,
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateGoalStatus(tenantId: string, id: string, dto: UpdateGoalStatusDto) {
    const status = dto.status as GoalStatus;
    if (!GOAL_STATUSES.includes(status))
      throw new AppError(422, 'INVALID_STATUS', 'Invalid goal status');
    const goal = await this.prisma.performanceGoal.findFirst({ where: { id, tenantId } });
    if (!goal) throw new AppError(404, 'GOAL_NOT_FOUND', 'Goal was not found');
    return this.prisma.performanceGoal.update({ where: { id }, data: { status } });
  }

  async createReview(tenantId: string, userId: string, dto: CreatePerformanceReviewDto) {
    await this.activeCycle(tenantId, dto.cycleId);
    const reviewerEmployeeId = await this.reviewerEmployeeId(tenantId, userId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
    const review = await this.prisma.performanceReview.upsert({
      where: {
        tenantId_cycleId_employeeId_reviewerUserId: {
          tenantId,
          cycleId: dto.cycleId,
          employeeId: dto.employeeId,
          reviewerUserId: reviewerEmployeeId,
        },
      },
      update: {
        rating: dto.rating,
        strengths: dto.strengths,
        improvements: dto.improvements,
      },
      create: {
        tenantId,
        cycleId: dto.cycleId,
        employeeId: dto.employeeId,
        reviewerUserId: reviewerEmployeeId,
        rating: dto.rating,
        strengths: dto.strengths,
        improvements: dto.improvements,
      },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'performance.review_upserted',
      resourceType: 'performance_review',
      resourceId: review.id,
      after: { cycleId: dto.cycleId, employeeId: dto.employeeId },
    });
    return review;
  }

  listReviews(tenantId: string, cycleId?: string, employeeId?: string) {
    const where: Prisma.PerformanceReviewWhereInput = {
      tenantId,
      ...(cycleId ? { cycleId } : {}),
      ...(employeeId ? { employeeId } : {}),
    };
    return this.prisma.performanceReview.findMany({
      where,
      include: {
        employee: {
          select: { employeeNumber: true, firstName: true, lastName: true, departmentId: true },
        },
        feedback: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submitReview(tenantId: string, userId: string, id: string, dto: SubmitReviewDto) {
    const review = await this.prisma.performanceReview.findFirst({ where: { id, tenantId } });
    if (!review) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review was not found');
    if (review.status !== ReviewStatus.draft) {
      throw new AppError(409, 'REVIEW_SUBMITTED', 'Review was already submitted');
    }
    const reviewerEmployeeId = await this.reviewerEmployeeId(tenantId, userId);
    if (review.reviewerUserId !== reviewerEmployeeId) {
      throw new AppError(403, 'NOT_REVIEWER', 'Only the assigned reviewer can submit this review');
    }
    const updated = await this.prisma.performanceReview.update({
      where: { id },
      data: {
        status: ReviewStatus.submitted,
        submittedAt: new Date(),
        rating: dto.rating ?? review.rating,
        strengths: dto.strengths ?? review.strengths,
        improvements: dto.improvements ?? review.improvements,
      },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'performance.review_submitted',
      resourceType: 'performance_review',
      resourceId: id,
    });
    return updated;
  }

  async addFeedback(tenantId: string, userId: string, id: string, dto: CreateFeedbackDto) {
    const review = await this.prisma.performanceReview.findFirst({ where: { id, tenantId } });
    if (!review) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review was not found');
    if (review.status === ReviewStatus.draft) {
      throw new AppError(409, 'REVIEW_NOT_SUBMITTED', 'Feedback requires a submitted review');
    }
    return this.prisma.performanceFeedback.create({
      data: { tenantId, reviewId: id, authorUserId: userId, comment: dto.comment },
    });
  }

  async calibration(tenantId: string, cycleId: string) {
    await this.activeCycle(tenantId, cycleId);
    const reviews = await this.prisma.performanceReview.findMany({
      where: { tenantId, cycleId, status: { not: ReviewStatus.draft } },
      include: { employee: { select: { departmentId: true } } },
    });
    const grouped = new Map<
      string,
      { departmentId: string | null; count: number; total: number; rated: number }
    >();
    for (const review of reviews) {
      const key = review.employee.departmentId ?? 'unassigned';
      const entry = grouped.get(key) ?? {
        departmentId: review.employee.departmentId,
        count: 0,
        total: 0,
        rated: 0,
      };
      entry.count += 1;
      if (review.rating !== null) {
        entry.total += review.rating;
        entry.rated += 1;
      }
      grouped.set(key, entry);
    }
    return [...grouped.entries()].map(([key, entry]) => ({
      departmentId: entry.departmentId,
      key,
      submittedReviews: entry.count,
      averageRating: entry.rated ? Math.round((entry.total / entry.rated) * 100) / 100 : null,
    }));
  }

  private async activeCycle(tenantId: string, cycleId: string) {
    const cycle = await this.prisma.performanceCycle.findFirst({
      where: { id: cycleId, tenantId },
    });
    if (!cycle) throw new AppError(404, 'CYCLE_NOT_FOUND', 'Performance cycle was not found');
    if (cycle.status !== PerformanceCycleStatus.active) {
      throw new AppError(409, 'CYCLE_CLOSED', 'Performance cycle is not active');
    }
    return cycle;
  }

  private async reviewerEmployeeId(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      throw new AppError(422, 'EMPLOYEE_REQUIRED', 'Current user has no linked employee');
    }
    return user.employeeId;
  }
}
