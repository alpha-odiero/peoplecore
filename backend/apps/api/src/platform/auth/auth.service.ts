import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  PERMISSIONS,
  PERMISSION_CATEGORY_BY_PREFIX,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  type AuthResult,
  type AuthenticatedUser,
  type RoleKey,
} from '@peoplecore/shared';
import { hash, verify } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '../../common/app-error';
import { PinoLogger } from '../../common/pino-logger.service';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { CacheService } from '../cache/cache.service';
import { PrincipalService } from './principal.service';
import type { AccessTokenPayload } from './auth.types';
import type { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

const PASSWORD_OPTIONS = {
  type: 2,
  memoryCost: 19_456,
  timeCost: 3,
  parallelism: 1,
} as const;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_MINUTES = 30;

export interface IssuedSession {
  result: AuthResult;
  refreshToken: string;
  csrfToken: string;
}

interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
    private readonly principalService: PrincipalService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly logger: PinoLogger,
  ) {}

  async login(dto: LoginDto, request: Request): Promise<IssuedSession> {
    const tenantId = getRequestContext().tenantId;
    if (!tenantId) throw new AppError(400, 'TENANT_REQUIRED', 'A tenant slug is required');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.status !== 'active') {
      throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant was not found');
    }

    const user = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });
    if (!user || user.status !== 'active') {
      await verify(await dummyPasswordHash(), dto.password).catch(() => false);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Account is temporarily locked');
    }

    const validPassword = await verify(user.passwordHash, dto.password);
    if (!validPassword) {
      await this.registerFailedLogin(tenantId, user.id, dto.email, request);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    await this.cache.del(`login-fail:${tenantId}:${dto.email}`);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    return this.createSession(user, tenant.slug, request);
  }

  async register(dto: RegisterDto, request: Request): Promise<IssuedSession> {
    const slug = await this.availableTenantSlug(dto.tenantName);
    const passwordHash = await hash(dto.password, PASSWORD_OPTIONS);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug,
          status: 'active',
          settings: { createdBy: 'self_service_registration' },
        },
      });
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      for (const permission of PERMISSIONS) {
        await tx.permission.upsert({
          where: { key: permission },
          update: {},
          create: {
            key: permission,
            category: PERMISSION_CATEGORY_BY_PREFIX[permission.split('.')[0] ?? ''] ?? 'Other',
            description: `${permission} access`,
          },
        });
      }
      const permissions = await tx.permission.findMany({
        where: { key: { in: [...PERMISSIONS] } },
        select: { id: true, key: true },
      });
      const permissionIdByKey = new Map(
        permissions.map((permission) => [permission.key, permission.id]),
      );
      const roles = new Map<RoleKey, string>();

      for (const roleKey of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            key: roleKey,
            name: ROLE_NAMES[roleKey],
            isSystem: true,
          },
        });
        roles.set(roleKey, role.id);
        const grants = ROLE_PERMISSIONS[roleKey]
          .map((permission) => permissionIdByKey.get(permission))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({
            tenantId: tenant.id,
            roleId: role.id,
            permissionId,
          }));
        if (grants.length > 0) {
          await tx.rolePermission.createMany({ data: grants, skipDuplicates: true });
        }
      }

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          firstName: dto.name.split(' ')[0] ?? dto.name,
          lastName: dto.name.split(' ').slice(1).join(' ') || null,
          status: 'active',
          permissionVersion: 1,
        },
      });

      const adminRoleId = roles.get('tenant_admin');
      if (!adminRoleId) throw new AppError(500, 'ROLE_SETUP_FAILED', 'Admin role setup failed');
      await tx.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: adminRoleId,
          scopeType: 'tenant',
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          actorUserId: user.id,
          actorType: 'user',
          action: 'auth.register',
          resourceType: 'tenant',
          resourceId: tenant.id,
          after: { slug, adminEmail: dto.email } as Prisma.InputJsonValue,
          metadata: { ip: request.ip ?? null } as Prisma.InputJsonValue,
        },
      });
      await this.outbox.publish(
        {
          tenantId: tenant.id,
          eventType: 'auth.tenant_registered',
          aggregateType: 'tenant',
          aggregateId: tenant.id,
          payload: { slug, adminEmail: dto.email },
        },
        tx,
      );

      return { tenant, user };
    });

    return this.createSession(created.user, created.tenant.slug, request);
  }

  async refresh(refreshToken: string, request: Request, csrfToken: string): Promise<IssuedSession> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { tenant: true } } },
    });

    if (!stored || stored.status !== 'active') {
      if (stored) await this.revokeFamily(stored.familyId, 'refresh_reuse_detected');
      await this.auditSafety(stored?.tenantId, 'auth.refresh.rejected', stored?.id, {
        reason: 'invalid_or_reused_refresh_token',
      });
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid');
    }
    if (stored.expiresAt <= new Date()) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { status: 'expired' },
      });
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has expired');
    }
    if (stored.user.status !== 'active' || stored.user.tenant.status !== 'active') {
      throw new AppError(401, 'UNAUTHENTICATED', 'Account is not active');
    }

    const now = new Date();
    const newToken = randomBytes(48).toString('base64url');
    const newTokenId = randomUUID();
    const refreshTtl = this.numberConfig('PC_JWT_REFRESH_TTL', 1_209_600);
    let concurrentReuse = false;

    await this.prisma.$transaction(async (tx) => {
      const rotated = await tx.refreshToken.updateMany({
        where: { id: stored.id, status: 'active' },
        data: { status: 'rotated', usedAt: now },
      });
      if (rotated.count !== 1) {
        concurrentReuse = true;
        return;
      }
      await tx.refreshToken.create({
        data: {
          id: newTokenId,
          tenantId: stored.tenantId,
          userId: stored.userId,
          familyId: stored.familyId,
          tokenHash: hashToken(newToken),
          expiresAt: new Date(now.getTime() + refreshTtl * 1000),
          replacedById: stored.id,
          ip: request.ip ?? null,
          userAgent: request.header('user-agent') ?? null,
        },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { replacedById: newTokenId },
      });
    });
    if (concurrentReuse) {
      await this.revokeFamily(stored.familyId, 'refresh_concurrent_reuse');
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token was already used');
    }

    const principal = await this.principalService.load(stored.tenantId, stored.userId);
    const accessToken = await this.signAccessToken(principal);
    await this.audit.write({
      tenantId: stored.tenantId,
      actorUserId: stored.userId,
      action: 'auth.refresh',
      resourceType: 'user',
      resourceId: stored.userId,
      metadata: { familyId: stored.familyId },
    });

    return {
      result: {
        accessToken,
        expiresIn: this.numberConfig('PC_JWT_ACCESS_TTL', 900),
        tenantSlug: stored.user.tenant.slug,
        user: principal,
      },
      refreshToken: newToken,
      csrfToken,
    };
  }

  async logout(refreshToken: string | undefined, request: Request): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored || stored.status !== 'active') return;
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await this.audit.write({
      tenantId: stored.tenantId,
      actorUserId: stored.userId,
      action: 'auth.logout',
      resourceType: 'user',
      resourceId: stored.userId,
      metadata: { ip: request.ip ?? null },
    });
  }

  async forgotPassword(dto: ForgotPasswordDto, request: Request): Promise<void> {
    const tenantId = getRequestContext().tenantId;
    if (!tenantId) return;
    const user = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email, status: 'active' },
    });
    if (!user) return;

    const token = randomBytes(48).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        tenantId,
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
        ip: request.ip ?? null,
        userAgent: request.header('user-agent') ?? null,
      },
    });
    await this.audit.write({
      tenantId,
      actorUserId: user.id,
      actorType: 'system',
      action: 'auth.password_reset.requested',
      resourceType: 'user',
      resourceId: user.id,
    });
    await this.outbox.publish({
      tenantId,
      eventType: 'auth.password_reset.requested',
      aggregateType: 'user',
      aggregateId: user.id,
      payload: { email: user.email, expiresInMinutes: RESET_MINUTES },
    });
  }

  async resetPassword(dto: ResetPasswordDto, request: Request): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!token || token.usedAt || token.expiresAt <= new Date()) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'Reset token is invalid or expired');
    }

    const passwordHash = await hash(dto.newPassword, PASSWORD_OPTIONS);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { tenantId: token.tenantId, userId: token.userId, status: 'active' },
        data: { status: 'revoked', revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: token.tenantId,
          actorUserId: token.userId,
          actorType: 'system',
          action: 'auth.password_reset.completed',
          resourceType: 'user',
          resourceId: token.userId,
          metadata: { ip: request.ip ?? null } as Prisma.InputJsonValue,
        },
      });
      await this.outbox.publish(
        {
          tenantId: token.tenantId,
          eventType: 'auth.password_reset.completed',
          aggregateType: 'user',
          aggregateId: token.userId,
          payload: {},
        },
        tx,
      );
    });
    await this.principalService.invalidate(token.tenantId, token.userId);
  }

  private async createSession(
    user: SessionUser,
    tenantSlug: string,
    request: Request,
  ): Promise<IssuedSession> {
    const principal = await this.principalService.load(user.tenantId, user.id);
    const accessToken = await this.signAccessToken(principal);
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtl = this.numberConfig('PC_JWT_REFRESH_TTL', 1_209_600);

    await this.prisma.refreshToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        ip: request.ip ?? null,
        userAgent: request.header('user-agent') ?? null,
      },
    });
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'auth.session.created',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { ip: request.ip ?? null },
    });

    return {
      result: {
        accessToken,
        expiresIn: this.numberConfig('PC_JWT_ACCESS_TTL', 900),
        tenantSlug,
        user: principal,
      },
      refreshToken,
      csrfToken: randomBytes(24).toString('base64url'),
    };
  }

  private async signAccessToken(principal: AuthenticatedUser): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: principal.id,
      tid: principal.tenantId,
      email: principal.email,
      eid: principal.employeeId,
      roles: principal.roles,
      permissions: principal.permissions,
      scopes: principal.scopes as AccessTokenPayload['scopes'],
      pv: principal.permissionVersion ?? 1,
      typ: 'access',
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('PC_JWT_ACCESS_SECRET'),
      expiresIn: this.numberConfig('PC_JWT_ACCESS_TTL', 900),
    });
  }

  private async registerFailedLogin(
    tenantId: string,
    userId: string,
    email: string,
    request: Request,
  ): Promise<void> {
    const attempts = await this.cache.incr(`login-fail:${tenantId}:${email}`, LOCK_MINUTES * 60);
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: attempts },
    });
    if (attempts >= MAX_FAILED_LOGINS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
      });
      await this.audit.write({
        tenantId,
        actorUserId: userId,
        action: 'auth.login.locked',
        resourceType: 'user',
        resourceId: userId,
        metadata: { attempts, ip: request.ip ?? null },
      });
    }
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, status: { in: ['active', 'rotated'] } },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    this.logger.warn({ familyId, reason }, 'Refresh token family revoked');
  }

  private async auditSafety(
    tenantId: string | undefined,
    action: string,
    resourceId: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!tenantId) return;
    await this.audit.write({
      tenantId,
      actorType: 'system',
      action,
      resourceType: 'refresh_token',
      resourceId,
      metadata,
    });
  }

  private async availableTenantSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'workspace';
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const existing = await this.prisma.tenant.findUnique({ where: { slug: candidate } });
      if (!existing) return candidate;
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

let dummyHashPromise: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hash('peoplecore-unusable-dummy-password', PASSWORD_OPTIONS);
  return dummyHashPromise;
}
