import { Module } from '@nestjs/common';
import { CreditRequestsService } from './credit-requests.service';
import { LeadCreditRequestsController, CorrespondentDemandsController } from './credit-requests.controller';
import { CorrespondentsModule } from '../correspondents/correspondents.module';

@Module({
  imports: [CorrespondentsModule],
  controllers: [LeadCreditRequestsController, CorrespondentDemandsController],
  providers: [CreditRequestsService],
})
export class CreditRequestsModule {}
