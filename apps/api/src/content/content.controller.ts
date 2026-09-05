import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ContentService } from './content.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateLessonDto, CreateModuleDto, CreateResourceDto,
  ProgressDto, ReorderDto, UpdateLessonDto, UpdateModuleDto,
} from './dto/content.dto';

@ApiTags('content')
@ApiBearerAuth()
@Controller()
export class ContentController {
  constructor(private content: ContentService) {}

  /* ── Reads (role-scoped inside the service) ────────────── */

  @Get('courses/:courseId/outline')
  outline(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.content.outline(user, courseId);
  }

  @Get('lessons/:id')
  lesson(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.lesson(user, id);
  }

  @Roles(Role.STUDENT)
  @Get('me/continue')
  continueLearning(@CurrentUser() user: AuthUser, @Query('take') take?: number) {
    return this.content.continueLearning(user, Math.min(Number(take) || 5, 20));
  }

  /* ── Authoring ─────────────────────────────────────────── */

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('courses/:courseId/modules')
  createModule(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateModuleDto,
  ) { return this.content.createModule(user, courseId, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('modules/:id')
  updateModule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateModuleDto,
  ) { return this.content.updateModule(user, id, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('modules/:id')
  deleteModule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.deleteModule(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('courses/:courseId/modules/reorder')
  reorderModules(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReorderDto,
  ) { return this.content.reorderModules(user, courseId, dto.ids); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('modules/:moduleId/lessons')
  createLesson(
    @CurrentUser() user: AuthUser,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: CreateLessonDto,
  ) { return this.content.createLesson(user, moduleId, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('lessons/:id')
  updateLesson(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonDto,
  ) { return this.content.updateLesson(user, id, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('lessons/:id')
  deleteLesson(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.deleteLesson(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('modules/:moduleId/lessons/reorder')
  reorderLessons(
    @CurrentUser() user: AuthUser,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: ReorderDto,
  ) { return this.content.reorderLessons(user, moduleId, dto.ids); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('lessons/:lessonId/resources')
  addResource(
    @CurrentUser() user: AuthUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: CreateResourceDto,
  ) { return this.content.addResource(user, lessonId, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('resources/:id')
  deleteResource(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.deleteResource(user, id);
  }

  /* ── Progress ──────────────────────────────────────────── */

  @Roles(Role.STUDENT)
  @Patch('lessons/:id/progress')
  saveProgress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProgressDto,
  ) { return this.content.saveProgress(user, id, dto); }
}
