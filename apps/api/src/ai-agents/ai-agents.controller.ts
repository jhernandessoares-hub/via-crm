import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AiAgentMode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiAgentsService } from './ai-agents.service';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER do tenant.');
}

type CreateAiAgentBody = {
  tenantId: string;
  title: string;
  slug: string;
  description?: string;
  objective?: string;
  prompt: string;
  exampleOutput?: string;
  agentType?: string;
  mode?: AiAgentMode;
  audience?: string;
  permissions?: string[];
  active?: boolean;
  model?: string | null;
  temperature?: number | null;
  version?: number;
  isOrchestrator?: boolean;
  parentAgentId?: string | null;
  routingKeywords?: string[];
};

type UpdateAiAgentBody = {
  title?: string;
  slug?: string;
  description?: string | null;
  objective?: string | null;
  prompt?: string;
  exampleOutput?: string | null;
  agentType?: string;
  mode?: AiAgentMode;
  audience?: string | null;
  permissions?: string[];
  active?: boolean;
  model?: string | null;
  temperature?: number | null;
  version?: number;
  isOrchestrator?: boolean;
  parentAgentId?: string | null;
  routingKeywords?: string[];
};

@UseGuards(JwtAuthGuard)
@Controller('ai-agents')
export class AiAgentsController {
  constructor(private readonly aiAgentsService: AiAgentsService) {}

  @Post()
  create(@Req() req: any, @Body() body: CreateAiAgentBody) {
    requireOwner(req);
    return this.aiAgentsService.create(body);
  }

  @Get('hierarchy')
  hierarchy(@Req() req: any) {
    return this.aiAgentsService.findHierarchy(req.user.tenantId);
  }

  @Get('kbs')
  listKbs(@Req() req: any) {
    return this.aiAgentsService.listKbs(req.user.tenantId);
  }

  @Get(':tenantId')
  findAll(@Param('tenantId') tenantId: string) {
    return this.aiAgentsService.findAll(tenantId);
  }

  @Get(':tenantId/:id')
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.aiAgentsService.findOne(tenantId, id);
  }

  @Patch(':tenantId/:id')
  update(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateAiAgentBody,
  ) {
    requireOwner(req);
    return this.aiAgentsService.update(tenantId, id, body);
  }

  @Delete(':tenantId/:id')
  remove(@Req() req: any, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    requireOwner(req);
    return this.aiAgentsService.remove(tenantId, id);
  }

  // ── KB linking ────────────────────────────────────────────────
  @Post(':tenantId/:id/kb/:kbId')
  linkKb(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('kbId') kbId: string,
  ) {
    requireOwner(req);
    return this.aiAgentsService.linkKb(tenantId, id, kbId);
  }

  @Delete(':tenantId/:id/kb/:kbId')
  unlinkKb(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('kbId') kbId: string,
  ) {
    requireOwner(req);
    return this.aiAgentsService.unlinkKb(tenantId, id, kbId);
  }

  // ── Tools ─────────────────────────────────────────────────────
  @Post(':tenantId/:id/tools')
  createTool(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: { name: string; label: string; description: string; webhookUrl?: string; webhookMethod?: string },
  ) {
    requireOwner(req);
    return this.aiAgentsService.createTool(tenantId, id, body);
  }

  @Patch(':tenantId/:id/tools/:toolId')
  updateTool(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('toolId') toolId: string,
    @Body() body: { label?: string; description?: string; webhookUrl?: string; webhookMethod?: string; active?: boolean },
  ) {
    requireOwner(req);
    return this.aiAgentsService.updateTool(tenantId, id, toolId, body);
  }

  @Delete(':tenantId/:id/tools/:toolId')
  deleteTool(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('toolId') toolId: string,
  ) {
    requireOwner(req);
    return this.aiAgentsService.deleteTool(tenantId, id, toolId);
  }
}
