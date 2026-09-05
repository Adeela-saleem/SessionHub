import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { SessionsModule } from './sessions/sessions.module';
import { QuizModule } from './quiz/quiz.module';
import { PollsModule } from './polls/polls.module';
import { QaModule } from './qa/qa.module';
import { AuditModule } from './audit/audit.module';
import { ContentModule } from './content/content.module';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { GradebookModule } from './gradebook/gradebook.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TimetableModule } from './timetable/timetable.module';
import { FilesModule } from './files/files.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: envValidationSchema }),
    ScheduleModule.forRoot(),
    // Blanket rate limit; the answer-submit route tightens it further.
    // THROTTLE_LIMIT exists so a local demo or test run can raise the
    // ceiling without touching the production default.
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: Number(process.env.THROTTLE_LIMIT) > 0 ? Number(process.env.THROTTLE_LIMIT) : 120,
    }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    SessionsModule,
    QuizModule,
    PollsModule,
    QaModule,
    AuditModule,
    ContentModule,
    AiModule,
    HealthModule,
    AnalyticsModule,
    RealtimeModule,
    AssignmentsModule,
    GradebookModule,
    AnnouncementsModule,
    NotificationsModule,
    TimetableModule,
    FilesModule,
  ],
  providers: [
    // Order matters: authenticate, then authorise, then rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
