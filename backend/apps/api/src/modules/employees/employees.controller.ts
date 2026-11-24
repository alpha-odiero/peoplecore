import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  AuthenticatedUser,
  CollectionResponse,
  EmployeeListItem,
  EmploymentHistoryListItem,
} from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { EmployeesService } from './employees.service';
import {
  BulkChangeEmployeeStatusDto,
  ChangeEmployeeStatusDto,
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
} from './dto/employees.dto';

@ApiTags('Employees')
@RequirePermissions('employees.read')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  list(
    @Query() query: EmployeeQueryDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<CollectionResponse<EmployeeListItem>> {
    return this.employeesService.list(query, this.requirePrincipal(user));
  }

  @RequirePermissions('employees.create')
  @Post()
  create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<EmployeeListItem> {
    return this.employeesService.create(dto, this.requirePrincipal(user));
  }

  @RequirePermissions('employees.change_status')
  @Post('bulk-status')
  bulkChangeStatus(
    @Body() dto: BulkChangeEmployeeStatusDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<{ updated: number }> {
    return this.employeesService.bulkChangeStatus(dto, this.requirePrincipal(user));
  }

  @RequirePermissions('employees.get_history')
  @Get(':id/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<EmploymentHistoryListItem[]> {
    return this.employeesService.history(id, this.requirePrincipal(user));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<EmployeeListItem> {
    return this.employeesService.findOne(id, this.requirePrincipal(user));
  }

  @RequirePermissions('employees.update')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<EmployeeListItem> {
    return this.employeesService.update(id, dto, this.requirePrincipal(user));
  }

  @RequirePermissions('employees.change_status')
  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEmployeeStatusDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<EmployeeListItem> {
    return this.employeesService.changeStatus(id, dto, this.requirePrincipal(user));
  }

  private requirePrincipal(user: AuthenticatedUser | null): AuthenticatedUser {
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not available');
    return user;
  }
}
