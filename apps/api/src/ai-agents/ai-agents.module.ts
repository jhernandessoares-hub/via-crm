import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAgentsService } from './ai-agents.service';
import { AiAgentsController } from './ai-agents.controller';
import { PlanGuard } from '../auth/plan.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AiAgentsController],
  providers: [AiAgentsService, PlanGuard],
  exports: [AiAgentsService],
})
export class AiAgentsModule {}