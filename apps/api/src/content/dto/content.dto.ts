import { ContentStatus, LessonType, ProgressStatus } from '@prisma/client';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUrl,
  Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class CreateModuleDto {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
}

export class UpdateModuleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @IsOptional() @IsString() publishAt?: string;
}

export class CreateLessonDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsOptional() @IsEnum(LessonType) type?: LessonType;
  @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @IsOptional() @IsString() @MaxLength(1000) url?: string;
  @IsOptional() @IsInt() @Min(1) @Max(600) durationMin?: number;
}

export class UpdateLessonDto extends CreateLessonDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare title: string;
  @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @IsOptional() @IsString() publishAt?: string;
}

/** Ordered list of ids; index in the array becomes the new order. */
export class ReorderDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
}

export class CreateResourceDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsUrl({ require_tld: false }) @MaxLength(1000) url!: string;
  @IsOptional() @IsString() @MaxLength(120) mimeType?: string;
  @IsOptional() @IsInt() @Min(0) sizeBytes?: number;
}

export class ProgressDto {
  @IsOptional() @IsEnum(ProgressStatus) status?: ProgressStatus;
  @IsOptional() @IsInt() @Min(0) @Max(100) percent?: number;
  @IsOptional() @IsInt() @Min(0) positionSec?: number;
}
