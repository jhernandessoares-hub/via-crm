import {
  BadRequestException,
  Body,
  Controller,
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

@UseGuards(JwtAuthGuard)
@Controller('secretary')
export class SecretaryController {
  constructor(private readonly service: SecretaryService) {}

  /** Envia mensagem de texto → resposta da IA + áudio TTS */
  @Post('message')
  sendMessage(
    @Req() req: any,
    @Body() body: { text: string; sessionId?: string },
  ) {
    if (!body?.text?.trim()) {
      throw new BadRequestException('O campo "text" é obrigatório.');
    }
    return this.service.sendMessage({
      tenantId: req.user.tenantId,
      userId: req.user.sub || req.user.id,
      sessionId: body.sessionId,
      text: body.text.trim(),
    });
  }

  /** Transcreve áudio via Whisper */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  transcribe(@UploadedFile() file?: any) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie o áudio no campo "audio".');
    }
    return this.service.transcribe(file);
  }

  /** Recebe arquivo, salva em disco e extrai texto (PDF/TXT) */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@Req() req: any, @UploadedFile() file?: any) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie o arquivo no campo "file".');
    }
    return this.service.upload(req.user.tenantId, file);
  }

  /** Histórico de uma sessão */
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
  @Get('sessions')
  getSessions(@Req() req: any) {
    return this.service.getSessions(
      req.user.tenantId,
      req.user.sub || req.user.id,
    );
  }
}
