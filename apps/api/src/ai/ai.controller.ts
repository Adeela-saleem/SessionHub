import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { AiService } from './ai.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaperService } from './paper.service';
import { QuizLibraryService } from './quiz-library.service';
import { QuestionDraftDto } from '../quiz/dto/quiz.dto';

/** Hard ceiling on how many questions one generation may ask for —
    a quiz draft or an exam paper. Mirrored in the web forms. */
const MAX_QUESTIONS = 50;

/** An exam paper is marked out of at most 100 — the printed total and
    the sum of every subpart's marks both stay inside it. */
const MAX_MARKS = 100;

class GenerateQuizDto {
  @IsString() @MaxLength(200) topic!: string;
  @IsOptional() @IsString() @MaxLength(120) subject?: string;
  @IsEnum(['Easy', 'Medium', 'Hard']) difficulty!: 'Easy' | 'Medium' | 'Hard';
  @IsEnum(['MCQ', 'SHORT', 'MIXED']) format!: 'MCQ' | 'SHORT' | 'MIXED';
  @IsInt() @Min(1) @Max(MAX_QUESTIONS) count!: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class PaperPartDto {
  @IsString() @MaxLength(4) label!: string;
  /** Half marks are common on the department's sheets ("2.5x4=10"). */
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(MAX_MARKS) marks!: number;
}

class PaperQuestionConfigDto {
  @IsInt() @Min(1) @Max(MAX_QUESTIONS) num!: number;
  @IsString() @MaxLength(20) clo!: string;
  @IsString() @MaxLength(20) btl!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(12)
  @ValidateNested({ each: true }) @Type(() => PaperPartDto)
  parts!: PaperPartDto[];
}

class PaperFieldsDto {
  @IsOptional() @IsEnum(['TERMINAL', 'LAB']) paperType?: 'TERMINAL' | 'LAB';
  @IsString() @MaxLength(120) instructor!: string;
  @IsString() @MaxLength(160) university!: string;
  @IsOptional() @IsString() @MaxLength(160) department?: string;
  @IsString() @MaxLength(160) subjectName!: string;
  @IsOptional() @IsString() @MaxLength(40) courseCode?: string;
  @IsString() @MaxLength(120) program!: string;
  @IsString() @MaxLength(60) semester!: string;
  @IsOptional() @IsString() @MaxLength(60) section?: string;
  @IsString() @MaxLength(60) examType!: string;
  @IsOptional() @IsString() @MaxLength(40) examDate?: string;
  @IsString() @MaxLength(60) duration!: string;
  @IsString() @MaxLength(20)
  @Matches(/^\d{1,3}$/, { message: 'Total marks must be a whole number' })
  totalMarks!: string;
  @IsOptional() @IsString() @MaxLength(200) marksBreakdown?: string;
  @IsOptional() @IsString() @MaxLength(4) paperVersion?: string;
  @IsString() @MaxLength(4000) topics!: string;
  @IsString() @MaxLength(4000) clos!: string;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
}

class GeneratePaperDto {
  @ValidateNested() @Type(() => PaperFieldsDto) fields!: PaperFieldsDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true }) @Type(() => PaperQuestionConfigDto)
  questionConfig!: PaperQuestionConfigDto[];
}

/** The payload is the whole generated paper; the global whitelist would
    strip an undecorated property, so it must be declared explicitly. */
class SavePaperDto {
  @IsString() @MaxLength(200) title!: string;
  @IsObject() payload!: Record<string, unknown>;
}

class UpdatePaperDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

/** Same per-question rules as a broadcast, so a saved quiz can always be sent. */
class SaveQuizDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(200) topic?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true }) @Type(() => QuestionDraftDto)
  questions!: QuestionDraftDto[];
}

class UpdateQuizDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true }) @Type(() => QuestionDraftDto)
  questions?: QuestionDraftDto[];
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private ai: AiService,
    private papers: PaperService,
    private quizzes: QuizLibraryService,
  ) {}

  /**
   * Returns drafts only. Nothing is persisted here — the teacher reviews
   * the questions and posts them to /sessions/:id/questions explicitly,
   * so AI output cannot reach students unreviewed.
   */
  @Roles(Role.TEACHER, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Post('quiz')
  generateQuiz(@Body() dto: GenerateQuizDto) { return this.ai.generateQuiz(dto); }

  /**
   * Exam paper. Like the quiz endpoint this returns a draft only —
   * the teacher reviews it and saves explicitly.
   */
  @Roles(Role.TEACHER, Role.ADMIN)
  @Throttle({ default: { limit: 6, ttl: 600_000 } })
  @Post('paper')
  generatePaper(@Body() dto: GeneratePaperDto) {
    // Per-field decorators cannot see across fields, so the two totals
    // are checked here: the printed total and the marking scheme's sum.
    const total = Number(dto.fields.totalMarks);
    if (!Number.isInteger(total) || total < 1 || total > MAX_MARKS) {
      throw new BadRequestException(`Total marks must be between 1 and ${MAX_MARKS}`);
    }
    const scheme = dto.questionConfig.reduce(
      (sum, q) => sum + q.parts.reduce((s, p) => s + p.marks, 0), 0,
    );
    if (scheme > MAX_MARKS) {
      throw new BadRequestException(`The marking scheme adds up to ${scheme}; a paper is out of at most ${MAX_MARKS}`);
    }
    return this.ai.generatePaper(
      {
        paperType: 'TERMINAL', section: '', instructions: '', department: '',
        courseCode: '', marksBreakdown: '', paperVersion: '', ...dto.fields,
      } as never,
      dto.questionConfig,
    );
  }

  // ── Saved quizzes ──────────────────────────────────────────
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('quizzes')
  listQuizzes(@CurrentUser() user: AuthUser) { return this.quizzes.list(user); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('quizzes/:id')
  getQuiz(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.get(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('quizzes')
  saveQuiz(@CurrentUser() user: AuthUser, @Body() dto: SaveQuizDto) {
    return this.quizzes.save(user, dto.title, dto.topic, dto.questions);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('quizzes/:id')
  updateQuiz(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuizDto) {
    return this.quizzes.update(user, id, dto);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('quizzes/:id')
  deleteQuiz(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.remove(user, id);
  }

  // ── Saved papers ───────────────────────────────────────────
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('papers')
  listPapers(@CurrentUser() user: AuthUser) { return this.papers.list(user); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('papers/:id')
  getPaper(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.papers.get(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('papers')
  savePaper(@CurrentUser() user: AuthUser, @Body() dto: SavePaperDto) {
    return this.papers.save(user, dto.title, dto.payload);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('papers/:id')
  updatePaper(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaperDto) {
    return this.papers.update(user, id, dto);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('papers/:id')
  deletePaper(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.papers.remove(user, id);
  }
}
