import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { GradeCategoryKind } from '@prisma/client';

export class CreateCategoryDto {
  @IsString() @MinLength(2) @MaxLength(80)
  name!: string;

  @IsOptional() @IsEnum(GradeCategoryKind)
  kind?: GradeCategoryKind;

  @IsInt() @Min(0) @Max(100)
  weightPct!: number;

  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @IsOptional() @IsEnum(GradeCategoryKind)
  kind?: GradeCategoryKind;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  weightPct?: number;

  @IsOptional() @IsInt() @Min(0)
  order?: number;
}
