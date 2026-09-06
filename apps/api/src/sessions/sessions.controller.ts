import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SessionsService } from './sessions.service';
import { CreateSessionDto, JoinSessionDto, SetMeetingDto } from './dto/session.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private sessions: SessionsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) { return this.sessions.findMine(user); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    return this.sessions.create(user, dto.courseId, dto.title);
  }

  @Post('join')
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinSessionDto) {
    return this.sessions.joinByCode(user, dto.roomCode);
  }

  @Get(':id/snapshot')
  snapshot(@Param('id', ParseUUIDPipe) id: string) { return this.sessions.snapshot(id); }

  @Get(':id/roster')
  @Roles(Role.TEACHER, Role.ADMIN)
  roster(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.roster(user, id);
  }

  @Post(':id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.leave(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post(':id/heartbeat')
  heartbeat(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.heartbeat(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post(':id/meeting')
  meeting(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetMeetingDto) {
    return this.sessions.setMeeting(user, id, dto.open);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.close(user, id);
  }
}
