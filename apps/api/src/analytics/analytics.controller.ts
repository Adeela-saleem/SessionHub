import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  /** Scoped to the caller — a student can only ever read their own figures. */
  @Roles(Role.STUDENT)
  @Get('me')
  me(@CurrentUser() user: AuthUser) { return this.analytics.forStudent(user); }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher')
  teacher(@CurrentUser() user: AuthUser) { return this.analytics.forTeacher(user); }

  @Roles(Role.ADMIN)
  @Get('admin')
  admin() { return this.analytics.forAdmin(); }
}
