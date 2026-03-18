import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AiAgentMode } from '@prisma/client';
import { AiAgentsService } from './ai-agents.service';

type CreateAiAgentBody = {
  tenantId: string;
  title: string;
  slug: string;
  description?: string;
  objective?: string;
  prompt: string;
  exampleOutput?: string;
  mode?: AiAgentMode;
  audience?: string;
  active?: boolean;
  priority?: number;
  version?: number;
};

type UpdateAiAgentBody = {
  title?: string;
  slug?: string;
  description?: string | null;
  objective?: string | null;
  prompt?: string;
  exampleOutput?: string | null;
  mode?: AiAgentMode;
  audience?: string | null;
  active?: boolean;
  priority?: number;
  version?: number;
};

@Controller('ai-agents')
export class AiAgentsController {
  constructor(private readonly aiAgentsService: AiAgentsService) {}

  @Post()
  create(@Body() body: CreateAiAgentBody) {
    return this.aiAgentsService.create(body);
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
}