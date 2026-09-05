import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TimetableService } from './timetable.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSlotDto, UpdateSlotDto } from './dto/timetable.dto';

@ApiTags('timetable')
@ApiBearerAuth()
@Controller()
export class TimetableController {
  constructor(private timetable: TimetableService) {}

  @Get('me/timetable')
  myTimetable(@CurrentUser() user: AuthUser) {
    return this.timetable.myTimetable(user);
  }

  @Get('courses/:courseId/slots')
  listForCourse(@Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.timetable.listForCourse(courseId);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('courses/:courseId/slots')
  createSlot(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateSlotDto,
  ) { return this.timetable.createSlot(user, courseId, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('slots/:id')
  updateSlot(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSlotDto,
  ) { return this.timetable.updateSlot(user, id, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('slots/:id')
  removeSlot(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.timetable.removeSlot(user, id);
  }
}
