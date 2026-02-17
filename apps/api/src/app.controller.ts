import { Controller, Get, Delete, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('privacy-policy')
  getPrivacy(@Res() res: Response) {
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

  // 🔥 ENDPOINT TEMPORÁRIO PARA LIMPAR TUDO
  @Delete('dev/clear-all')
  async clearAll() {
    await this.prisma.leadEvent.deleteMany({});
    await this.prisma.lead.deleteMany({});

    return { ok: true };
  }
}
