import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CollectionResponse,
  NotificationListItem,
  NotificationPreferenceItem,
} from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OutboxDispatcherService,
  type DomainEvent,
} from '../../platform/outbox/outbox-dispatcher.service';
import type { NotificationQueryDto, UpdateNotificationPreferenceDto } from './dto/notification.dto';

export interface NotifyInput {
  tenantId: string;
  userId: string;
  templateKey: string;
  subject?: string;
  body?: string;
  payload?: Record<string, unknown>;
  channel?: 'in_app' | 'email' | 'sms' | 'push';
  dedupeKey?: string;
}

const HANDLED_EVENTS = [
  'approval.requested',
  'approval.decided',
  'leave.requested',
  'leave.decided',
  'payroll.run_created',
  'payroll.run_approved',
];

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  onModuleInit(): void {
    for (const eventType of HANDLED_EVENTS) {
      this.dispatcher.register(eventType, (event) => this.handleDomainEvent(event));
    }
  }

  async list(
    tenantId: string,
    userId: string,
    query: NotificationQueryDto,
  ): Promise<CollectionResponse<NotificationListItem>> {
    const where = {
      tenantId,
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { scheduledAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        templateKey: row.templateKey,
        subject: row.subject,
        body: row.bodyRendered,
        channel: row.channel,
        payload: toRecord(row.payload),
        readAt: row.readAt ? row.readAt.toISOString() : null,
        sentAt: row.sentAt ? row.sentAt.toISOString() : null,
        createdAt: row.scheduledAt.toISOString(),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async unreadCount(tenantId: string, userId: string): Promise<{ count: number }> {
    return {
      count: await this.prisma.notification.count({ where: { tenantId, userId, readAt: null } }),
    };
  }

  async markRead(tenantId: string, userId: string, id: string): Promise<NotificationListItem> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId, userId },
    });
    if (!notification)
      throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    return {
      id: updated.id,
      templateKey: updated.templateKey,
      subject: updated.subject,
      body: updated.bodyRendered,
      channel: updated.channel,
      payload: toRecord(updated.payload),
      readAt: updated.readAt ? updated.readAt.toISOString() : null,
      sentAt: updated.sentAt ? updated.sentAt.toISOString() : null,
      createdAt: updated.scheduledAt.toISOString(),
    };
  }

  async markAllRead(tenantId: string, userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async preferences(tenantId: string, userId: string): Promise<NotificationPreferenceItem[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { tenantId, userId },
      orderBy: [{ category: 'asc' }, { channel: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      category: row.category,
      enabled: row.enabled,
    }));
  }

  async updatePreference(
    tenantId: string,
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceItem> {
    const row = await this.prisma.notificationPreference.upsert({
      where: {
        tenantId_userId_channel_category: {
          tenantId,
          userId,
          channel: dto.channel,
          category: dto.category,
        },
      },
      update: { enabled: dto.enabled },
      create: {
        tenantId,
        userId,
        channel: dto.channel,
        category: dto.category,
        enabled: dto.enabled,
      },
    });
    return { id: row.id, channel: row.channel, category: row.category, enabled: row.enabled };
  }

  async notify(input: NotifyInput): Promise<void> {
    const disabled = await this.prisma.notificationPreference.findFirst({
      where: {
        tenantId: input.tenantId,
        userId: input.userId,
        channel: input.channel ?? 'in_app',
        category: input.templateKey.split('.')[0] ?? 'general',
        enabled: false,
      },
    });
    if (disabled) return;

    const now = new Date();
    try {
      await this.prisma.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          channel: input.channel ?? 'in_app',
          templateKey: input.templateKey,
          subject: input.subject,
          bodyRendered: input.body,
          payload: toJson(input.payload ?? {}),
          status: 'sent',
          dedupeKey: input.dedupeKey,
          sentAt: now,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  private async handleDomainEvent(event: DomainEvent): Promise<void> {
    const payload = toRecord(event.payload);
    const recipients = Array.isArray(payload.recipientUserIds)
      ? payload.recipientUserIds.filter((id): id is string => typeof id === 'string')
      : typeof payload.recipientUserId === 'string'
        ? [payload.recipientUserId]
        : [];
    for (const userId of recipients) {
      await this.notify({
        tenantId: event.tenantId,
        userId,
        templateKey: event.eventType,
        subject: typeof payload.subject === 'string' ? payload.subject : event.eventType,
        body: typeof payload.message === 'string' ? payload.message : undefined,
        payload: { eventId: event.eventId, aggregateId: event.aggregateId, ...payload },
        dedupeKey:
          typeof payload.dedupeKey === 'string' ? payload.dedupeKey : event.eventId + ':' + userId,
      });
    }
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

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
