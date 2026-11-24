import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PublishEventInput {
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  headers?: Record<string, unknown>;
  eventId?: string;
  availableAt?: Date;
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(input: PublishEventInput, client?: Prisma.TransactionClient): Promise<void> {
    const db = client ?? this.prisma;
    await db.domainEventOutbox.create({
      data: {
        tenantId: input.tenantId,
        eventId: input.eventId ?? randomUUID(),
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: toJson(input.payload),
        headers: toJson(input.headers ?? {}),
        availableAt: input.availableAt ?? new Date(),
      },
    });
  }
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
