import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, type EmployeeStatus } from '@peoplecore/shared';

const ALLOWED_INITIAL_STATUSES = ['draft', 'onboarding', 'active'] as const;

export class EmployeeQueryDto {
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
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['name', 'department', 'status'])
  sortBy?: 'name' | 'department' | 'status';

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES as unknown as string[])
  status?: EmployeeStatus;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  workEmail?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  managerEmployeeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  jobProfileTitle?: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsIn(ALLOWED_INITIAL_STATUSES as unknown as string[])
  status?: EmployeeStatus;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  workEmail?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  managerEmployeeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  jobProfileTitle?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;
}

export class ChangeEmployeeStatusDto {
  @IsIn(EMPLOYEE_STATUSES as unknown as string[])
  status!: EmployeeStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BulkChangeEmployeeStatusDto extends ChangeEmployeeStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
