import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  APPROVAL_STATUSES,
  APPROVAL_TYPES,
  ROLE_KEYS,
  type ApprovalStatus,
  type RoleKey,
} from '@peoplecore/shared';

export class ApprovalStepInputDto {
  @IsInt()
  @Min(1)
  @Max(10)
  stepOrder!: number;

  @IsOptional()
  @IsUUID()
  approverUserId?: string;

  @IsOptional()
  @IsIn(ROLE_KEYS as unknown as string[])
  approverRoleKey?: RoleKey;
}

export class CreateApprovalDto {
  @IsIn(APPROVAL_TYPES as unknown as string[])
  type!: (typeof APPROVAL_TYPES)[number];

  @IsString()
  @MaxLength(80)
  subjectType!: string;

  @IsUUID()
  subjectId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepInputDto)
  steps!: ApprovalStepInputDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ApprovalQueryDto {
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
  @IsIn(APPROVAL_STATUSES as unknown as string[])
  status?: ApprovalStatus;

  @IsOptional()
  @IsIn(['inbox', 'mine', 'all'])
  scope?: 'inbox' | 'mine' | 'all' = 'inbox';
}

export class DecideApprovalDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
