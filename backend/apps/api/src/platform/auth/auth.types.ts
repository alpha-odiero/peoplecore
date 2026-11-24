import type { ScopeType } from '@peoplecore/shared';

export interface AccessTokenPayload {
  sub: string;
  tid: string;
  email: string;
  eid?: string | null;
  roles: string[];
  permissions: string[];
  scopes: Array<{ type: ScopeType; refId: string | null }>;
  pv: number;
  typ: 'access';
}
