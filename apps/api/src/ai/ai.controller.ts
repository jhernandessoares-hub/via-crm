import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';

type GenerateFollowUpBody = {
  nome: string;
  status: string;
  tenantId: string;
  agentId?: string;
  leadId?: string;
  mode?: 'REGENERATE' | 'SHORTEN' | 'IMPROVE' | 'VARIATE';
};

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-follow-up')
  generateFollowUp(@Body() body: GenerateFollowUpBody) {
    return this.aiService.generateFollowUp({
      nome: body.nome,
      status: body.status,
      tenantId: body.tenantId,
      agentId: body.agentId,
      leadId: body.leadId,
      mode: body.mode,
    });
  }
}