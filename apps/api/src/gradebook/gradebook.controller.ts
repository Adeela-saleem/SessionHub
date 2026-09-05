import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { GradebookService } from './gradebook.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/gradebook.dto';

@ApiTags('gradebook')
@ApiBearerAuth()
@Controller()
export class GradebookController {
  constructor(private gradebook: GradebookService) {}

  @Get('courses/:courseId/grade-categories')
  listCategories(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.gradebook.listCategories(user, courseId);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('courses/:courseId/grade-categories')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateCategoryDto,
  ) { return this.gradebook.createCategory(user, courseId, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch('grade-categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) { return this.gradebook.updateCategory(user, id, dto); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete('grade-categories/:id')
  removeCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gradebook.removeCategory(user, id);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('courses/:courseId/gradebook')
  courseGradebook(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.gradebook.courseGradebook(user, courseId);
  }

  @Roles(Role.STUDENT)
  @Get('courses/:courseId/grades/me')
  myCourseGrades(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.gradebook.myCourseGrades(user, courseId);
  }

  @Roles(Role.STUDENT)
  @Get('me/grades')
  myGrades(@CurrentUser() user: AuthUser) {
    return this.gradebook.myGrades(user);
  }
}
