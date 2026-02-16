import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class AppController {
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

          <h2>1. Informações Coletadas</h2>
          <p>Podemos coletar nome, telefone, mensagens enviadas via WhatsApp e dados fornecidos voluntariamente durante atendimento.</p>

          <h2>2. Uso das Informações</h2>
          <p>As informações são utilizadas para atendimento, gestão de leads e comunicação via WhatsApp Business API.</p>

          <h2>3. Compartilhamento</h2>
          <p>Não vendemos dados. Compartilhamento ocorre apenas quando necessário para integração com a Meta ou exigência legal.</p>

          <h2>4. Segurança</h2>
          <p>Os dados são armazenados em ambiente seguro e protegidos contra acesso não autorizado.</p>

          <h2>5. Direitos do Usuário</h2>
          <p>Solicitações podem ser feitas pelo e-mail: suporte@viacrm.com</p>

          <h2>6. Alterações</h2>
          <p>Esta política pode ser atualizada periodicamente.</p>
        </body>
      </html>
    `);
  }
}
