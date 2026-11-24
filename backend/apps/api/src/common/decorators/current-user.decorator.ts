import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@peoplecore/shared';
import { getRequestContext } from '../request-context.storage';

export const CurrentUser = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): AuthenticatedUser | null => {
    const context = getRequestContext();
    if (!context.userId) return null;
    return {
      id: context.userId,
      tenantId: context.tenantId ?? '',
      email: context.userEmail ?? '',
      firstName: context.userFirstName ?? null,
      lastName: context.userLastName ?? null,
      roles: context.roles,
      permissions: context.permissions,
      scopes: context.scopes,
      employeeId: context.employeeId ?? null,
    };
  },
);
