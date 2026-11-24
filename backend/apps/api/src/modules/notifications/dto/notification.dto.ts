import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { NOTIFICATION_CHANNELS } from '@peoplecore/shared';

export class NotificationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly = false;
}

export class UpdateNotificationPreferenceDto {
  @IsIn(NOTIFICATION_CHANNELS as unknown as string[])
  channel!: (typeof NOTIFICATION_CHANNELS)[number];

  @IsString()
  @MaxLength(80)
  category!: string;

  @IsBoolean()
  enabled!: boolean;
}
