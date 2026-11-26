import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../common/app-error';

const MAX_CONNECT_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 250;
const RETRYABLE_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    let lastErrorCode = 'UNKNOWN';

    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error: unknown) {
        lastErrorCode = errorCodeOf(error);
        if (!RETRYABLE_ERROR_CODES.has(lastErrorCode) || attempt === MAX_CONNECT_ATTEMPTS) {
          break;
        }
        const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `Database connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed (${lastErrorCode}); retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }

    this.logger.error(
      `Database connection unavailable after ${MAX_CONNECT_ATTEMPTS} attempt(s) (${lastErrorCode})`,
    );
    throw new Error(`Database connection unavailable (${lastErrorCode})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async setTenantContext(tenantId: string): Promise<void> {
    await this.$executeRaw`SELECT set_config('app.tenant_id', ${escapeUuid(tenantId)}, false)`;
  }

  async withTenant<T>(tenantId: string, operation: (tx: PrismaService) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${escapeUuid(tenantId)}, true)`;
      return operation(tx as PrismaService);
    });
  }

  async tenantOrFail(slug: string) {
    const tenant = await this.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status !== 'active') {
      throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant was not found');
    }
    return tenant;
  }
}

function escapeUuid(value: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) {
    throw new AppError(400, 'INVALID_TENANT', 'Invalid tenant identifier');
  }
  return value;
}

function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'errorCode' in error) {
    const code = (error as { errorCode?: unknown }).errorCode;
    if (typeof code === 'string') return code;
  }
  return 'UNKNOWN';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
