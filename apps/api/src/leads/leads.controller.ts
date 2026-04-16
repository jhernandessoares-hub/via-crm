import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // =========================
  // ROTAS FIXAS (SEM :id)
  // =========================

  @Post()
  async create(
    @Req() req: any,
    @Body()
    body: {
      nome: string;
      telefone?: string;
      email?: string;
      origem?: string;
      observacao?: string;
    },
  ) {
    return this.leadsService.create(req.user.tenantId, body);
  }

  @Get('my')
  async getMyLeads(@Req() req: any) {
    return this.leadsService.getMyLeads(req.user);
  }

  @Get('branch')
  async getBranchLeads(
    @Req() req: any,
    @Query('branchId') branchId?: string,
  ) {
    if (req.user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.leadsService.getBranchLeads(req.user, branchId);
  }

  @Get('counts')
  async counts(@Req() req: any) {
    return this.leadsService.counts(req.user);
  }

  @Get()
  async list(@Req() req: any) {
    return this.leadsService.list(req.user);
  }

  @Get('export')
  async exportCsv(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('stageId') stageId?: string,
    @Res() res?: any,
  ) {
    const csv = await this.leadsService.exportCsv(req.user, { from, to, stageId });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  }

  // =========================
  // ROTAS COM :id
  // =========================

  /**
   * ✅ ETAPA 3 — JANELA 24H DO WHATSAPP
   * GET /leads/:id/window
   */
  @Get(':id/window')
  async getWhatsappWindow(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.getWhatsappWindow(req.user, id);
  }

  /**
   * ✅ PAINEL SLA — jobs agendados + histórico + janela restante
   * GET /leads/:id/sla
   */
  @Get(':id/sla')
  async getLeadSla(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.getLeadSla(req.user, id);
  }

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.getById(req.user, id);
  }

  @Get(':id/allowed-stage-transitions')
  async getAllowedStageTransitions(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.getAllowedStageTransitions(req.user, id);
  }

  /**
   * ✅ PADRÃO OFICIAL: SEMPRE retorna { value: [...], count: N }
   */
  @Get(':id/events')
  async listEvents(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const result: any = await this.leadsService.listEvents(req.user, id, {
      limit: limit !== undefined ? Number(limit) : undefined,
      skip: skip !== undefined ? Number(skip) : undefined,
    });

    if (Array.isArray(result)) {
      return { value: result, count: result.length };
    }

    const value = Array.isArray(result?.value)
      ? result.value
      : Array.isArray(result)
        ? result
        : [];

    const count = typeof result?.count === 'number' ? result.count : value.length;

    return { value, count };
  }

  @Post(':id/events')
  async createEvent(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      channel?: string;
      payloadRaw?: any;
    },
  ) {
    return this.leadsService.createEvent(req.user, id, body);
  }

  /**
   * ✅ ETAPA 2
   * PATCH /leads/:id/stage
   * body: { stageId: "uuid" }
   */
  @Patch(':id/qualification')
  async updateQualification(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      nomeCorreto?: string | null;
      rendaBrutaFamiliar?: number | null;
      fgts?: number | null;
      valorEntrada?: number | null;
      estadoCivil?: string | null;
      dataNascimento?: string | null;
      tempoProcurandoImovel?: string | null;
      conversouComCorretor?: boolean | null;
      qualCorretorImobiliaria?: string | null;
      perfilImovel?: string | null;
      produtoInteresseId?: string | null;
      resumoLead?: string | null;
    },
  ) {
    return this.leadsService.updateQualification(req.user.tenantId, id, body);
  }

  @Patch(':id/bot-paused')
  async updateBotPaused(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { botPaused: boolean },
  ) {
    return this.leadsService.updateBotPaused(req.user.tenantId, id, body.botPaused);
  }

  @Patch(':id/stage')
  async updateStage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { stageId: string },
  ) {
    if (!body?.stageId) {
      throw new BadRequestException('stageId é obrigatório');
    }

    return this.leadsService.updateStage(req.user, id, body.stageId);
  }

  /**
   * GET /leads/:id/events/:eventId/download
   */
  @Get(':id/events/:eventId/download')
  async downloadEventMedia(
    @Req() req: any,
    @Param('id') leadId: string,
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ) {
    const out = await this.leadsService.downloadEventMedia(req.user, leadId, eventId);

    res.setHeader('Content-Type', out.mimeType || 'application/octet-stream');

    const ct = String(out.mimeType || '').toLowerCase();
    const inline =
      ct.startsWith('image/') ||
      ct === 'application/pdf' ||
      ct.startsWith('video/') ||
      ct.startsWith('audio/');

    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${out.filename}"`,
    );

    if (typeof out.contentLength === 'number' && out.contentLength > 0) {
      res.setHeader('Content-Length', String(out.contentLength));
    }

    out.stream.pipe(res);
  }

  /**
   * POST /leads/:id/test-inbound
   */
  @Post(':id/test-inbound')
  async testInbound(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.createEvent(req.user, id, {
      channel: 'whatsapp.in',
      payloadRaw: {
        kind: 'test',
        source: 'test-inbound-endpoint',
        at: new Date().toISOString(),
      },
    });
  }

  /**
   * POST /leads/:id/sla/freeze?minutes=30
   */
  @Post(':id/sla/freeze')
  async freezeSla(
    @Req() req: any,
    @Param('id') id: string,
    @Query('minutes') minutes?: string,
  ) {
    return this.leadsService.freezeSla(req.user, id, minutes);
  }

  @Delete(':id')
  async deleteLead(
    @Req() req: any,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    return this.leadsService.deleteLead(req.user, id, reason);
  }

  @Post(':id/assign')
  async assignLead(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { assignedUserId: string },
  ) {
    return this.leadsService.assignLead(id, body.assignedUserId, req.user);
  }

  // 🚀 ENVIO REAL WHATSAPP (TEXTO)
  @Post(':id/send-whatsapp')
  async sendWhatsapp(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.leadsService.sendWhatsappMessage(req.user, id, body);
  }

  /**
   * 🎤 ENVIO REAL WHATSAPP (ÁUDIO)
   * POST /leads/:id/send-whatsapp-audio
   * multipart/form-data (field: file)
   */
  @Post(':id/send-whatsapp-audio')
  @UseInterceptors(FileInterceptor('file'))
  async sendWhatsappAudio(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado (field: file)');
    }

    if (!file.mimetype || !String(file.mimetype).toLowerCase().startsWith('audio/')) {
      throw new BadRequestException(
        `Arquivo enviado não parece áudio (mimetype=${file.mimetype || '—'})`,
      );
    }

    return this.leadsService.sendWhatsappAudioMessage(req.user, id, file);
  }

  /**
   * 📎 ENVIO REAL WHATSAPP (ANEXO: imagem/vídeo/documento)
   * POST /leads/:id/send-whatsapp-attachment
   * multipart/form-data (field: file)
   */
  @Post(':id/send-whatsapp-attachment')
  @UseInterceptors(FileInterceptor('file'))
  async sendWhatsappAttachment(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado (field: file)');
    }

    return this.leadsService.sendWhatsappAttachment(req.user, id, file);
  }

  // ─── Participantes do lead ───────────────────────────────────────────────────

  @Get(':id/participantes')
  async listParticipantes(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.listParticipantes(req.user.tenantId, id);
  }

  @Post(':id/participantes')
  async createParticipante(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { nome: string; classificacao?: string },
  ) {
    return this.leadsService.createParticipante(req.user.tenantId, id, body);
  }

  @Patch(':id/participantes/:partId')
  async updateParticipante(
    @Req() req: any,
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.leadsService.updateParticipante(req.user.tenantId, id, partId, body);
  }

  @Delete(':id/participantes/:partId')
  async deleteParticipante(
    @Req() req: any,
    @Param('id') id: string,
    @Param('partId') partId: string,
  ) {
    return this.leadsService.deleteParticipante(req.user.tenantId, id, partId);
  }

  // ─── Documentos do lead ──────────────────────────────────────────────────────

  // ─── Classificação bulk + AI cadastro ───────────────────────────────────────

  @Post(':id/documents/classify-bulk')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: 100 * 1024 * 1024, files: 20, fields: 30 } }))
  async classifyBulk(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFiles() files: any[],
  ) {
    if (!files || files.length === 0) throw new BadRequestException('Nenhum arquivo enviado');
    return this.leadsService.classifyBulkDocuments(req.user.tenantId, id, files, req.user.sub);
  }

  @Post(':id/ai-cadastro')
  async aiCadastro(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { participanteNome: string | null },
  ) {
    return this.leadsService.aiCadastroFill(req.user.tenantId, id, body.participanteNome ?? null);
  }

  @Patch(':id/documents/:docId')
  async updateDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: { tipo?: string; nome?: string; participanteNome?: string | null; observacao?: string | null; pendingReview?: boolean },
  ) {
    return this.leadsService.updateDocument(req.user.tenantId, id, docId, body);
  }

  @Get(':id/documents')
  async listDocuments(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.listDocuments(req.user.tenantId, id);
  }

  @Post(':id/documents')
  async createDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { tipo: string; nome: string; participanteNome?: string; participanteClassificacao?: string; observacao?: string },
  ) {
    return this.leadsService.createDocument(req.user.tenantId, id, body, req.user.sub);
  }

  @Post(':id/documents/toggle-na')
  async toggleNaoAplicavel(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { tipo: string; naoAplicavel: boolean; participanteNome?: string | null },
  ) {
    return this.leadsService.toggleNaoAplicavel(req.user.tenantId, id, body.tipo, body.naoAplicavel, body.participanteNome ?? null);
  }

  @Post(':id/documents/:docId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    return this.leadsService.uploadDocument(req.user.tenantId, id, docId, file);
  }

  @Get(':id/documents/:docId/view')
  async viewDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res() res: any,
  ) {
    const out = await this.leadsService.viewDocument(req.user.tenantId, id, docId);
    res.setHeader('Content-Type', out.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${out.filename}"`);
    if (out.contentLength) res.setHeader('Content-Length', String(out.contentLength));
    out.stream.pipe(res);
  }

  @Delete(':id/documents/:docId')
  async deleteDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.leadsService.deleteDocument(req.user.tenantId, id, docId);
  }
}
