import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { CloudinaryService } from '../products/cloudinary.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [KnowledgeBaseService, CloudinaryService],
  controllers: [KnowledgeBaseController],
})
export class KnowledgeBaseModule {}
