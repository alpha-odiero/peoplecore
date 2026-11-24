import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { PERMISSIONS, ROLE_KEYS, SCOPE_TYPES, type RoleKey } from '@peoplecore/shared';

export class AuditQueryDto {
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
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resourceId?: string;
}

export class InviteUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  lastName?: string;

  @IsIn(ROLE_KEYS as unknown as string[])
  roleKey!: RoleKey;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class AssignRoleDto {
  @IsUUID()
  userId!: string;

  @IsIn(ROLE_KEYS as unknown as string[])
  roleKey!: RoleKey;

  @IsIn(SCOPE_TYPES as unknown as string[])
  scopeType!: (typeof SCOPE_TYPES)[number];

  @IsOptional()
  @IsUUID()
  scopeRefId?: string;
}

export class UpdateRolePermissionsDto {
  @IsUUID()
  roleId!: string;

  @IsArray()
  @ArrayMaxSize(PERMISSIONS.length)
  @IsIn(PERMISSIONS as unknown as string[], { each: true })
  permissionKeys!: string[];
}
