import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { PollsService } from './polls.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

class CreatePollDto {
  @IsString() @MaxLength(500) prompt!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(200, { each: true })
  options!: string[];
}
class VoteDto { @IsInt() @Min(0) @Max(5) optionIndex!: number; }

@ApiTags('polls')
@ApiBearerAuth()
@Controller()
export class PollsController {
  constructor(private polls: PollsService) {}

  @Get('sessions/:sessionId/polls')
  list(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.polls.listForSession(sessionId);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('sessions/:sessionId/polls')
  create(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreatePollDto,
  ) { return this.polls.create(user, sessionId, dto.prompt, dto.options); }

  @Roles(Role.STUDENT)
  @Post('polls/:id/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoteDto,
  ) { return this.polls.vote(user, id, dto.optionIndex); }

  @Get('polls/:id/results')
  results(@Param('id', ParseUUIDPipe) id: string) { return this.polls.results(id); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('polls/:id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.polls.close(user, id);
  }
}
