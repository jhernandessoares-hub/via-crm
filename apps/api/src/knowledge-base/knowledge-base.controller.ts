import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { CreateTeachingDto } from './dto/create-teaching.dto';
import { ReplaceTeachingDto } from './dto/replace-teaching.dto';

@UseGuards(JwtAuthGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly service: KnowledgeBaseService) {}

  // =====================
  // CRUD principal
  // =====================

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

  @Post(':id/summarize')
  summarize(@Req() req: any, @Param('id') id: string) {
    return this.service.summarize(req.user.tenantId, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, id);
  }

  // =====================
  // DOCUMENTOS (PDF)
  // =====================

  @Get(':id/documents')
  listDocuments(@Req() req: any, @Param('id') id: string) {
    return this.service.listDocuments(req.user.tenantId, id);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: any,
    @Body('title') title?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie um arquivo PDF no campo "file".');
    }

    const doc = await this.service.addDocument(req.user.tenantId, id, file, title);
    return { ok: true, document: doc };
  }

  @Delete(':id/documents/:documentId')
  deleteDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.service.deleteDocument(req.user.tenantId, id, documentId);
  }

  // =====================
  // VÍDEOS
  // =====================

  @Post(':id/videos')
  addVideo(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { url: string; title?: string; description?: string },
  ) {
    return this.service.addVideo(req.user.tenantId, id, body);
  }

  @Patch(':id/videos/:videoId')
  updateVideo(
    @Req() req: any,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Body() body: { url?: string; title?: string | null; description?: string | null },
  ) {
    return this.service.updateVideo(req.user.tenantId, id, videoId, body);
  }

  @Delete(':id/videos/:videoId')
  deleteVideo(
    @Req() req: any,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
  ) {
    return this.service.deleteVideo(req.user.tenantId, id, videoId);
  }

  // =====================
  // LINKS
  // =====================

  @Post(':id/links')
  addLink(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { url: string; title?: string; description?: string },
  ) {
    return this.service.addLink(req.user.tenantId, id, body);
  }

  @Patch(':id/links/:linkId')
  updateLink(
    @Req() req: any,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Body() body: { url?: string; title?: string | null; description?: string | null },
  ) {
    return this.service.updateLink(req.user.tenantId, id, linkId, body);
  }

  @Delete(':id/links/:linkId')
  deleteLink(
    @Req() req: any,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.deleteLink(req.user.tenantId, id, linkId);
  }

  // =====================
  // AGENT
  // =====================

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

  // =====================
  // TEACHINGS
  // =====================

  @Post(':id/teachings/generate-title')
  generateTeachingTitle(
    @Body() body: { leadMessage?: string; approvedResponse?: string },
  ) {
    return this.service.generateTeachingTitleEndpoint(body.leadMessage, body.approvedResponse);
  }

  @Get(':id/teachings')
  listTeachings(@Req() req: any, @Param('id') id: string) {
    return this.service.listTeachings(req.user.tenantId, id);
  }

  @Post(':id/teachings')
  addTeaching(@Req() req: any, @Param('id') id: string, @Body() body: CreateTeachingDto) {
    const createdBy = req.user.nome || req.user.email || req.user.sub || 'sistema';
    return this.service.addTeaching(req.user.tenantId, id, body, createdBy);
  }

  @Put(':id/teachings/:teachingId')
  replaceTeaching(
    @Req() req: any,
    @Param('id') id: string,
    @Param('teachingId') teachingId: string,
    @Body() body: ReplaceTeachingDto,
  ) {
    const replacedBy = req.user.nome || req.user.email || req.user.sub || 'sistema';
    return this.service.replaceTeaching(req.user.tenantId, id, teachingId, body, replacedBy);
  }

  @Delete(':id/teachings/:teachingId')
  deleteTeaching(
    @Req() req: any,
    @Param('id') id: string,
    @Param('teachingId') teachingId: string,
  ) {
    return this.service.deleteTeaching(req.user.tenantId, id, teachingId);
  }
}
