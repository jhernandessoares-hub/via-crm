import { Global, Module } from '@nestjs/common';
import { UsageService } from './usage.service';
import { LimitsService } from './limits.service';

@Global()
@Module({
  providers: [UsageService, LimitsService],
  exports: [UsageService, LimitsService],
})
export class PlansModule {}
