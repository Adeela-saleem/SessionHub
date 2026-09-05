import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CoursesService } from './courses.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

class CreateCourseDto {
  @IsString() @MaxLength(20) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @IsUUID() teacherId?: string;
}
class UpdateCourseDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @IsUUID() teacherId?: string;
}
class EnrollDto { @IsEmail() email!: string; }

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(private courses: CoursesService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) { return this.courses.findForUser(user); }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCourseDto) { return this.courses.create(dto); }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.courses.remove(id); }

  @Get(':id/roster')
  @Roles(Role.TEACHER, Role.ADMIN)
  roster(@Param('id', ParseUUIDPipe) id: string) { return this.courses.roster(id); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post(':id/enroll')
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollDto) {
    return this.courses.enroll(id, dto.email);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':id/enroll/:studentId')
  unenroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) { return this.courses.unenroll(id, studentId); }
}
