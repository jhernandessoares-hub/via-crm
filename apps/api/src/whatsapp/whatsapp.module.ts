import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';

import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppActionsController } from './whatsapp.actions.controller';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [WhatsAppController, WhatsAppActionsController],
})
export class WhatsAppModule {}