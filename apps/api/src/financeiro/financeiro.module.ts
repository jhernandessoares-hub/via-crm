import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinCadastrosController } from './cadastros.controller';
import { FinCadastrosService } from './cadastros.service';
import { FinLancamentosController } from './lancamentos.controller';
import { FinLancamentosService } from './lancamentos.service';
import { FinRecorrenciasController } from './recorrencias.controller';
import { FinRecorrenciasService } from './recorrencias.service';
import { FinDocumentosController } from './documentos.controller';
import { FinDocumentosService } from './documentos.service';
import { FinConciliacaoController } from './conciliacao.controller';
import { FinConciliacaoService } from './conciliacao.service';
import { FinRelatoriosController } from './relatorios.controller';
import { FinRelatoriosService } from './relatorios.service';

// Módulo Financeiro da VEXCIA (holding) — exclusivo do Platform Admin.
// Mesmo JWT do AdminModule (PLATFORM_ADMIN_JWT_SECRET) para o guard funcionar.
@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.PLATFORM_ADMIN_JWT_SECRET || process.env.JWT_SECRET,
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [
    FinCadastrosController,
    FinLancamentosController,
    FinRecorrenciasController,
    FinDocumentosController,
    FinConciliacaoController,
    FinRelatoriosController,
  ],
  providers: [
    PlatformAdminGuard,
    FinCadastrosService,
    FinLancamentosService,
    FinRecorrenciasService,
    FinDocumentosService,
    FinConciliacaoService,
    FinRelatoriosService,
  ],
})
export class FinanceiroModule {}
