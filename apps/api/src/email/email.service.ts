import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { Logger } from '../logger';

const logger = new Logger('EmailService');

@Injectable()
export class EmailService {
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = process.env.EMAIL_FROM || 'VIA CRM <noreply@viacrm.com.br>';
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      logger.warn(`Email não enviado (RESEND_API_KEY não configurado): ${subject} → ${to}`);
      return;
    }
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html });
    } catch (err) {
      logger.error(`Falha ao enviar email: ${subject} → ${to}`, { error: (err as any)?.message });
    }
  }

  async sendPasswordReset(to: string, resetUrl: string, nome?: string): Promise<void> {
    const greeting = nome ? `Olá, ${nome}!` : 'Olá!';
    await this.send(
      to,
      'Recuperação de senha — VIA CRM',
      `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1a1a1a">${greeting}</h2>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>VIA CRM</strong>.</p>
        <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${resetUrl}"
             style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
            Redefinir senha
          </a>
        </p>
        <p style="color:#666;font-size:13px">Se você não solicitou a redefinição, ignore este email — sua senha permanece a mesma.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
        <p style="color:#999;font-size:12px">VIA CRM · Todos os direitos reservados</p>
      </div>
      `,
    );
  }

  async sendWelcome(to: string, nome: string, tenantNome: string): Promise<void> {
    await this.send(
      to,
      `Bem-vindo ao VIA CRM, ${nome}!`,
      `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1a1a1a">Olá, ${nome}!</h2>
        <p>Sua conta no <strong>VIA CRM</strong> para a empresa <strong>${tenantNome}</strong> foi criada com sucesso.</p>
        <p>Acesse o sistema pelo link enviado pelo seu administrador e comece a gerenciar seus leads.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
        <p style="color:#999;font-size:12px">VIA CRM · Todos os direitos reservados</p>
      </div>
      `,
    );
  }

  async sendNewLeadNotification(
    to: string,
    nome: string,
    leadNome: string,
    origem: string,
  ): Promise<void> {
    await this.send(
      to,
      `Novo lead recebido: ${leadNome}`,
      `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1a1a1a">Olá, ${nome}!</h2>
        <p>Um novo lead chegou pelo canal <strong>${origem}</strong>:</p>
        <p style="font-size:18px;font-weight:600">${leadNome}</p>
        <p>Acesse o VIA CRM para visualizar e atender este lead.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
        <p style="color:#999;font-size:12px">VIA CRM · Todos os direitos reservados</p>
      </div>
      `,
    );
  }
}
