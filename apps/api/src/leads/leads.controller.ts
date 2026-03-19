import {
  Body,
  Controller,
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
  BadRequestException,
  Res,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeadStatus } from '@prisma/client';
import { ManagerDecisionDto } from './dto/manager-decision.dto';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Get('manager-queue')
  async getManagerQueue(@Req() req: any) {
    return this.leadsService.getManagerQueue(req.user);
  }

  @Get('my')
  async getMyLeads(@Req() req: any, @Query('status') status?: LeadStatus) {
    return this.leadsService.getMyLeads(req.user, status);
  }

  @Get('branch')
  async getBranchLeads(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('status') status?: LeadStatus,
  ) {
    if (req.user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.leadsService.getBranchLeads(req.user, branchId, status);
  }

  @Get()
  async list(@Req() req: any, @Query('status') status?: LeadStatus) {
    return this.leadsService.list(req.user.tenantId, status);
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

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: LeadStatus },
  ) {
    return this.leadsService.updateStatus(req.user.tenantId, id, body.status);
  }

  @Post(':id/assign')
  async assignLead(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { assignedUserId: string },
  ) {
    return this.leadsService.assignLead(id, body.assignedUserId, req.user);
  }

  @Post(':id/manager-decision')
  async managerDecision(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ManagerDecisionDto,
  ) {
    return this.leadsService.managerDecision(id, dto, req.user);
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
}