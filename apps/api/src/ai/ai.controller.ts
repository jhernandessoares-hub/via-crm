import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type GenerateFollowUpBody = {
  nome: string;
  status: string;
  tenantId: string;
  agentId?: string;
  leadId?: string;
  lastLeadMessage?: string;
  previousSuggestion?: string;
  conversationContext?: string;
  mode?: 'REGENERATE' | 'SHORTEN' | 'IMPROVE' | 'VARIATE';
};

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-follow-up')
  generateFollowUp(@Body() body: GenerateFollowUpBody, @Req() req: any) {
    if (body.tenantId && body.tenantId !== req.user.tenantId) {
      throw new ForbiddenException('Acesso negado a este tenant');
    }
    return this.aiService.generateFollowUp({
      nome: body.nome,
      status: body.status,
      tenantId: req.user.tenantId,
      agentId: body.agentId,
      leadId: body.leadId,
      lastLeadMessage: body.lastLeadMessage,
      previousSuggestion: body.previousSuggestion,
      conversationContext: body.conversationContext,
      mode: body.mode,
    });
  }
}