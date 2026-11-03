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
import { AtendimentosController } from './atendimentos.controller';
import { AtendimentosService } from './atendimentos.service';
import { QuestionariosController } from './questionarios.controller';
import { QuestionariosService } from './questionarios.service';
import { QuestionarioEnvioService } from './questionario-envio.service';
import { QuestionarioEnvioWorker } from './questionario-envio.worker';
import { AssembleiasController } from './assembleias.controller';
import { AssembleiasService } from './assembleias.service';
import { AssembleiaConvocacaoService } from './assembleia-convocacao.service';
import { AssembleiaConvocacaoWorker } from './assembleia-convocacao.worker';

@Module({
  imports: [PrismaModule, LeadsModule, MessagingModule],
  controllers: [
    FamiliasController,
    AtividadesController,
    EntregaveisController,
    DemandasController,
    ConteudoController,
    TemplatesController,
    AtendimentosController,
    QuestionariosController,
    AssembleiasController,
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
    AtendimentosService,
    QuestionariosService,
    QuestionarioEnvioService,
    QuestionarioEnvioWorker,
    AssembleiasService,
    AssembleiaConvocacaoService,
    AssembleiaConvocacaoWorker,
  ],
  exports: [FamiliasService, AtividadesService, EntregaveisService, DemandasService, ConteudoService, QuestionarioEnvioService, AssembleiasService],
})
export class PreOcupacaoModule {}
