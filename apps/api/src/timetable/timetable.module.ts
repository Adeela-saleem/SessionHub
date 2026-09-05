import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

@Module({
  imports: [AuditModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
