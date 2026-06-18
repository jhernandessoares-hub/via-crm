import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { SecretaryModule } from '../secretary/secretary.module';
import { WhatsappUnofficialService } from './whatsapp-unofficial.service';
import { WhatsappUnofficialController } from './whatsapp-unofficial.controller';

@Module({
  imports: [PrismaModule, QueueModule, SecretaryModule],
  controllers: [WhatsappUnofficialController],
  providers: [WhatsappUnofficialService],
  exports: [WhatsappUnofficialService],
})
export class WhatsappUnofficialModule {}
