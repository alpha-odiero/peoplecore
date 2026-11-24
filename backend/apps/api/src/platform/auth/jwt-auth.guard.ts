import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppError } from '../../common/app-error';
import { IS_PUBLIC_KEY } from '../../common/decorators/metadata-keys';
import { getRequestContext } from '../../common/request-context.storage';
import { PrincipalService } from './principal.service';
import type { AccessTokenPayload } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly principalService: PrincipalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHENTICATED', 'A bearer access token is required');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7), {
        secret: process.env.PC_JWT_ACCESS_SECRET,
      });
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'Access token is invalid or expired');
    }

    if (payload.typ !== 'access') throw new AppError(401, 'UNAUTHENTICATED', 'Invalid token type');

    const requestContext = getRequestContext();
    if (requestContext.tenantId && requestContext.tenantId !== payload.tid) {
      throw new AppError(403, 'FORBIDDEN', 'Token does not match the resolved tenant');
    }

    const principal = await this.principalService.load(payload.tid, payload.sub);
    requestContext.tenantId = principal.tenantId;
    requestContext.userId = principal.id;
    requestContext.userEmail = principal.email;
    requestContext.userFirstName = principal.firstName;
    requestContext.userLastName = principal.lastName;
    requestContext.employeeId = principal.employeeId ?? undefined;
    requestContext.permissions = principal.permissions;
    requestContext.roles = principal.roles;
    requestContext.scopes = principal.scopes;
    return true;
  }
}
