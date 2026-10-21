import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { PreOcupacaoModule } from '../pre-ocupacao.module';
import { FamiliaAuthGuard } from './familia-auth.guard';
import { PortalAuthService } from './portal-auth.service';
import { PortalDemandasService } from './portal-demandas.service';
import { PortalConteudoService } from './portal-conteudo.service';
import { PortalController } from './portal.controller';
import { ConviteController } from './convite.controller';
import { ConviteService } from './convite.service';
import { QuestionarioPublicoController } from './questionario-publico.controller';
import { QuestionarioPublicoService } from './questionario-publico.service';

@Module({
  imports: [PrismaModule, PreOcupacaoModule, JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [PortalController, ConviteController, QuestionarioPublicoController],
  providers: [FamiliaAuthGuard, PortalAuthService, PortalDemandasService, PortalConteudoService, ConviteService, QuestionarioPublicoService],
})
export class PreOcupacaoPortalModule {}
