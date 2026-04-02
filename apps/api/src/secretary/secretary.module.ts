import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarModule } from '../calendar/calendar.module';
import { SecretaryService } from './secretary.service';
import { SecretaryController } from './secretary.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [PrismaModule, CalendarModule],
  controllers: [SecretaryController],
  providers: [SecretaryService, WhatsappService],
  exports: [SecretaryService, WhatsappService],
})
export class SecretaryModule {}
