// C:\Users\User\Documents\via-crm\apps\api\src\whatsapp\whatsapp.controller.ts

import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import type { Response } from 'express';

@Controller('webhooks/whatsapp')
export class WhatsAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  // ====== META VERIFY ======
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'via-crm-dev';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  // ====== WEBHOOK RECEIVE ======
  @Post()
  @HttpCode(200)
  async receive(@Req() req: any, @Res() res: Response) {
    // ACK imediato — Meta exige resposta em < 20s
    res.status(200).json({ ok: true });

    // Enfileira payload no BullMQ (durável, com retry automático)
    try {
      await this.queueService.enqueueWebhookPayload(req.body);
    } catch (e: any) {
      console.error('⚠️ Falha ao enfileirar webhook payload:', e?.message || e);
    }

    return;
  }
}
