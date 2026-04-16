import { PrismaService } from '../prisma/prisma.service';
import { decryptField } from '../crypto/field-crypto.util';

export interface WhatsappCreds {
  token: string;
  phoneNumberId: string;
  version: string;
}

/**
 * Resolve as credenciais WhatsApp para um tenant.
 * Prioridade: credenciais do tenant no banco → fallback para env vars (migração).
 * O token é automaticamente decriptado se foi salvo com encryptField().
 */
export async function resolveWhatsappCreds(
  prisma: PrismaService,
  tenantId?: string | null,
): Promise<WhatsappCreds | null> {
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { whatsappToken: true, whatsappPhoneNumberId: true },
    });
    if (tenant?.whatsappToken && tenant?.whatsappPhoneNumberId) {
      let token: string;
      try {
        token = decryptField(tenant.whatsappToken);
      } catch {
        // Falha ao decriptar — usa o valor bruto (dados legados sem ENCRYPTION_KEY)
        token = tenant.whatsappToken;
      }
      return {
        token,
        phoneNumberId: tenant.whatsappPhoneNumberId,
        version: 'v20.0',
      };
    }
  }

  // Fallback para env vars (período de migração ou tenant sem config própria)
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;

  return {
    token,
    phoneNumberId,
    version: process.env.WHATSAPP_API_VERSION || 'v20.0',
  };
}

/**
 * Envia uma mensagem de texto via Meta Cloud API usando as credenciais resolvidas.
 */
export async function sendWhatsappText(
  creds: WhatsappCreds,
  to: string,
  text: string,
): Promise<any> {
  const phone = to.replace(/\D/g, '');
  const res = await fetch(`https://graph.facebook.com/${creds.version}/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    }),
  });
  return res.json().catch(() => null);
}

/**
 * Envia uma imagem via Meta Cloud API.
 */
export async function sendWhatsappImage(
  creds: WhatsappCreds,
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  const phone = to.replace(/\D/g, '');
  const image: any = { link: imageUrl };
  if (caption) image.caption = caption;
  await fetch(`https://graph.facebook.com/${creds.version}/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'image', image }),
  });
}
