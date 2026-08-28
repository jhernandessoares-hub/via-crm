import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { TemplatesService } from './templates.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/templates')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  listar(@Request() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  criar(@Request() req: any, @UploadedFile() file: any, @Body('nome') nome?: string, @Body('corpo') corpo?: string) {
    return this.svc.criar(req.user.tenantId, { nome, corpo }, file);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  atualizar(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body('nome') nome?: string,
    @Body('corpo') corpo?: string,
    @Body('removerImagem') removerImagem?: string,
  ) {
    return this.svc.atualizar(
      req.user.tenantId,
      id,
      { nome, corpo, removerImagem: removerImagem === 'true' || removerImagem === '1' },
      file,
    );
  }

  @Delete(':id')
  excluir(@Request() req: any, @Param('id') id: string) {
    return this.svc.excluir(req.user.tenantId, id);
  }
}
