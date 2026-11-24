import type { ScopeType } from '@peoplecore/shared';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  tenantSlug?: string;
  userId?: string;
  userEmail?: string;
  userFirstName?: string | null;
  userLastName?: string | null;
  employeeId?: string;
  permissions: string[];
  roles: string[];
  scopes: Array<{ type: ScopeType; refId: string | null }>;
  ip?: string;
  userAgent?: string;
}

export const EMPTY_REQUEST_CONTEXT: RequestContext = {
  requestId: '',
  correlationId: '',
  permissions: [],
  roles: [],
  scopes: [],
};
