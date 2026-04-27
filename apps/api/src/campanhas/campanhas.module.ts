import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { WhatsappUnofficialModule } from '../whatsapp-unofficial/whatsapp-unofficial.module';
import { CampanhasService } from './campanhas.service';
import { CampanhasController } from './campanhas.controller';

@Module({
  imports: [PrismaModule, QueueModule, WhatsappUnofficialModule],
  controllers: [CampanhasController],
  providers: [CampanhasService],
  exports: [CampanhasService],
})
export class CampanhasModule {}
