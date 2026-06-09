import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessageTemplatesService } from './message-templates.service';
import { MessageTemplatesController } from './message-templates.controller';

@Module({
  imports: [PrismaModule],
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService],
  exports: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
