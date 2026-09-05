import { Module } from '@nestjs/common';
import { QaService } from './qa.service';
import { QaController } from './qa.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [SessionsModule, RealtimeModule],
  providers: [QaService],
  controllers: [QaController],
})
export class QaModule {}
