import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AiAgentMode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlanGuard, RequiresPlan } from '../auth/plan.guard';
import { AiAgentsService } from './ai-agents.service';

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

@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('PREMIUM')
@Controller('ai-agents')
export class AiAgentsController {
  constructor(private readonly aiAgentsService: AiAgentsService) {}

  @Post()
  create(@Body() body: CreateAiAgentBody) {
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
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateAiAgentBody,
  ) {
    return this.aiAgentsService.update(tenantId, id, body);
  }

  @Delete(':tenantId/:id')
  remove(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.aiAgentsService.remove(tenantId, id);
  }

  // ── KB linking ────────────────────────────────────────────────
  @Post(':tenantId/:id/kb/:kbId')
  linkKb(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('kbId') kbId: string,
  ) {
    return this.aiAgentsService.linkKb(tenantId, id, kbId);
  }

  @Delete(':tenantId/:id/kb/:kbId')
  unlinkKb(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('kbId') kbId: string,
  ) {
    return this.aiAgentsService.unlinkKb(tenantId, id, kbId);
  }

  // ── Tools ─────────────────────────────────────────────────────
  @Post(':tenantId/:id/tools')
  createTool(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: { name: string; label: string; description: string; webhookUrl?: string; webhookMethod?: string },
  ) {
    return this.aiAgentsService.createTool(tenantId, id, body);
  }

  @Patch(':tenantId/:id/tools/:toolId')
  updateTool(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('toolId') toolId: string,
    @Body() body: { label?: string; description?: string; webhookUrl?: string; webhookMethod?: string; active?: boolean },
  ) {
    return this.aiAgentsService.updateTool(tenantId, id, toolId, body);
  }

  @Delete(':tenantId/:id/tools/:toolId')
  deleteTool(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('toolId') toolId: string,
  ) {
    return this.aiAgentsService.deleteTool(tenantId, id, toolId);
  }
}
