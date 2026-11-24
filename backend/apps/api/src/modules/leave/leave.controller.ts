import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateLeaveRequestDto, CreateLeaveTypeDto, LeaveQueryDto } from './dto/leave.dto';
import { LeaveService } from './leave.service';

@ApiTags('Leave')
@Controller('leave')
@RequirePermissions('leave.read')
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Get('types')
  listTypes(@CurrentUser() user: { tenantId: string }) {
    return this.service.listTypes(user.tenantId);
  }

  @RequirePermissions('leave.manage_policies')
  @Post('types')
  createType(@Body() dto: CreateLeaveTypeDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.createType(user.tenantId, dto);
  }

  @Get('balances')
  listBalances(
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listBalances(user.tenantId, employeeId);
  }

  @Get('requests')
  listRequests(@Query() query: LeaveQueryDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.listRequests(user.tenantId, query);
  }

  @RequirePermissions('leave.request')
  @Post('requests')
  createRequest(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.createRequest(user.tenantId, user.id, dto);
  }

  @RequirePermissions('leave.approve')
  @Patch('requests/:id/decision')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('decision') decision: 'approved' | 'rejected',
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new AppError(400, 'INVALID_DECISION', 'Decision must be approved or rejected');
    }
    return this.service.decide(user.tenantId, user.id, id, decision);
  }

  @Patch('requests/:id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.cancel(user.tenantId, user.id, id);
  }
}
