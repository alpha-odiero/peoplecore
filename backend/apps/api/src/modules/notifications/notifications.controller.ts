import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  CollectionResponse,
  NotificationListItem,
  NotificationPreferenceItem,
} from '@peoplecore/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto, UpdateNotificationPreferenceDto } from './dto/notification.dto';

@ApiTags('Notifications')
@Controller('notifications')
@RequirePermissions('notifications.read')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ): Promise<CollectionResponse<NotificationListItem>> {
    return this.service.list(user.tenantId, user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: { tenantId: string; id: string }): Promise<{ count: number }> {
    return this.service.unreadCount(user.tenantId, user.id);
  }

  @Get('preferences')
  preferences(
    @CurrentUser() user: { tenantId: string; id: string },
  ): Promise<NotificationPreferenceItem[]> {
    return this.service.preferences(user.tenantId, user.id);
  }

  @RequirePermissions('notifications.manage_preferences')
  @Put('preferences')
  updatePreference(
    @Body() dto: UpdateNotificationPreferenceDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ): Promise<NotificationPreferenceItem> {
    return this.service.updatePreference(user.tenantId, user.id, dto);
  }

  @Patch('read-all')
  markAll(@CurrentUser() user: { tenantId: string; id: string }): Promise<{ updated: number }> {
    return this.service.markAllRead(user.tenantId, user.id);
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { tenantId: string; id: string },
  ): Promise<NotificationListItem> {
    return this.service.markRead(user.tenantId, user.id, id);
  }
}
