import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [SessionsModule, RealtimeModule],
  providers: [QuizService],
  controllers: [QuizController],
})
export class QuizModule {}
