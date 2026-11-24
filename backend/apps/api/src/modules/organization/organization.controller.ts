import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, DepartmentListItem, TenantSettings } from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  UpdateTenantSettingsDto,
} from './dto/organization.dto';
import { OrganizationService } from './organization.service';

@ApiTags('Organization')
@Controller()
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @RequirePermissions('departments.read')
  @Get('departments')
  listDepartments(@CurrentUser() user: AuthenticatedUser | null): Promise<DepartmentListItem[]> {
    return this.organizationService.listDepartments(this.requirePrincipal(user).tenantId);
  }

  @RequirePermissions('departments.create')
  @Post('departments')
  createDepartment(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<DepartmentListItem> {
    const principal = this.requirePrincipal(user);
    return this.organizationService.createDepartment(dto, principal.tenantId, principal.id);
  }

  @RequirePermissions('departments.update')
  @Patch('departments/:id')
  updateDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<DepartmentListItem> {
    const principal = this.requirePrincipal(user);
    return this.organizationService.updateDepartment(id, dto, principal.tenantId, principal.id);
  }

  @Get('tenant/settings')
  getTenantSettings(@CurrentUser() user: AuthenticatedUser | null): Promise<TenantSettings> {
    return this.organizationService.getTenantSettings(this.requirePrincipal(user).tenantId);
  }

  @RequirePermissions('users.manage')
  @Patch('tenant/settings')
  updateTenantSettings(
    @Body() dto: UpdateTenantSettingsDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<TenantSettings> {
    const principal = this.requirePrincipal(user);
    return this.organizationService.updateTenantSettings(dto, principal.tenantId, principal.id);
  }

  private requirePrincipal(user: AuthenticatedUser | null): AuthenticatedUser {
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not available');
    return user;
  }
}
