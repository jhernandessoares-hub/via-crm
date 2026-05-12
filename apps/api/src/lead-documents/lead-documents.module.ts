import { Module } from '@nestjs/common';
import { LeadDocumentsService } from './lead-documents.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LeadDocumentsService],
  exports: [LeadDocumentsService],
})
export class LeadDocumentsModule {}
