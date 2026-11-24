import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PayrollService } from './payroll.service';
import {
  ApprovePayrollRunDto,
  CreatePayrollRunDto,
  CreateSalaryStructureDto,
  PayrollRunQueryDto,
} from './dto/payroll.dto';

@ApiTags('Payroll')
@Controller('payroll')
@RequirePermissions('payroll.read')
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Get('calculation-rule')
  calculationRule() {
    return this.service.calculationRule();
  }

  @Get('structures')
  listStructures(
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listStructures(user.tenantId, employeeId);
  }

  @RequirePermissions('payroll.manage')
  @Post('structures')
  createStructure(
    @Body() dto: CreateSalaryStructureDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.createStructure(user.tenantId, dto);
  }

  @Get('runs')
  listRuns(@Query() query: PayrollRunQueryDto, @CurrentUser() user: { tenantId: string }) {
    return this.service.listRuns(user.tenantId, query);
  }

  @RequirePermissions('payroll.manage')
  @Post('runs')
  createRun(
    @Body() dto: CreatePayrollRunDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.createRun(user.tenantId, user.id, dto);
  }

  @Get('runs/:id')
  getRun(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { tenantId: string }) {
    return this.service.getRun(user.tenantId, id);
  }

  @RequirePermissions('payroll.approve')
  @Patch('runs/:id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovePayrollRunDto,
    @CurrentUser() user: { tenantId: string; id: string },
  ) {
    return this.service.approve(user.tenantId, user.id, id, dto);
  }

  @RequirePermissions('payroll.manage')
  @Patch('runs/:id/paid')
  markPaid(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { tenantId: string }) {
    return this.service.markPaid(user.tenantId, id);
  }

  @RequirePermissions('payroll.export')
  @Get('runs/:id/export')
  @Header('Content-Type', 'text/csv')
  exportCsv(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { tenantId: string }) {
    return this.service.exportCsv(user.tenantId, id);
  }
}
