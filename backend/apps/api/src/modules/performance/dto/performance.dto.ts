import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePerformanceCycleDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;
}

export class CreatePerformanceGoalDto {
  @IsUUID()
  cycleId!: string;

  @IsUUID()
  employeeId!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;
}

export class UpdateGoalStatusDto {
  @IsString()
  status!: string;
}

export class CreatePerformanceReviewDto {
  @IsUUID()
  cycleId!: string;

  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  improvements?: string;
}

export class SubmitReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  improvements?: string;
}

export class CreateFeedbackDto {
  @IsString()
  @MaxLength(4000)
  comment!: string;
}
