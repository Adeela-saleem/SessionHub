import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcements.dto';

@ApiTags('announcements')
@ApiBearerAuth()
@Controller()
export class AnnouncementsController {
  constructor(private announcements: AnnouncementsService) {}

  @Get('courses/:courseId/announcements')
  listForCourse(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.announcements.listForCourse(user, courseId);
  }

  @Roles(Role.STUDENT)
  @Get('me/announcements')
  myFeed(@CurrentUser() user: AuthUser, @Query('take') take?: number) {
    return this.announcements.myFeed(user, Number(take) || 10);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('courses/:courseId/announcements')
  create(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateAnnouncementDto,
  ) { return this.announcements.create(user, courseId, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('announcements/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) { return this.announcements.update(user, id, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('announcements/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.remove(user, id);
  }
}
