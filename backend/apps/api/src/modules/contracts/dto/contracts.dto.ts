import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
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
import { CONTRACT_STATUSES, CONTRACT_TYPES } from '@peoplecore/shared';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateContractDto {
  @IsUUID()
  employeeId!: string;

  @IsIn([...CONTRACT_TYPES])
  type!: (typeof CONTRACT_TYPES)[number];

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\d+$/, { message: 'salaryMinor must be an integer string' })
  salaryMinor?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  payFrequency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(168)
  workingHoursWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24)
  probationMonths?: number;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @IsIn([...CONTRACT_TYPES])
  type?: (typeof CONTRACT_TYPES)[number];

  @IsOptional()
  @IsIn([...CONTRACT_STATUSES])
  status?: (typeof CONTRACT_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\d+$/, { message: 'salaryMinor must be an integer string' })
  salaryMinor?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  payFrequency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(168)
  workingHoursWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24)
  probationMonths?: number;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  terminationDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ContractQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
