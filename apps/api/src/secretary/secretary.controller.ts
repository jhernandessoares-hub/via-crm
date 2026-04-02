import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SecretaryService } from './secretary.service';
import { WhatsappService } from './whatsapp.service';

@Controller('secretary')
export class SecretaryController {
  constructor(
    private readonly service: SecretaryService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // ── Rotas protegidas (JWT) ────────────────────────────────────────────

  /** Envia mensagem de texto → resposta da IA + áudio TTS */
  @UseGuards(JwtAuthGuard)
  @Post('message')
  sendMessage(
    @Req() req: any,
    @Body() body: { text: string; sessionId?: string; skipAudio?: boolean },
  ) {
    if (!body?.text?.trim()) {
      throw new BadRequestException('O campo "text" é obrigatório.');
    }
    return this.service.sendMessage({
      tenantId: req.user.tenantId,
      userId: req.user.sub || req.user.id,
      sessionId: body.sessionId,
      text: body.text.trim(),
      skipAudio: body.skipAudio,
    });
  }

  /** Transcreve áudio via Whisper */
  @UseGuards(JwtAuthGuard)
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  transcribe(@UploadedFile() file?: any) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie o áudio no campo "audio".');
    }
    return this.service.transcribe(file);
  }

  /** Recebe arquivo, salva em disco e extrai texto (PDF/TXT) */
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@Req() req: any, @UploadedFile() file?: any) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie o arquivo no campo "file".');
    }
    return this.service.upload(req.user.tenantId, file);
  }

  /** Histórico de uma sessão */
  @UseGuards(JwtAuthGuard)
  @Get('history')
  getHistory(
    @Req() req: any,
    @Query('sessionId') sessionId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getHistory({
      tenantId: req.user.tenantId,
      userId: req.user.sub || req.user.id,
      sessionId,
      limit: limit ? Number(limit) : 20,
    });
  }

  /** Lista todas as sessões do usuário */
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  getSessions(@Req() req: any) {
    return this.service.getSessions(
      req.user.tenantId,
      req.user.sub || req.user.id,
    );
  }

  /** Remove conversas com mais de 30 dias */
  @UseGuards(JwtAuthGuard)
  @Delete('cleanup')
  cleanup(@Req() req: any) {
    return this.service.cleanupOldConversations(
      req.user.tenantId,
      req.user.sub || req.user.id,
    );
  }

}
