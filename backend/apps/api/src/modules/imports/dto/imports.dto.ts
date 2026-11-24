import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const IMPORT_MODES = ['create_only', 'upsert_by_employee_number'] as const;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class PresignImportDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  idempotencyKey!: string;

  @IsIn([...IMPORT_MODES])
  mode!: (typeof IMPORT_MODES)[number];

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(/^[^/\\]+\.csv$/i, { message: 'fileName must be a CSV file name' })
  fileName!: string;
}

export class ImportQueryDto {
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
}
