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
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';

const logger = new Logger('WhatsappController');
import { QueueService } from '../queue/queue.service';
import type { Response } from 'express';

@SkipThrottle()
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  // ====== META VERIFY ======
  @Get()
  async verify(@Req() req: any, @Res() res: Response) {
    const mode = (req.query['hub.mode'] || '').toString().trim();
    const token = (req.query['hub.verify_token'] || '').toString().trim();
    const challenge = (req.query['hub.challenge'] || '').toString().trim();

    logger.log(`Webhook verify — mode=${mode} token=${token}`);

    if (mode !== 'subscribe') return res.sendStatus(403);

    // Check env-level verify token
    const envToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
    if (envToken && token === envToken) return res.status(200).send(challenge);

    // Check per-tenant verify tokens stored in DB
    const tenant = await this.prisma.tenant.findFirst({
      where: { whatsappVerifyToken: token, ativo: true },
      select: { id: true },
    });
    if (tenant) return res.status(200).send(challenge);

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
      logger.error('Falha ao enfileirar webhook payload', { error: (e as any)?.message || String(e) });
    }

    return;
  }
}
