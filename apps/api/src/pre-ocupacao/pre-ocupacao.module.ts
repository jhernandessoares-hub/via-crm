import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
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

@Module({
  imports: [PrismaModule],
  controllers: [FamiliasController, AtividadesController, EntregaveisController, DemandasController, ConteudoController],
  providers: [AddonGuard, FamiliasService, AtividadesService, EntregaveisService, DemandasService, ConteudoService],
  exports: [FamiliasService, AtividadesService, EntregaveisService, DemandasService, ConteudoService],
})
export class PreOcupacaoModule {}
