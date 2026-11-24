import { Injectable } from '@nestjs/common';
import { Counter, register } from 'prom-client';
import { PinoLogger } from '../../common/pino-logger.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DomainEvent {
  id: string;
  tenantId: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  headers: unknown;
}

export type DomainEventHandler = (event: DomainEvent) => Promise<void>;

const MAX_ATTEMPTS = 5;

function counter(name: string, help: string): Counter<string> {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as Counter<string>;
  return new Counter({ name, help, registers: [register] });
}

const publishedCounter = counter(
  'peoplecore_outbox_events_published_total',
  'Number of outbox events published successfully',
);

const failedCounter = counter(
  'peoplecore_outbox_events_failed_total',
  'Number of outbox event dispatch attempts that failed',
);

@Injectable()
export class OutboxDispatcherService {
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  register(eventType: string, handler: DomainEventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  async dispatchPending(
    batchSize = 50,
  ): Promise<{ processed: number; published: number; failed: number }> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    let processed = 0;
    let published = 0;
    let failed = 0;

    for (const tenant of tenants) {
      await this.prisma.setTenantContext(tenant.id);
      try {
        const pending = await this.prisma.domainEventOutbox.findMany({
          where: { status: { in: ['pending', 'failed'] }, availableAt: { lte: new Date() } },
          orderBy: { availableAt: 'asc' },
          take: batchSize,
        });

        for (const row of pending) {
          const claimed = await this.prisma.domainEventOutbox.updateMany({
            where: { id: row.id, status: { in: ['pending', 'failed'] } },
            data: { attempts: { increment: 1 } },
          });
          if (claimed.count === 0) continue;
          processed += 1;

          const event: DomainEvent = {
            id: row.id,
            tenantId: row.tenantId,
            eventId: row.eventId,
            eventType: row.eventType,
            aggregateType: row.aggregateType,
            aggregateId: row.aggregateId,
            payload: row.payload,
            headers: row.headers,
          };

          try {
            const handlers = [
              ...(this.handlers.get(event.eventType) ?? []),
              ...(this.handlers.get('*') ?? []),
            ];
            for (const handler of handlers) await handler(event);
            await this.prisma.domainEventOutbox.update({
              where: { id: row.id },
              data: { status: 'published', publishedAt: new Date(), lastError: null },
            });
            published += 1;
            publishedCounter.inc();
          } catch (error) {
            const attempts = row.attempts + 1;
            const dead = attempts >= MAX_ATTEMPTS;
            await this.prisma.domainEventOutbox.update({
              where: { id: row.id },
              data: {
                status: dead ? 'dead' : 'failed',
                availableAt: new Date(Date.now() + Math.min(300_000, 1000 * 2 ** attempts)),
                lastError: error instanceof Error ? error.message.slice(0, 2000) : String(error),
              },
            });
            failed += 1;
            failedCounter.inc();
            this.logger.error(
              { eventId: row.eventId, eventType: row.eventType, attempts },
              'outbox dispatch failed',
            );
          }
        }
      } finally {
        await this.prisma.$executeRaw`SELECT set_config('app.tenant_id', '', false)`;
      }
    }

    return { processed, published, failed };
  }
}
