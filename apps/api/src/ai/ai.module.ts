import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { PaperService } from './paper.service';
import { QuizLibraryService } from './quiz-library.service';
import { AiController } from './ai.controller';

@Module({ providers: [AiService, PaperService, QuizLibraryService], controllers: [AiController] })
export class AiModule {}
