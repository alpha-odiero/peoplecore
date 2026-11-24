import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PrincipalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async load(tenantId: string, userId: string): Promise<AuthenticatedUser> {
    const placeholder = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { permissionVersion: true },
    });
    if (!placeholder) throw new AppError(401, 'UNAUTHENTICATED', 'Account is no longer available');

    const cacheKey = `principal:${tenantId}:${userId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as AuthenticatedUser;
      if (parsed.permissionVersion === placeholder.permissionVersion) return parsed;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, status: 'active' },
      include: {
        userRoles: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not active');

    const permissions = new Set<string>();
    const roles: string[] = [];
    const scopes: AuthenticatedUser['scopes'] = [];
    for (const userRole of user.userRoles) {
      roles.push(userRole.role.key);
      scopes.push({ type: userRole.scopeType, refId: userRole.scopeRefId });
      for (const grant of userRole.role.rolePermissions) {
        permissions.add(grant.permission.key);
      }
    }

    const principal: AuthenticatedUser = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      permissionVersion: user.permissionVersion,
      roles,
      permissions: [...permissions],
      scopes,
    };

    await this.cache.set(cacheKey, JSON.stringify(principal), 300);
    return principal;
  }

  async invalidate(tenantId: string, userId: string): Promise<void> {
    await this.cache.del(`principal:${tenantId}:${userId}`);
  }
}
