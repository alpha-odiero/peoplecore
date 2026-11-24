import type { AuthenticatedUser } from '@peoplecore/shared';
import { PolicyService } from './policy.service';

describe('PolicyService', () => {
  const service = new PolicyService();

  const principal = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.com',
    firstName: null,
    lastName: null,
    roles: [],
    permissions: [],
    scopes: [],
    employeeId: null,
    ...overrides,
  });

  it('scopes tenant-wide principals to their tenant', () => {
    expect(service.employeeWhere(principal({ scopes: [{ type: 'tenant', refId: null }] }))).toEqual(
      {
        tenantId: 'tenant-1',
      },
    );
  });

  it('denies access when no usable scope exists', () => {
    expect(service.employeeWhere(principal())).toEqual({ id: '__none__' });
    expect(service.employeeWhere(principal({ scopes: [{ type: 'self', refId: null }] }))).toEqual({
      id: '__none__',
    });
  });

  it('builds self, direct-report, department, and location filters', () => {
    expect(
      service.employeeWhere(
        principal({ scopes: [{ type: 'self', refId: null }], employeeId: 'employee-1' }),
      ),
    ).toEqual({ tenantId: 'tenant-1', OR: [{ id: 'employee-1' }] });
    expect(
      service.employeeWhere(
        principal({
          scopes: [{ type: 'direct_reports', refId: null }],
          employeeId: 'manager-1',
        }),
      ),
    ).toEqual({ tenantId: 'tenant-1', OR: [{ managerEmployeeId: 'manager-1' }] });
    expect(
      service.employeeWhere(principal({ scopes: [{ type: 'department', refId: 'department-1' }] })),
    ).toEqual({ tenantId: 'tenant-1', OR: [{ departmentId: 'department-1' }] });
    expect(
      service.employeeWhere(principal({ scopes: [{ type: 'location', refId: 'location-1' }] })),
    ).toEqual({ tenantId: 'tenant-1', OR: [{ locationId: 'location-1' }] });
  });

  it('unions multiple limited scopes but keeps a tenant scope authoritative', () => {
    expect(
      service.employeeWhere(
        principal({
          scopes: [
            { type: 'department', refId: 'department-1' },
            { type: 'location', refId: 'location-1' },
          ],
        }),
      ),
    ).toEqual({
      tenantId: 'tenant-1',
      OR: [{ departmentId: 'department-1' }, { locationId: 'location-1' }],
    });
    expect(
      service.employeeWhere(
        principal({
          scopes: [
            { type: 'department', refId: 'department-1' },
            { type: 'tenant', refId: null },
          ],
        }),
      ),
    ).toEqual({ tenantId: 'tenant-1' });
  });

  it('applies management checks by scope and self identity', () => {
    expect(
      service.canManageEmployee(
        principal({ scopes: [{ type: 'tenant', refId: null }] }),
        'employee-2',
      ),
    ).toBe(true);
    expect(
      service.canManageEmployee(
        principal({ scopes: [{ type: 'self', refId: null }], employeeId: 'employee-1' }),
        'employee-1',
      ),
    ).toBe(true);
    expect(
      service.canManageEmployee(
        principal({ scopes: [{ type: 'self', refId: null }], employeeId: 'employee-1' }),
        'employee-2',
      ),
    ).toBe(false);
  });
});
