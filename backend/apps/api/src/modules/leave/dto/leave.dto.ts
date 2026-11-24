import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualAllowanceDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accrualPerMonthDays?: number;

  @IsOptional()
  @IsBoolean()
  carryOverAllowed?: boolean;
}

export class CreateLeaveRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  leaveTypeId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsUUID()
  approverUserId?: string;
}

export class LeaveQueryDto {
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
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
