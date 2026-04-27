import {
  Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappUnofficialService } from './whatsapp-unofficial.service';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER.');
}

@UseGuards(JwtAuthGuard)
@Controller('inbox-wa-light')
export class WhatsappUnofficialController {
  constructor(
    private readonly service: WhatsappUnofficialService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Req() req: any) {
    return this.service.listSessions(req.user.tenantId);
  }

  @Post()
  create(@Req() req: any, @Body() body: { nome: string }) {
    requireOwner(req);
    if (!body?.nome?.trim()) throw new BadRequestException('nome é obrigatório');
    return this.service.createSession(req.user.tenantId, body.nome.trim());
  }

  @Patch(':id')
  async rename(@Req() req: any, @Param('id') id: string, @Body() body: { nome: string }) {
    requireOwner(req);
    await this.assertOwnership(id, req.user.tenantId);
    if (!body?.nome?.trim()) throw new BadRequestException('nome é obrigatório');
    return this.prisma.whatsappUnofficialSession.update({
      where: { id },
      data: { nome: body.nome.trim() },
      select: { id: true, nome: true },
    });
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    await this.assertOwnership(id, req.user.tenantId);
    // Impede exclusão se há disparo ativo
    const activeDisparo = await this.prisma.campanhaDisparo.findFirst({
      where: { sessionId: id, status: { in: ['RODANDO', 'PAUSADA'] } },
      select: { id: true },
    });
    if (activeDisparo) throw new BadRequestException('Não é possível excluir um inbox com disparo ativo');
    await this.service.deleteSession(id);
    return { ok: true };
  }

  @Post(':id/connect')
  async connect(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    await this.assertOwnership(id, req.user.tenantId);
    await this.service.connect(id);
    return { ok: true };
  }

  @Post(':id/disconnect')
  async disconnect(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    await this.assertOwnership(id, req.user.tenantId);
    await this.service.disconnect(id);
    return { ok: true };
  }

  @Get(':id/status')
  async status(@Req() req: any, @Param('id') id: string) {
    await this.assertOwnership(id, req.user.tenantId);
    return this.service.getStatus(id);
  }

  @Post(':id/send-text')
  async sendText(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { to: string; text: string },
  ) {
    await this.assertOwnership(id, req.user.tenantId);
    if (!body?.to || !body?.text) throw new BadRequestException('to e text são obrigatórios');
    await this.service.sendText(id, body.to, body.text);
    return { ok: true };
  }

  private async assertOwnership(sessionId: string, tenantId: string) {
    const session = await this.prisma.whatsappUnofficialSession.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true },
    });
    if (!session) throw new BadRequestException('Sessão não encontrada');
  }
}
