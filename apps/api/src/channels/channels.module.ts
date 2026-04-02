import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SecretaryModule } from '../secretary/secretary.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { ChannelsWebhookController } from './channels-webhook.controller';

@Module({
  imports: [PrismaModule, SecretaryModule, PipelineModule],
  controllers: [ChannelsController, ChannelsWebhookController],
  providers: [ChannelsService],
})
export class ChannelsModule {}
