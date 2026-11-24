import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DOCUMENT_TYPES = [
  'contract',
  'identification',
  'certificate',
  'policy',
  'performance',
  'other',
] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class PresignDocumentDto {
  @IsUUID()
  employeeId!: string;

  @IsIn([...DOCUMENT_TYPES])
  documentType!: (typeof DOCUMENT_TYPES)[number];

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(/^[^/\\]+$/, { message: 'fileName must not contain path separators' })
  fileName!: string;

  @IsIn([...ALLOWED_DOCUMENT_MIME_TYPES])
  mimeType!: (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

  @Transform(trim)
  @Matches(/^\d+$/, { message: 'sizeBytes must be an integer string' })
  sizeBytes!: string;

  @Transform(trim)
  @Matches(/^[a-fA-F0-9]{64}$/, { message: 'checksumSha256 must be a SHA-256 hex string' })
  checksumSha256!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  retentionClass?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class ConfirmDocumentDto {
  @Transform(trim)
  @Matches(/^[a-fA-F0-9]{64}$/, { message: 'checksumSha256 must be a SHA-256 hex string' })
  checksumSha256!: string;
}

export class DocumentQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

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
