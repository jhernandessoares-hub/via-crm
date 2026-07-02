import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FinTxStatus } from '@prisma/client';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinConciliacaoService } from './conciliacao.service';
import { ConciliarDto, CriarLancamentoConciliacaoDto, ImportarExtratoDto } from './dto/conciliacao.dto';

const MAX_STATEMENT_SIZE = 5 * 1024 * 1024; // 5MB

// Extrato chega com mimetype imprevisível (application/octet-stream, text/plain…) —
// valida pela extensão do arquivo
const extratoFileFilter = (_req: any, file: any, cb: (e: Error | null, accept: boolean) => void) => {
  const ext = String(file.originalname || '').split('.').pop()?.toLowerCase();
  if (ext && ['ofx', 'csv', 'xls', 'xlsx'].includes(ext)) return cb(null, true);
  cb(new BadRequestException('Extensão não suportada — envie .ofx, .csv, .xls ou .xlsx'), false);
};

@Controller('admin/financeiro')
@UseGuards(PlatformAdminGuard)
export class FinConciliacaoController {
  constructor(private readonly service: FinConciliacaoService) {}

  @Post('conciliacao/importar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_STATEMENT_SIZE, files: 1, fields: 5 },
      fileFilter: extratoFileFilter,
    }),
  )
  importar(@UploadedFile() file: any, @Body() dto: ImportarExtratoDto, @Req() req: any) {
    return this.service.importar(dto.bankAccountId, file, req.platformAdmin?.sub);
  }

  @Get('conciliacao/importacoes')
  listImportacoes(@Query('bankAccountId') bankAccountId?: string) {
    return this.service.listImportacoes(bankAccountId);
  }

  @Get('conciliacao/transacoes')
  listTransacoes(
    @Query('bankAccountId') bankAccountId: string,
    @Query('status') status?: FinTxStatus,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ) {
    return this.service.listTransacoes({ bankAccountId, status, de, ate });
  }

  @Post('conciliacao/transacoes/:id/conciliar')
  conciliar(@Param('id') id: string, @Body() dto: ConciliarDto, @Req() req: any) {
    return this.service.conciliar(id, dto, req.platformAdmin?.sub);
  }

  @Post('conciliacao/transacoes/:id/criar-lancamento')
  criarLancamento(@Param('id') id: string, @Body() dto: CriarLancamentoConciliacaoDto, @Req() req: any) {
    return this.service.criarLancamento(id, dto, req.platformAdmin?.sub);
  }

  @Post('conciliacao/transacoes/:id/ignorar')
  ignorar(@Param('id') id: string) {
    return this.service.ignorar(id);
  }

  @Post('conciliacao/transacoes/:id/desfazer')
  desfazer(@Param('id') id: string, @Req() req: any) {
    return this.service.desfazer(id, req.platformAdmin?.sub);
  }
}
