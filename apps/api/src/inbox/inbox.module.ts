import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappUnofficialModule } from '../whatsapp-unofficial/whatsapp-unofficial.module';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';

@Module({
  imports: [PrismaModule, WhatsappUnofficialModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
