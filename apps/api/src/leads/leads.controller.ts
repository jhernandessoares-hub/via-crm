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

// Tipos de arquivo aceitos para documentos do lead (espelha o accept do front e o que a IA consegue ler)
const LEAD_DOC_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const leadDocFileFilter = (_req: any, file: any, cb: (error: Error | null, accept: boolean) => void) => {
  if (LEAD_DOC_ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
  cb(new BadRequestException(`Tipo de arquivo não suportado: ${file.mimetype}. Aceitos: JPG, PNG, WEBP, PDF.`), false);
};

@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /**
   * Escrita no lead (editar/excluir): permitido se "Meus Leads" OU "Todos os Leads" conceder a
   * ação. OWNER tem bypass. Externo Consultivo (PARTNER) tem tudo false → sempre bloqueado.
   */
  private async assertLeadWrite(req: any, action: 'edit' | 'delete') {
    const { tenantId, role } = req.user;
    const ok =
      (await this.leadsService.hasPermission(tenantId, role, 'leads', action)) ||
      (await this.leadsService.hasPermission(tenantId, role, 'pipeline', action));
    if (!ok) throw new ForbiddenException('Sem permissão');
  }

  /** Verifica uma permissão específica (módulo/ação) e bloqueia se não tiver. */
  private async assertPerm(req: any, module: string, action: string, msg = 'Sem permissão') {
    if (!(await this.leadsService.hasPermission(req.user.tenantId, req.user.role, module, action))) {
      throw new ForbiddenException(msg);
    }
  }

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
    // "Meus Leads" (leads) e "Todos os Leads" (pipeline) têm CRUD próprios; criar é permitido
    // se qualquer um dos dois conceder (interpretação mais permissiva, sem contradição).
    const canCreate =
      (await this.leadsService.hasPermission(req.user.tenantId, req.user.role, 'leads', 'create')) ||
      (await this.leadsService.hasPermission(req.user.tenantId, req.user.role, 'pipeline', 'create'));
    if (!canCreate) {
      throw new ForbiddenException('Sem permissão para criar leads');
    }
    return this.leadsService.create(req.user.tenantId, body, req.user);
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

  @Get('dashboard/funil-status')
  async dashboardFunilStatus(
    @Req() req: any,
    @Query('groupKey') groupKey: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!(await this.leadsService.hasPermission(req.user.tenantId, req.user.role, 'dashboard', 'view'))) {
      throw new ForbiddenException('Sem permissão para ver o dashboard operacional');
    }
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const toDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return this.leadsService.dashboardFunilStatus(req.user, groupKey, fromDate, toDate);
  }

  @Get('dashboard/funil-leads')
  async dashboardFunilLeads(
    @Req() req: any,
    @Query('groupKey') groupKey: string,
    @Query('status') status: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!(await this.leadsService.hasPermission(req.user.tenantId, req.user.role, 'dashboard', 'view'))) {
      throw new ForbiddenException('Sem permissão para ver o dashboard operacional');
    }
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const toDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return this.leadsService.dashboardFunilLeads(req.user, groupKey, status, fromDate, toDate);
  }

  @Get('dashboard')
  async dashboard(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    if (!(await this.leadsService.hasPermission(req.user.tenantId, req.user.role, 'dashboard', 'view'))) {
      throw new ForbiddenException('Sem permissão para ver o dashboard operacional');
    }
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const toDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return this.leadsService.dashboard(req.user, fromDate, toDate);
  }

  @Get()
  async list(@Req() req: any) {
    return this.leadsService.list(req.user);
  }

  @Get('base-fria')
  async listBaseFria(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('produtoInteresseId') produtoInteresseId?: string,
  ) {
    await this.assertPerm(req, 'base_fria', 'view', 'Sem permissão para ver a Base Fria');
    return this.leadsService.listBaseFria(req.user, { q, produtoInteresseId });
  }

  @Get('duplicates')
  async findDuplicates(@Req() req: any) {
    return this.leadsService.findDuplicates(req.user);
  }

  @Get('search')
  async search(@Req() req: any, @Query('q') q?: string) {
    return this.leadsService.search(req.user, q ?? '');
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

  @Get('pending-reply')
  async getPendingReply(@Req() req: any) {
    return this.leadsService.getPendingReply(req.user);
  }

  @Get('interest-options')
  async interestOptions(@Req() req: any) {
    return this.leadsService.interestOptions(req.user);
  }

  // =========================
  // ROTAS COM :id
  // =========================

  @Post(':id/end-conversation')
  async endConversation(@Req() req: any, @Param('id') id: string) {
    await this.assertPerm(req, 'inbox', 'send', 'Sem permissão para encerrar conversa');
    const { tenantId } = req.user;
    return this.leadsService.endConversation(tenantId, id);
  }

  // Marca o lead como lido (ao abrir o detalhe) — limpa "Aguardando resposta" do sininho.
  @Post(':id/mark-read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.markRead(req.user.tenantId, id);
  }

  @Post(':id/merge')
  async mergeLeads(
    @Req() req: any,
    @Param('id') winnerId: string,
    @Body() body: { sourceLeadId: string; fieldChoices: any },
  ) {
    await this.assertPerm(req, 'duplicados', 'merge', 'Sem permissão para mesclar leads');
    return this.leadsService.mergeLeads(
      req.user.tenantId,
      winnerId,
      body.sourceLeadId,
      body.fieldChoices,
      { id: req.user.sub, nome: req.user.nome },
    );
  }

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
    await this.assertLeadWrite(req, 'edit');
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
      empreendimentoInteresseId?: string | null;
      resumoLead?: string | null;
      cpf?: string | null;
      rg?: string | null;
      profissao?: string | null;
      empresa?: string | null;
      naturalidade?: string | null;
      endereco?: string | null;
      cep?: string | null;
      cidade?: string | null;
      uf?: string | null;
      telefone?: string | null;
      email?: string | null;
      cadastroOrigem?: Record<string, string | null>;
    },
  ) {
    await this.assertLeadWrite(req, 'edit');
    // AGENT só pode editar qualificação de leads atribuídos a si mesmo
    if (req.user.role === 'AGENT') {
      const lead = await this.leadsService.getById(req.user, id);
      if (lead?.assignedUserId && lead.assignedUserId !== (req.user.id ?? req.user.sub)) {
        throw new ForbiddenException('Sem permissão para editar este lead');
      }
    }
    return this.leadsService.updateQualification(req.user.tenantId, id, body, req.user);
  }

  @Patch(':id/bot-paused')
  async updateBotPaused(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { botPaused: boolean },
  ) {
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.updateBotPaused(req.user.tenantId, id, body.botPaused);
  }

  @Patch(':id/stage')
  async updateStage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { stageId: string; evidenceDocumentId?: string; motivo?: string; valorVenda?: number | string; dataVenda?: string; baseFria?: any },
  ) {
    if (!body?.stageId) {
      throw new BadRequestException('stageId é obrigatório');
    }
    await this.assertLeadWrite(req, 'edit');

    return this.leadsService.updateStage(req.user, id, body.stageId, {
      evidenceDocumentId: body.evidenceDocumentId,
      motivo: body.motivo,
      valorVenda: body.valorVenda,
      dataVenda: body.dataVenda,
      baseFria: body.baseFria,
      ipAddress: req.ip,
    });
  }

  /** Lista evidências/justificativas registradas em transições de status do lead */
  @Get(':id/status-evidences')
  async listStatusEvidences(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.listStatusEvidences(req.user, id);
  }

  /** Histórico completo de movimentações de etapa/status do lead */
  @Get(':id/transitions')
  async listTransitions(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.listTransitions(req.user, id);
  }

  /** Campanhas (WhatsApp Light) das quais este lead participou */
  @Get(':id/campanhas')
  async listLeadCampanhas(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.listLeadCampanhas(req.user, id);
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
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.freezeSla(req.user, id, minutes);
  }

  @Delete(':id')
  async deleteLead(
    @Req() req: any,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    await this.assertLeadWrite(req, 'delete');
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
    await this.assertPerm(req, 'inbox', 'send', 'Sem permissão para enviar mensagens');
    return this.leadsService.sendWhatsappMessage(req.user, id, body);
  }

  @Patch(':id/canal')
  async updateCanal(@Req() req: any, @Param('id') id: string, @Body() body: { conversaCanal: string | null; conversaSessionId?: string | null }) {
    await this.assertPerm(req, 'inbox', 'send', 'Sem permissão para alterar o canal');
    return this.leadsService.updateCanal(req.user, id, body);
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
    await this.assertPerm(req, 'inbox', 'send', 'Sem permissão para enviar mensagens');

    return this.leadsService.sendWhatsappAudioMessage(req.user, id, file);
  }

  /**
   * 📎 ENVIO REAL WHATSAPP (ANEXO: imagem/vídeo/documento)
   * POST /leads/:id/send-whatsapp-attachment
   * multipart/form-data (field: file)
   */
  @Post(':id/send-whatsapp-attachment')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async sendWhatsappAttachment(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado (field: file)');
    }
    await this.assertPerm(req, 'inbox', 'send', 'Sem permissão para enviar mensagens');

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
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.createParticipante(req.user.tenantId, id, body);
  }

  @Patch(':id/participantes/:partId')
  async updateParticipante(
    @Req() req: any,
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Body() body: Record<string, any>,
  ) {
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.updateParticipante(req.user.tenantId, id, partId, body);
  }

  @Delete(':id/participantes/:partId')
  async deleteParticipante(
    @Req() req: any,
    @Param('id') id: string,
    @Param('partId') partId: string,
  ) {
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.deleteParticipante(req.user.tenantId, id, partId);
  }

  // ─── Pendências do lead ──────────────────────────────────────────────────────

  @Get(':id/pendencias')
  async listPendencias(@Req() req: any, @Param('id') id: string) {
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
    return this.leadsService.listPendencias(req.user.tenantId, id);
  }

  @Post(':id/pendencias')
  async createPendencia(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { descricao: string; origem?: string; tipoDocumento?: string | null; participanteNome?: string | null; participanteClassificacao?: string | null },
  ) {
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.createPendencia(req.user.tenantId, id, body, req.user.sub);
  }

  @Patch(':id/pendencias-observacao')
  async updatePendenciasObservacao(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { observacao: string | null },
  ) {
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.updatePendenciasObservacao(req.user.tenantId, id, body.observacao ?? null);
  }

  @Patch(':id/pendencias/:pendenciaId')
  async updatePendencia(
    @Req() req: any,
    @Param('id') id: string,
    @Param('pendenciaId') pendenciaId: string,
    @Body() body: { descricao?: string; resolvida?: boolean; participanteNome?: string | null; participanteClassificacao?: string | null },
  ) {
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.updatePendencia(req.user.tenantId, id, pendenciaId, body, req.user.sub);
  }

  @Delete(':id/pendencias/:pendenciaId')
  async deletePendencia(
    @Req() req: any,
    @Param('id') id: string,
    @Param('pendenciaId') pendenciaId: string,
  ) {
    await this.assertLeadWrite(req, 'edit');
    return this.leadsService.deletePendencia(req.user.tenantId, id, pendenciaId);
  }

  // ─── Documentos do lead ──────────────────────────────────────────────────────

  // ─── Classificação bulk + AI cadastro ───────────────────────────────────────

  @Post(':id/documents/classify-bulk')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: 100 * 1024 * 1024, files: 20, fields: 30 }, fileFilter: leadDocFileFilter }))
  async classifyBulk(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFiles() files: any[],
  ) {
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
    if (!files || files.length === 0) throw new BadRequestException('Nenhum arquivo enviado');
    return this.leadsService.classifyBulkDocuments(req.user.tenantId, id, files, req.user.sub);
  }

  @Post(':id/ai-cadastro')
  async aiCadastro(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { participanteNome: string | null },
  ) {
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
    return this.leadsService.aiCadastroFill(req.user.tenantId, id, body.participanteNome ?? null);
  }

  @Patch(':id/documents/:docId')
  async updateDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: { tipo?: string; nome?: string; participanteNome?: string | null; observacao?: string | null; pendingReview?: boolean },
  ) {
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
    return this.leadsService.updateDocument(req.user.tenantId, id, docId, body);
  }

  @Get(':id/documents')
  async listDocuments(@Req() req: any, @Param('id') id: string) {
    // Externo Consultivo sem acesso a documentos: lista vazia
    const acc = await this.leadsService.getPartnerDocumentAccess(req.user.tenantId, req.user.role);
    if (acc === 'none') return [];
    return this.leadsService.listDocuments(req.user.tenantId, id);
  }

  @Post(':id/documents')
  async createDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { tipo: string; nome: string; participanteNome?: string; participanteClassificacao?: string; observacao?: string },
  ) {
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
    return this.leadsService.createDocument(req.user.tenantId, id, body, req.user.sub);
  }

  @Post(':id/documents/toggle-na')
  async toggleNaoAplicavel(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { tipo: string; naoAplicavel: boolean; participanteNome?: string | null },
  ) {
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
    return this.leadsService.toggleNaoAplicavel(req.user.tenantId, id, body.tipo, body.naoAplicavel, body.participanteNome ?? null);
  }

  @Post(':id/documents/:docId/upload')
  @UseInterceptors(FileInterceptor('file', { fileFilter: leadDocFileFilter }))
  async uploadDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @UploadedFile() file?: any,
  ) {
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
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
    const acc = await this.leadsService.getPartnerDocumentAccess(req.user.tenantId, req.user.role);
    if (acc === 'none') throw new ForbiddenException('Sem permissão para visualizar documentos');
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
    if (req.user.role === 'PARTNER') throw new ForbiddenException('Sem permissão');
    return this.leadsService.deleteDocument(req.user.tenantId, id, docId);
  }
}
