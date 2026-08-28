import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsModule } from '../leads/leads.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AddonGuard } from '../auth/plan.guard';
import { FamiliasController } from './familias.controller';
import { FamiliasService } from './familias.service';
import { AtividadesController } from './atividades.controller';
import { AtividadesService } from './atividades.service';
import { EntregaveisController } from './entregaveis.controller';
import { EntregaveisService } from './entregaveis.service';
import { DemandasController } from './demandas.controller';
import { DemandasService } from './demandas.service';
import { ConteudoController } from './conteudo.controller';
import { ConteudoService } from './conteudo.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { AgendamentoConviteService } from './agendamento-convite.service';
import { AgendamentoConviteWorker } from './agendamento-convite.worker';

@Module({
  imports: [PrismaModule, LeadsModule, MessagingModule],
  controllers: [
    FamiliasController,
    AtividadesController,
    EntregaveisController,
    DemandasController,
    ConteudoController,
    TemplatesController,
  ],
  providers: [
    AddonGuard,
    FamiliasService,
    AtividadesService,
    EntregaveisService,
    DemandasService,
    ConteudoService,
    TemplatesService,
    AgendamentoConviteService,
    AgendamentoConviteWorker,
  ],
  exports: [FamiliasService, AtividadesService, EntregaveisService, DemandasService, ConteudoService],
})
export class PreOcupacaoModule {}
