import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { PreOcupacaoModule } from '../pre-ocupacao.module';
import { FamiliaAuthGuard } from './familia-auth.guard';
import { PortalAuthService } from './portal-auth.service';
import { PortalDemandasService } from './portal-demandas.service';
import { PortalController } from './portal.controller';

@Module({
  imports: [PrismaModule, PreOcupacaoModule, JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [PortalController],
  providers: [FamiliaAuthGuard, PortalAuthService, PortalDemandasService],
})
export class PreOcupacaoPortalModule {}
