import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AttendanceService } from './attendance.service';
import {
  AttendanceQueryDto,
  AttendanceSummaryQueryDto,
  ClockInDto,
  ClockOutDto,
  CreateAttendanceDto,
} from './dto/attendance.dto';

@ApiTags('Attendance')
@Controller('attendance')
@RequirePermissions('attendance.read')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get()
  list(@Query() query: AttendanceQueryDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.list(user.tenantId, query);
  }

  @Get('summary')
  summary(@Query() query: AttendanceSummaryQueryDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.summary(user.tenantId, query);
  }

  @RequirePermissions('attendance.record')
  @Post('clock-in')
  clockIn(@Body() dto: ClockInDto, @CurrentUser() user: { tenantId: string; id: string }) {
    return this.service.clockIn(user.tenantId, user.id, dto);
  }

  @RequirePermissions('attendance.record')
  @Post('clock-out')
  clockOut(@Body() dto: ClockOutDto, @CurrentUser() user: { tenantId: string; id: string }) {
    return this.service.clockOut(user.tenantId, user.id, dto);
  }

  @RequirePermissions('attendance.manage')
  @Post()
  create(@Body() dto: CreateAttendanceDto, @CurrentUser() user: { tenantId: string; id: string }) {
    return this.service.create(user.tenantId, user.id, dto);
  }
}
