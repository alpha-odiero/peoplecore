import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  AuthenticatedUser,
  AuditEventListItem,
  CollectionResponse,
  DashboardSummary,
  PermissionListItem,
  RoleListItem,
  UserListItem,
} from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AdminService } from './admin.service';
import {
  AssignRoleDto,
  AuditQueryDto,
  InviteUserDto,
  UpdateRolePermissionsDto,
} from './dto/admin.dto';

@ApiTags('Administration')
@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @RequirePermissions('dashboard.read')
  @Get('dashboard/summary')
  dashboardSummary(@CurrentUser() user: AuthenticatedUser | null): Promise<DashboardSummary> {
    return this.adminService.dashboardSummary(this.requirePrincipal(user).tenantId);
  }

  @RequirePermissions('audit.read')
  @Get('audit')
  listAudit(
    @Query() query: AuditQueryDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<CollectionResponse<AuditEventListItem>> {
    return this.adminService.listAudit(query, this.requirePrincipal(user).tenantId);
  }

  @RequirePermissions('users.read')
  @Get('users')
  listUsers(@CurrentUser() user: AuthenticatedUser | null): Promise<UserListItem[]> {
    return this.adminService.listUsers(this.requirePrincipal(user).tenantId);
  }

  @RequirePermissions('users.manage')
  @Post('users')
  inviteUser(
    @Body() dto: InviteUserDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<UserListItem> {
    const principal = this.requirePrincipal(user);
    return this.adminService.inviteUser(dto, principal.tenantId, principal.id);
  }

  @RequirePermissions('users.manage')
  @Post('users/assign-role')
  assignRole(
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<UserListItem> {
    const principal = this.requirePrincipal(user);
    return this.adminService.assignRole(dto, principal.tenantId, principal.id);
  }

  @RequirePermissions('roles.read')
  @Get('roles')
  listRoles(@CurrentUser() user: AuthenticatedUser | null): Promise<RoleListItem[]> {
    return this.adminService.listRoles(this.requirePrincipal(user).tenantId);
  }

  @RequirePermissions('roles.manage')
  @Patch('roles/:id/permissions')
  updateRolePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<RoleListItem> {
    const principal = this.requirePrincipal(user);
    return this.adminService.updateRolePermissions(
      { ...dto, roleId: id },
      principal.tenantId,
      principal.id,
    );
  }

  @RequirePermissions('permissions.read')
  @Get('permissions')
  listPermissions(): Promise<PermissionListItem[]> {
    return this.adminService.listPermissions();
  }

  private requirePrincipal(user: AuthenticatedUser | null): AuthenticatedUser {
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not available');
    return user;
  }
}
