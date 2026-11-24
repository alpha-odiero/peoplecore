import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@peoplecore/shared';
import type { Prisma } from '@prisma/client';

@Injectable()
export class PolicyService {
  employeeWhere(principal: AuthenticatedUser): Prisma.EmployeeWhereInput {
    const tenantClause: Prisma.EmployeeWhereInput = { tenantId: principal.tenantId };
    if (this.hasTenantScope(principal)) return tenantClause;

    const clauses: Prisma.EmployeeWhereInput[] = [];
    for (const scope of principal.scopes) {
      if (scope.type === 'self' && principal.employeeId) {
        clauses.push({ id: principal.employeeId });
      }
      if (scope.type === 'direct_reports' && principal.employeeId) {
        clauses.push({ managerEmployeeId: principal.employeeId });
      }
      if (scope.type === 'department' && scope.refId) {
        clauses.push({ departmentId: scope.refId });
      }
      if (scope.type === 'location' && scope.refId) {
        clauses.push({ locationId: scope.refId });
      }
      if (scope.type === 'tenant') return tenantClause;
    }
    if (clauses.length === 0) return { id: '__none__' };
    return { ...tenantClause, OR: clauses };
  }

  canManageEmployee(principal: AuthenticatedUser, employeeId: string): boolean {
    if (this.hasTenantScope(principal)) return true;
    if (principal.employeeId === employeeId) return true;
    return false;
  }

  private hasTenantScope(principal: AuthenticatedUser): boolean {
    return principal.scopes.some((scope) => scope.type === 'tenant');
  }
}
