import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

@Module({
  providers: [LeadsService],
  controllers: [LeadsController]
})
export class LeadsModule {}
