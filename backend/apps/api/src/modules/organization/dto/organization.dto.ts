import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDepartmentDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsUUID()
  managerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenter?: string;
}

export class UpdateDepartmentDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsUUID()
  managerEmployeeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTenantSettingsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  defaultLocale?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  defaultTimezone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  defaultCurrency?: string;
}
