import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

const lowerTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class LoginDto {
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @Transform(lowerTrim)
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  tenantSlug?: string;
}

export class RegisterDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  tenantName!: string;

  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, {
    message: 'Password must include upper, lower, digit, and symbol characters',
  })
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Transform(lowerTrim)
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, {
    message: 'Password must include upper, lower, digit, and symbol characters',
  })
  newPassword!: string;
}
