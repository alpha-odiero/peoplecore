import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { PERMISSIONS_KEY } from '../../common/decorators/metadata-keys';
import { getRequestContext } from '../../common/request-context.storage';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const granted = new Set(getRequestContext().permissions);
    const missing = required.filter((permission) => !granted.has(permission));
    if (missing.length > 0) {
      throw new AppError(403, 'FORBIDDEN', `Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
