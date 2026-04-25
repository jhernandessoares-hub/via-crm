import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  imports: [ConfigModule, PrismaModule, EmailModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}

