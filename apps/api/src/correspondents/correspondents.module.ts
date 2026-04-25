import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CorrespondentsService } from './correspondents.service';
import {
  AdminCorrespondentsController,
  CorrespondentAuthController,
  TenantCorrespondentsController,
} from './correspondents.controller';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [AdminCorrespondentsController, CorrespondentAuthController, TenantCorrespondentsController],
  providers: [CorrespondentsService],
  exports: [CorrespondentsService, JwtModule],
})
export class CorrespondentsModule {}
