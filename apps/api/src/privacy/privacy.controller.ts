import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class PrivacyController {
  @Get('/privacy-policy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getPrivacyPolicyHtml(): string {
    return `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Política de Privacidade - VIA CRM</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 16px; line-height: 1.6; }
    h1, h2 { line-height: 1.2; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
    .muted { color: #555; }
  </style>
</head>
<body>
  <h1>Política de Privacidade — VIA CRM</h1>
  <p class="muted">Última atualização: ${new Date().toISOString().slice(0, 10)}</p>

  <h2>1. Quem somos</h2>
  <p>
    O <strong>VIA CRM</strong> é um sistema de gestão de leads e atendimento, incluindo registro de eventos de atendimento (ex.: anotações internas e mensagens).
  </p>

  <h2>2. Dados que podemos coletar</h2>
  <ul>
    <li>Dados de contato do lead (ex.: nome, telefone, e-mail), quando fornecidos.</li>
    <li>Eventos de atendimento (ex.: mensagens recebidas/enviadas, anotações internas).</li>
    <li>Dados técnicos de uso (ex.: logs básicos para segurança e auditoria).</li>
  </ul>

  <h2>3. Como usamos os dados</h2>
  <ul>
    <li>Para operar o CRM e permitir atendimento e organização de leads.</li>
    <li>Para auditoria, segurança, prevenção a fraudes e melhoria do serviço.</li>
    <li>Para cumprir obrigações legais aplicáveis.</li>
  </ul>

  <h2>4. Compartilhamento</h2>
  <p>
    Podemos integrar com serviços de terceiros para comunicação (ex.: WhatsApp Cloud API da Meta) quando aplicável.
    Não vendemos seus dados.
  </p>

  <h2>5. Retenção</h2>
  <p>
    Mantemos dados pelo tempo necessário para prestação do serviço, suporte, auditoria e obrigações legais.
  </p>

  <h2>6. Seus direitos</h2>
  <p>
    Você pode solicitar acesso, correção ou exclusão de dados, quando aplicável.
  </p>

  <h2>7. Contato</h2>
  <p>
    Para solicitações relacionadas à privacidade, entre em contato pelo canal definido pelo operador do sistema.
  </p>

  <hr />
  <p class="muted">
    Esta página existe para atendimento de requisitos de plataforma (ex.: Meta). Ajuste o texto conforme sua operação.
  </p>
</body>
</html>
    `.trim();
  }
}
