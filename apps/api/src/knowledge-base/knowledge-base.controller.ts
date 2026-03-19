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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

@UseGuards(JwtAuthGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Post()
  create(@Req() req: any, @Body() body: CreateKnowledgeBaseDto) {
    return this.service.create(req.user.tenantId, body);
  }

  @Get()
  findAll(@Req() req: any, @Query('search') search?: string) {
    return this.service.findAll(req.user.tenantId, search);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateKnowledgeBaseDto) {
    return this.service.update(req.user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, id);
  }

  @Post(':knowledgeBaseId/agents/:agentId')
  attachToAgent(
    @Req() req: any,
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.service.attachToAgent(req.user.tenantId, agentId, knowledgeBaseId);
  }

  @Delete(':knowledgeBaseId/agents/:agentId')
  detachFromAgent(
    @Req() req: any,
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.service.detachFromAgent(req.user.tenantId, agentId, knowledgeBaseId);
  }
}
