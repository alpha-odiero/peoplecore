import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@peoplecore/shared';
import { PERMISSIONS_KEY } from './metadata-keys';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
