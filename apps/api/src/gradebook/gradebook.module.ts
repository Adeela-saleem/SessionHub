import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GradebookController } from './gradebook.controller';
import { GradebookService } from './gradebook.service';

@Module({
  imports: [AuditModule],
  controllers: [GradebookController],
  providers: [GradebookService],
})
export class GradebookModule {}
