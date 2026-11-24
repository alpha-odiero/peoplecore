import { Type } from 'class-transformer';
import {
  IsDateString,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVacancyDto {
  @IsString()
  @Matches(/^[A-Z0-9-]+$/)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  employmentType?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  salaryMinMinor?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  salaryMaxMinor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}

export class CreateCandidateDto {
  @IsString()
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MaxLength(120)
  lastName!: string;

  @IsString()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}

export class CreateApplicationDto {
  @IsUUID()
  vacancyId!: string;

  @IsUUID()
  candidateId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApplicationQueryDto {
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
  vacancyId?: string;

  @IsOptional()
  @IsString()
  stage?: string;
}

export class UpdateApplicationStageDto {
  @IsString()
  stage!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ScheduleInterviewDto {
  @IsISO8601()
  scheduledAt!: string;

  @IsUUID()
  interviewerUserId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOfferDto {
  @Matches(/^\d+$/)
  salaryMinor!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsDateString()
  startDate!: string;
}
