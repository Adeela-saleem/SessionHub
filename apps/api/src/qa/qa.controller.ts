import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { QaService } from './qa.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

class AskDto { @IsString() @MinLength(3) @MaxLength(1000) body!: string; }
class AnswerDto { @IsString() @MinLength(1) @MaxLength(2000) answerText!: string; }

@ApiTags('qa')
@ApiBearerAuth()
@Controller()
export class QaController {
  constructor(private qa: QaService) {}

  @Get('sessions/:sessionId/qa')
  list(@Param('sessionId', ParseUUIDPipe) sessionId: string) { return this.qa.list(sessionId); }

  @Roles(Role.STUDENT)
  @Post('sessions/:sessionId/qa')
  ask(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: AskDto,
  ) { return this.qa.ask(user, sessionId, dto.body); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('qa/:id/answer')
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnswerDto,
  ) { return this.qa.answer(user, id, dto.answerText); }
}
