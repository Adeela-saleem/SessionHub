import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AiService } from './ai.service';
import { Roles } from '../common/decorators/roles.decorator';

class GenerateQuizDto {
  @IsString() @MaxLength(200) topic!: string;
  @IsOptional() @IsString() @MaxLength(120) subject?: string;
  @IsEnum(['Easy', 'Medium', 'Hard']) difficulty!: 'Easy' | 'Medium' | 'Hard';
  @IsEnum(['MCQ', 'SHORT', 'MIXED']) format!: 'MCQ' | 'SHORT' | 'MIXED';
  @IsInt() @Min(1) @Max(20) count!: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

  /**
   * Returns drafts only. Nothing is persisted here — the teacher reviews
   * the questions and posts them to /sessions/:id/questions explicitly,
   * so AI output cannot reach students unreviewed.
   */
  @Roles(Role.TEACHER, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Post('quiz')
  generateQuiz(@Body() dto: GenerateQuizDto) { return this.ai.generateQuiz(dto); }
}
