import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ClockInDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsISO8601()
  at?: string;
}

export class ClockOutDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsISO8601()
  at?: string;
}

export class CreateAttendanceDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  workDate!: string;

  @IsISO8601()
  clockIn!: string;

  @IsOptional()
  @IsISO8601()
  clockOut?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  breakMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AttendanceQueryDto {
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
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AttendanceSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
