import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Post()
  create(@Body() body: CreateKnowledgeBaseDto) {
    return this.service.create(body);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    return this.service.findAll(search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateKnowledgeBaseDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':knowledgeBaseId/agents/:agentId')
  attachToAgent(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.service.attachToAgent(agentId, knowledgeBaseId);
  }

  @Delete(':knowledgeBaseId/agents/:agentId')
  detachFromAgent(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.service.detachFromAgent(agentId, knowledgeBaseId);
  }
}