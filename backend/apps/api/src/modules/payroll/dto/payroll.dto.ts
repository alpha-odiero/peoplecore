import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSalaryStructureDto {
  @IsUUID()
  employeeId!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Matches(/^\d+$/)
  baseSalaryMinor!: string;

  @IsOptional()
  @Matches(/^\d+$/)
  allowanceMinor?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class CreatePayrollRunDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsInt()
  @Min(0)
  @Max(10_000)
  taxRateBps = 0;
}

export class PayrollRunQueryDto {
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
  @IsString()
  status?: string;
}

export class ApprovePayrollRunDto {
  @IsOptional()
  @IsISO8601()
  approvedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
