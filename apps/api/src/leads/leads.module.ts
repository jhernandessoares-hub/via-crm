import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { WhatsappUnofficialModule } from '../whatsapp-unofficial/whatsapp-unofficial.module';

@Module({
  imports: [PrismaModule, PipelineModule, WhatsappUnofficialModule],
  providers: [LeadsService],
  controllers: [LeadsController],
  exports: [LeadsService],
})
export class LeadsModule {}
