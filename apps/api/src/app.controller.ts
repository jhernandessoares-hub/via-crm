import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class AppController {

  // ✅ HEALTH CHECK
  @Get('health')
  health() {
    return { status: 'ok' };
  }

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

}
