import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'accessToken',
  'refreshToken',
  'mfaSecretEnc',
  'authorization',
  'cookie',
  'csrfToken',
]);

export interface AuditWriteInput {
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  actorUserId?: string | null;
  actorType?: 'user' | 'system' | 'worker' | 'integration';
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput): Promise<void> {
    const context = getRequestContext();
    await this.prisma.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? context.userId ?? null,
        actorType: input.actorType ?? (context.userId ? 'user' : 'system'),
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: (input.before ? redact(input.before) : null) as Prisma.InputJsonValue,
        after: (input.after ? redact(input.after) : null) as Prisma.InputJsonValue,
        metadata: {
          ...redact(input.metadata ?? {}),
          service: 'peoplecore-api',
        } as Prisma.InputJsonValue,
        correlationId: input.correlationId ?? (context.correlationId || undefined),
        requestId: input.requestId ?? (context.requestId || undefined),
      },
    });
  }
}

function redact(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { value };
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? '[REDACTED]'
      : item && typeof item === 'object' && !Array.isArray(item)
        ? redact(item)
        : item;
  }
  return output;
}
