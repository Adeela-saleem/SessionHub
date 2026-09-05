import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateAssignmentDto, DraftDto, GradeDto, UpdateAssignmentDto } from './dto/assignments.dto';
import { MAX_FILE_BYTES } from '../files/files.service';

const upload = FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } });

@ApiTags('assignments')
@ApiBearerAuth()
@Controller()
export class AssignmentsController {
  constructor(private assignments: AssignmentsService) {}

  /* ── Reads ─────────────────────────────────────────────── */

  @Get('courses/:courseId/assignments')
  listForCourse(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.assignments.listForCourse(user, courseId);
  }

  @Roles(Role.STUDENT)
  @Get('me/assignments')
  myUpcoming(@CurrentUser() user: AuthUser) {
    return this.assignments.myUpcoming(user);
  }

  @Get('assignments/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.detail(user, id);
  }

  /* ── Authoring ─────────────────────────────────────────── */

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('courses/:courseId/assignments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateAssignmentDto,
  ) { return this.assignments.create(user, courseId, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('assignments/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) { return this.assignments.update(user, id, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('assignments/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.remove(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('assignments/:id/files')
  @UseInterceptors(upload)
  attachFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) { return this.assignments.attachFile(user, id, file); }

  /* ── Student flow ──────────────────────────────────────── */

  @Roles(Role.STUDENT)
  @Patch('assignments/:id/submission')
  saveDraft(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DraftDto,
  ) { return this.assignments.saveDraft(user, id, dto); }

  @Roles(Role.STUDENT)
  @Post('assignments/:id/submission/files')
  @UseInterceptors(upload)
  attachSubmissionFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) { return this.assignments.attachSubmissionFile(user, id, file); }

  @Roles(Role.STUDENT)
  @Post('assignments/:id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.submit(user, id);
  }

  /* ── Grading ───────────────────────────────────────────── */

  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('assignments/:id/submissions')
  listSubmissions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.listSubmissions(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('submissions/:id/grade')
  grade(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GradeDto,
  ) { return this.assignments.grade(user, id, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('submissions/:id/return')
  returnToStudent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.returnToStudent(user, id);
  }
}
