import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PerformanceService } from './performance.service';
import {
  CreateFeedbackDto,
  CreatePerformanceCycleDto,
  CreatePerformanceGoalDto,
  CreatePerformanceReviewDto,
  SubmitReviewDto,
  UpdateGoalStatusDto,
} from './dto/performance.dto';

@ApiTags('Performance')
@Controller('performance')
@RequirePermissions('performance.read')
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  @Get('cycles')
  listCycles(@CurrentUser() user: { tenantId: string }) {
    return this.service.listCycles(user.tenantId);
  }

  @RequirePermissions('performance.manage')
  @Post('cycles')
  createCycle(@Body() dto: CreatePerformanceCycleDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.createCycle(user.tenantId, dto);
  }

  @Get('goals')
  listGoals(
    @Query('cycleId') cycleId: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listGoals(user.tenantId, cycleId, employeeId);
  }

  @RequirePermissions('performance.manage')
  @Post('goals')
  createGoal(
    @Body() dto: CreatePerformanceGoalDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.createGoal(user.tenantId, user.id, dto);
  }

  @RequirePermissions('performance.manage')
  @Patch('goals/:id/status')
  updateGoalStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalStatusDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.updateGoalStatus(user.tenantId, id, dto);
  }

  @Get('reviews')
  listReviews(
    @Query('cycleId') cycleId: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listReviews(user.tenantId, cycleId, employeeId);
  }

  @RequirePermissions('performance.manage')
  @Post('reviews')
  createReview(
    @Body() dto: CreatePerformanceReviewDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.createReview(user.tenantId, user.id, dto);
  }

  @RequirePermissions('performance.manage')
  @Patch('reviews/:id/submit')
  submitReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReviewDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.submitReview(user.tenantId, user.id, id, dto);
  }

  @Patch('reviews/:id/feedback')
  addFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.addFeedback(user.tenantId, user.id, id, dto);
  }

  @RequirePermissions('performance.calibrate')
  @Get('calibration')
  calibration(@Query('cycleId') cycleId: string, @CurrentUser() user: { tenantId: string }) {
    return this.service.calibration(user.tenantId, cycleId);
  }
}
