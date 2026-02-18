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
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeadStatus } from '@prisma/client';
import { ManagerDecisionDto } from './dto/manager-decision.dto';

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

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.getById(req.user, id);
  }

  @Get(':id/events')
  async listEvents(@Req() req: any, @Param('id') id: string) {
    return this.leadsService.listEvents(req.user, id);
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

  // 🚀 ENVIO REAL WHATSAPP
  // Aceita: message | mensagem | text | body (service resolve)
  @Post(':id/send-whatsapp')
  async sendWhatsapp(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.leadsService.sendWhatsappMessage(req.user, id, body);
  }
}
