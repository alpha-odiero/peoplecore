import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppError } from '../common/app-error';
import { Public } from '../common/decorators/public.decorator';
import { RawResponse } from '../common/decorators/raw-response.decorator';
import { CacheService } from '../platform/cache/cache.service';
import { StorageService } from '../platform/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  @Get('health/live')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  @ApiOperation({ summary: 'Process liveness probe' })
  async live(): Promise<{ status: string; uptime: number }> {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Get('health/ready')
  @RawResponse()
  @ApiOperation({ summary: 'Dependency readiness probe' })
  async ready(): Promise<{
    status: string;
    checks: Record<string, { ok: boolean; mode?: string }>;
  }> {
    const [database, cache, storage] = await Promise.all([
      this.prisma.healthCheck().then((ok) => ({ ok })),
      this.cache.healthCheck(),
      this.storage.healthCheck().then((ok) => ({ ok })),
    ]);
    const checks = { database, cache, storage };
    const ok = Object.values(checks).every((check) => check.ok);
    if (!ok)
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'One or more dependencies are unavailable');
    return { status: 'ok', checks };
  }
}
