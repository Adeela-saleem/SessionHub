import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { ContentStatus } from '@prisma/client';

/** An assignment is marked out of at most 100. Mirrored in the web form. */
const MAX_MARKS = 100;

export class CreateAssignmentDto {
  @IsString() @MinLength(2) @MaxLength(200)
  title!: string;

  @IsString() @MaxLength(20_000)
  instructions!: string;

  @IsOptional() @IsInt() @Min(1) @Max(MAX_MARKS)
  maxMarks?: number;

  @IsDateString()
  dueAt!: string;

  @IsOptional() @IsDateString()
  availableFrom?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsBoolean()
  allowLate?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  latePenaltyPct?: number;

  @IsOptional() @IsBoolean()
  resubmissions?: boolean;
}

export class UpdateAssignmentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(20_000)
  instructions?: string;

  @IsOptional() @IsInt() @Min(1) @Max(MAX_MARKS)
  maxMarks?: number;

  @IsOptional() @IsDateString()
  dueAt?: string;

  @IsOptional() @IsDateString()
  availableFrom?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsBoolean()
  allowLate?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  latePenaltyPct?: number;

  @IsOptional() @IsBoolean()
  resubmissions?: boolean;

  @IsOptional() @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional() @IsDateString()
  publishAt?: string;
}

export class DraftDto {
  @IsOptional() @IsString() @MaxLength(50_000)
  text?: string;
}

export class GradeDto {
  @IsInt() @Min(0) @Max(MAX_MARKS)
  marksAwarded!: number;

  @IsOptional() @IsString() @MaxLength(10_000)
  feedback?: string;
}
