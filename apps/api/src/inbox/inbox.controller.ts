import {
  Controller, Get, Post, Param, Body, Req, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InboxService } from './inbox.service';

@UseGuards(JwtAuthGuard)
@Controller('inbox')
export class InboxController {
  constructor(private readonly service: InboxService) {}

  @Get()
  list(@Req() req: any, @Query('sessionId') sessionId?: string) {
    const { tenantId, sub: userId, role, branchId } = req.user;
    return this.service.listConversas(tenantId, userId, role, branchId ?? null, sessionId);
  }

  @Get(':leadId')
  messages(
    @Req() req: any,
    @Param('leadId') leadId: string,
    @Query('cursor') cursor?: string,
  ) {
    const { tenantId, sub: userId, role, branchId } = req.user;
    return this.service.getMensagens(tenantId, leadId, userId, role, branchId ?? null, cursor);
  }

  @Post(':leadId/send')
  send(
    @Req() req: any,
    @Param('leadId') leadId: string,
    @Body() body: { text: string },
  ) {
    if (!body?.text?.trim()) throw new BadRequestException('text é obrigatório');
    const { tenantId, sub: userId, role, branchId } = req.user;
    return this.service.enviar(tenantId, leadId, userId, role, branchId ?? null, body.text.trim());
  }

  @Post(':leadId/read')
  read(@Req() req: any, @Param('leadId') leadId: string) {
    const { tenantId, sub: userId, role, branchId } = req.user;
    return this.service.marcarLida(tenantId, leadId, userId, role, branchId ?? null);
  }
}
