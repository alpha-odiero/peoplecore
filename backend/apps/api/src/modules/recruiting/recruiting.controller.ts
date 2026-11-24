import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RecruitingService } from './recruiting.service';
import {
  ApplicationQueryDto,
  CreateApplicationDto,
  CreateCandidateDto,
  CreateOfferDto,
  CreateVacancyDto,
  ScheduleInterviewDto,
  UpdateApplicationStageDto,
} from './dto/recruiting.dto';

@ApiTags('Recruiting')
@Controller('recruiting')
@RequirePermissions('recruiting.read')
export class RecruitingController {
  constructor(private readonly service: RecruitingService) {}

  @Get('vacancies')
  listVacancies(@CurrentUser() user: { tenantId: string }) {
    return this.service.listVacancies(user.tenantId);
  }

  @RequirePermissions('recruiting.manage')
  @Post('vacancies')
  createVacancy(@Body() dto: CreateVacancyDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.createVacancy(user.tenantId, dto);
  }

  @Get('candidates')
  listCandidates(@CurrentUser() user: { tenantId: string }) {
    return this.service.listCandidates(user.tenantId);
  }

  @RequirePermissions('recruiting.manage')
  @Post('candidates')
  createCandidate(@Body() dto: CreateCandidateDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.createCandidate(user.tenantId, dto);
  }

  @Get('applications')
  listApplications(@Query() query: ApplicationQueryDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.listApplications(user.tenantId, query);
  }

  @RequirePermissions('recruiting.manage')
  @Post('applications')
  apply(@Body() dto: CreateApplicationDto, @CurrentUser() user: { tenantId: string; id: string }) {
    return this.service.apply(user.tenantId, user.id, dto);
  }

  @RequirePermissions('recruiting.manage')
  @Patch('applications/:id/stage')
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStageDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.updateStage(user.tenantId, user.id, id, dto);
  }

  @RequirePermissions('recruiting.manage')
  @Post('applications/:id/interviews')
  scheduleInterview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleInterviewDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.scheduleInterview(user.tenantId, id, dto);
  }

  @RequirePermissions('recruiting.manage')
  @Post('applications/:id/offers')
  createOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOfferDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.createOffer(user.tenantId, id, dto);
  }

  @RequirePermissions('recruiting.manage')
  @Patch('offers/:id/accept')
  acceptOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.acceptOffer(user.tenantId, user.id, id);
  }
}
