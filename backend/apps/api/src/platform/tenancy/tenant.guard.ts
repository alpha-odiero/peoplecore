import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/app-error';
import { IS_PUBLIC_KEY } from '../../common/decorators/metadata-keys';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.startsWith('/health') || request.path.startsWith('/metrics')) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requestContext = getRequestContext();
    const bodySlug = (request.body as { tenantSlug?: string } | undefined)?.tenantSlug;
    const headerSlug = request.header('x-tenant-slug')?.toLowerCase();
    let slug = requestContext.tenantSlug || headerSlug || bodySlug?.toLowerCase();

    if (!slug && process.env.NODE_ENV !== 'production') {
      slug = process.env.PC_DEFAULT_TENANT_SLUG ?? 'demo';
    }
    if (!slug) {
      if (isPublic) return true;
      throw new AppError(400, 'TENANT_REQUIRED', 'A tenant slug is required');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status !== 'active') {
      if (isPublic) return true;
      throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant was not found');
    }

    requestContext.tenantId = tenant.id;
    requestContext.tenantSlug = tenant.slug;
    await this.prisma.setTenantContext(tenant.id);
    return true;
  }
}
