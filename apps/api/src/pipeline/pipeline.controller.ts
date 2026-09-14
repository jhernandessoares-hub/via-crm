import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PipelineService } from './pipeline.service';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER.');
}

@UseGuards(JwtAuthGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  /**
   * GET /pipeline/active/stages
   */
  @Get('active/stages')
  async getActiveStages(@Req() req: any) {
    // retorna lista ordenada de stages ativas do pipeline ativo (VENDAS)
    return this.pipelineService.getActiveStages(req.user.tenantId);
  }

  /**
   * GET /pipeline/active/groups — Etapas do tenant (nome/cor/ordem) para exibição.
   * Todos os papéis, igual a /pipeline/active/stages.
   */
  @Get('active/groups')
  async getActiveGroups(@Req() req: any) {
    return this.pipelineService.getActiveGroups(req.user.tenantId);
  }

  /**
   * GET /pipeline/structure — Etapas (grupos) com os Status (stages) aninhados,
   * para a tela /settings/pipeline. OWNER only.
   */
  @Get('structure')
  async getStructure(@Req() req: any) {
    requireOwner(req);
    return this.pipelineService.getStructure(req.user.tenantId);
  }

  @Post('groups')
  async createGroup(@Req() req: any, @Body() body: { name: string; color?: string }) {
    requireOwner(req);
    return this.pipelineService.createGroup(req.user.tenantId, { name: body.name, color: body.color });
  }

  @Patch('groups/:id')
  async updateGroup(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; sortOrder?: number; color?: string | null },
  ) {
    requireOwner(req);
    if (body.name != null) await this.pipelineService.renameGroup(req.user.tenantId, id, body.name);
    if (body.sortOrder != null) await this.pipelineService.reorderGroup(req.user.tenantId, id, body.sortOrder);
    // `color: null` é intencional (limpa a cor), por isso undefined !== null aqui
    if (body.color !== undefined) await this.pipelineService.setGroupColor(req.user.tenantId, id, body.color);
    return { ok: true };
  }

  @Delete('groups/:id')
  async deleteGroup(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    await this.pipelineService.deleteGroup(req.user.tenantId, id);
    return { ok: true };
  }

  @Post('stages')
  async createStage(@Req() req: any, @Body() body: { name: string; groupId: string }) {
    requireOwner(req);
    return this.pipelineService.createStage(req.user.tenantId, body);
  }

  /**
   * Posição dos nós no canvas da aba "Fluxo". Tem que ficar ANTES de
   * `@Patch('stages/:id')` — o Nest resolve rota por ordem de declaração e
   * "positions" seria capturado como :id.
   */
  @Patch('stages/positions')
  async saveStagePositions(
    @Req() req: any,
    @Body() body: { positions: Array<{ stageId: string; posX: number; posY: number }> },
  ) {
    requireOwner(req);
    return this.pipelineService.saveStagePositions(req.user.tenantId, body?.positions ?? []);
  }

  @Patch('stages/:id/group')
  async assignStageToGroup(@Req() req: any, @Param('id') id: string, @Body() body: { groupId: string }) {
    requireOwner(req);
    return this.pipelineService.assignStageToGroup(req.user.tenantId, id, body.groupId);
  }

  @Patch('stages/:id')
  async updateStage(@Req() req: any, @Param('id') id: string, @Body() body: { name?: string; sortOrder?: number }) {
    requireOwner(req);
    if (body.name != null) await this.pipelineService.renameStage(req.user.tenantId, id, body.name);
    if (body.sortOrder != null) await this.pipelineService.reorderStage(req.user.tenantId, id, body.sortOrder);
    return { ok: true };
  }

  @Delete('stages/:id')
  async deactivateStage(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    await this.pipelineService.deactivateStage(req.user.tenantId, id);
    return { ok: true };
  }

  /**
   * Aba "Fluxo" — grafo de transições permitidas entre Status. Enquanto o
   * tenant não desenhar nenhuma linha própria, a movimentação de lead segue a
   * regra legada (ver DEFAULT_STAGE_TRANSITIONS / isCustomStage em leads.service.ts).
   */
  @Post('transitions')
  async createTransition(@Req() req: any, @Body() body: { fromStageId: string; toStageId: string }) {
    requireOwner(req);
    return this.pipelineService.createTransition(req.user.tenantId, body);
  }

  @Delete('transitions/:id')
  async deleteTransition(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    await this.pipelineService.deleteTransition(req.user.tenantId, id);
    return { ok: true };
  }
}
