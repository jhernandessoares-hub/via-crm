import { Module } from '@nestjs/common';
import { DevelopmentsController } from './developments.controller';
import { DevelopmentsService } from './developments.service';
import { AddonGuard } from '../auth/plan.guard';

@Module({
  controllers: [DevelopmentsController],
  providers: [DevelopmentsService, AddonGuard],
  exports: [DevelopmentsService],
})
export class DevelopmentsModule {}
