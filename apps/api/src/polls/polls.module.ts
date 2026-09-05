import { Module } from '@nestjs/common';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [SessionsModule, RealtimeModule],
  providers: [PollsService],
  controllers: [PollsController],
})
export class PollsModule {}
