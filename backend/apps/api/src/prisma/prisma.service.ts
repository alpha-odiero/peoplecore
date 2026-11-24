import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../common/app-error';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
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
