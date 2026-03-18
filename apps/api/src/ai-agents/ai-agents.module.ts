import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAgentsService } from './ai-agents.service';
import { AiAgentsController } from './ai-agents.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AiAgentsController],
  providers: [AiAgentsService],
  exports: [AiAgentsService],
})
export class AiAgentsModule {}