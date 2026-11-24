import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ApprovalRequestListItem, CollectionResponse } from '@peoplecore/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApprovalsService } from './approvals.service';
import { ApprovalQueryDto, CreateApprovalDto, DecideApprovalDto } from './dto/approval.dto';

@ApiTags('Approvals')
@Controller('approvals')
@RequirePermissions('approvals.read')
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @RequirePermissions('approvals.create')
  @Post()
  create(
    @Body() dto: CreateApprovalDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ): Promise<ApprovalRequestListItem> {
    return this.service.create(user.tenantId, user.id, dto);
  }

  @Get()
  list(
    @Query() query: ApprovalQueryDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ): Promise<CollectionResponse<ApprovalRequestListItem>> {
    return this.service.list(user.tenantId, user.id, query);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { tenantId: string },
  ): Promise<ApprovalRequestListItem> {
    return this.service.get(user.tenantId, id);
  }

  @RequirePermissions('approvals.decide')
  @Patch(':id/decision')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ): Promise<ApprovalRequestListItem> {
    return this.service.decide(user.tenantId, user.id, id, dto);
  }
}
