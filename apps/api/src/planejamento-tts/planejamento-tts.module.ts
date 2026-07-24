import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AddonGuard } from '../auth/plan.guard';
import { PlanejamentoTtsController } from './planejamento-tts.controller';
import { PlanejamentoTtsService } from './planejamento-tts.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlanejamentoTtsController],
  providers: [AddonGuard, PlanejamentoTtsService],
  exports: [PlanejamentoTtsService],
})
export class PlanejamentoTtsModule {}
