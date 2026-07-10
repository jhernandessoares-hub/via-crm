import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { QueueService } from './queue/queue.service';
import { APP_VERSION, CHANGELOG } from './version/version.data';

@Controller()
export class AppController {
  constructor(private readonly queueService: QueueService) {}

  // ✅ HEALTH CHECK
  @Get('health')
  async health() {
    const redis = await this.queueService.redisHealthCheck();
    const status = redis.ok ? 'ok' : 'degraded';
    return {
      status,
      version: APP_VERSION,
      redis,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('version')
  getVersion() {
    return {
      version: APP_VERSION,
      commitSha: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || null,
      branch: process.env.RAILWAY_GIT_BRANCH || null,
      changelog: CHANGELOG,
    };
  }

  @Get('privacy-policy')
  getPrivacy(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <html>
        <head>
          <title>Política de Privacidade - VIA CRM</title>
          <meta charset="UTF-8" />
        </head>
        <body style="font-family: Arial; max-width: 800px; margin: 40px auto; line-height: 1.6;">
          <h1>Política de Privacidade – VIA CRM</h1>
          <p><strong>Última atualização:</strong> 16/02/2026</p>
        </body>
      </html>
    `);
  }

}
