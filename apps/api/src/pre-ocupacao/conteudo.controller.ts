import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { ConteudoService } from './conteudo.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/conteudo')
export class ConteudoController {
  constructor(private readonly svc: ConteudoService) {}

  @Get()
  listar(@Request() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  criar(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body('titulo') titulo: string,
    @Body('descricao') descricao?: string,
  ) {
    const quem = req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.criar(req.user.tenantId, quem, file, titulo, descricao);
  }

  @Patch(':id/visibilidade')
  alternarVisibilidade(@Request() req: any, @Param('id') id: string) {
    return this.svc.alternarVisibilidade(req.user.tenantId, id);
  }

  @Delete(':id')
  excluir(@Request() req: any, @Param('id') id: string) {
    return this.svc.excluir(req.user.tenantId, id);
  }
}
