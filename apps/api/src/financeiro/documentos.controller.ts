import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FinDocumentType } from '@prisma/client';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinDocumentosService, FIN_DOC_ALLOWED_MIMES } from './documentos.service';
import { GerarLancamentosDto, UpdateDocumentoDto, UploadDocumentoDto } from './dto/documentos.dto';

const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB — teto do Cloudinary Free

const finDocFileFilter = (_req: any, file: any, cb: (e: Error | null, accept: boolean) => void) => {
  if (FIN_DOC_ALLOWED_MIMES.includes(String(file.mimetype).toLowerCase())) return cb(null, true);
  cb(new BadRequestException(`Tipo não suportado: ${file.mimetype} (use PDF, JPG, PNG ou XML)`), false);
};

@Controller('admin/financeiro')
@UseGuards(PlatformAdminGuard)
export class FinDocumentosController {
  constructor(private readonly service: FinDocumentosService) {}

  @Post('documentos')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOC_SIZE, files: 1, fields: 10 },
      fileFilter: finDocFileFilter,
    }),
  )
  upload(@UploadedFile() file: any, @Body() dto: UploadDocumentoDto, @Req() req: any) {
    return this.service.upload(file, dto, req.platformAdmin?.sub);
  }

  @Get('documentos')
  list(
    @Query('tipo') tipo?: FinDocumentType,
    @Query('vinculado') vinculado?: string,
    @Query('busca') busca?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ) {
    return this.service.list({ tipo, vinculado, busca, de, ate });
  }

  @Get('documentos/:id/download')
  download(@Param('id') id: string) {
    return this.service.download(id);
  }

  @Post('documentos/:id/gerar-lancamentos')
  gerarLancamentos(@Param('id') id: string, @Body() dto: GerarLancamentosDto, @Req() req: any) {
    return this.service.gerarLancamentos(id, dto, req.platformAdmin?.sub);
  }

  @Patch('documentos/:id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentoDto) {
    return this.service.update(id, dto);
  }

  @Delete('documentos/:id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.service.delete(id, req.platformAdmin?.sub);
  }

  // Vínculo documento ↔ título existente
  @Post('lancamentos/:id/documentos/:docId')
  vincular(@Param('id') entryId: string, @Param('docId') docId: string) {
    return this.service.vincular(entryId, docId);
  }

  @Delete('lancamentos/:id/documentos/:docId')
  desvincular(@Param('id') entryId: string, @Param('docId') docId: string) {
    return this.service.desvincular(entryId, docId);
  }
}
