import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { QuizService } from './quiz.service';
import { CreateQuestionsDto, SubmitAnswerDto } from './dto/quiz.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('quiz')
@ApiBearerAuth()
@Controller()
export class QuizController {
  constructor(private quiz: QuizService) {}

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('sessions/:sessionId/questions')
  create(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateQuestionsDto,
  ) {
    return this.quiz.createQuestions(user, sessionId, dto.questions);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('sessions/:sessionId/questions')
  list(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.quiz.listForTeacher(user, sessionId);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('questions/:id/open')
  open(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quiz.open(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('questions/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quiz.close(user, id);
  }

  // Tight limit: one legitimate answer per question, so anything
  // approaching this rate is a script.
  @Roles(Role.STUDENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('questions/:id/answer')
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.quiz.submitAnswer(user, id, dto);
  }

  @Get('questions/:id/results')
  results(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quiz.results(user, id);
  }
}
