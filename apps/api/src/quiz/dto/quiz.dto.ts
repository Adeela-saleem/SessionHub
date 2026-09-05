import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional,
  IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { QuestionType } from '@prisma/client';

export class QuestionDraftDto {
  @ApiProperty() @IsString() @MaxLength(1000) prompt!: string;

  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType) type!: QuestionType;

  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(300, { each: true })
  options!: string[];

  @ApiPropertyOptional({ description: 'Required for MCQ. Never sent to students.' })
  @IsOptional() @IsInt() @Min(0) @Max(5)
  correctIndex?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  explanation?: string;

  @ApiProperty() @IsInt() @Min(1) @Max(100) marks!: number;

  @ApiPropertyOptional({ description: 'Server-enforced countdown in seconds' })
  @IsOptional() @IsInt() @Min(5) @Max(3600)
  durationSeconds?: number;
}

export class CreateQuestionsDto {
  @ApiProperty({ type: [QuestionDraftDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => QuestionDraftDto)
  questions!: QuestionDraftDto[];
}

export class SubmitAnswerDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(5) answerIndex?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) answerText?: string;
}
