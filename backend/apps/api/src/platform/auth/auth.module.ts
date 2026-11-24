import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { CacheModule } from '../cache/cache.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { PrincipalService } from './principal.service';
import { TenantGuard } from '../tenancy/tenant.guard';

@Module({
  imports: [JwtModule.register({}), CacheModule, AuditModule, OutboxModule, TenancyModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PrincipalService,
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, PrincipalService],
})
export class AuthModule {}
