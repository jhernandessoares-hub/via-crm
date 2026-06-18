import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePermissions, resolveFieldVisibility, resolveDocumentAccess } from './permissions.config';
import { resolveSlaConfig } from './sla.config';
import { encryptField } from '../crypto/field-crypto.util';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { nome: string; slug: string }) {
    const slug = data.slug.trim().toLowerCase();

    if (!slug.match(/^[a-z0-9-]+$/)) {
      throw new BadRequestException('Slug inválido. Use letras minúsculas, números e hífen.');
    }

    return this.prisma.tenant.create({
      data: {
        nome: data.nome.trim(),
        slug,
      },
    });
  }

  async getById(tenantId: string) {
    return this.prisma.tenant.findUnique({ where: { id: tenantId } });
  }

  async getBotConfig(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        autopilotEnabled: true,
        businessHours: true,
        outsideHoursMessage: true,
        aiDelayMin: true,
        aiDelayMax: true,
        aiTypingEnabled: true,
        aiHistoryLimit: true,
      },
    });
  }

  async getAiStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { autopilotEnabled: true },
    });
    return { autopilotEnabled: tenant?.autopilotEnabled ?? true };
  }

  async updateWhatsappSettings(tenantId: string, data: { whatsappPhoneNumberId?: string; whatsappToken?: string; whatsappVerifyToken?: string }) {
    let tokenToSave: string | undefined;
    if (data.whatsappToken !== undefined) {
      try {
        tokenToSave = encryptField(data.whatsappToken);
      } catch {
        tokenToSave = data.whatsappToken;
      }
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        whatsappPhoneNumberId: data.whatsappPhoneNumberId ?? undefined,
        whatsappToken: tokenToSave,
        whatsappVerifyToken: data.whatsappVerifyToken ?? undefined,
      },
      select: { id: true, whatsappPhoneNumberId: true, whatsappVerifyToken: true },
    });
  }

  async getWhatsappSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, whatsappPhoneNumberId: true, whatsappVerifyToken: true, whatsappToken: true },
    });
    return {
      whatsappPhoneNumberId: tenant?.whatsappPhoneNumberId || null,
      whatsappVerifyToken: tenant?.whatsappVerifyToken || null,
      whatsappTokenConfigured: !!tenant?.whatsappToken,
    };
  }

  async updateBotConfig(tenantId: string, data: {
    autopilotEnabled?: boolean;
    businessHours?: any;
    outsideHoursMessage?: string | null;
    aiDelayMin?: number;
    aiDelayMax?: number;
    aiTypingEnabled?: boolean;
    aiHistoryLimit?: number;
  }) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.autopilotEnabled !== undefined && { autopilotEnabled: data.autopilotEnabled }),
        ...(data.businessHours !== undefined && { businessHours: data.businessHours }),
        ...(data.outsideHoursMessage !== undefined && { outsideHoursMessage: data.outsideHoursMessage }),
        ...(data.aiDelayMin !== undefined && { aiDelayMin: data.aiDelayMin }),
        ...(data.aiDelayMax !== undefined && { aiDelayMax: data.aiDelayMax }),
        ...(data.aiTypingEnabled !== undefined && { aiTypingEnabled: data.aiTypingEnabled }),
        ...(data.aiHistoryLimit !== undefined && { aiHistoryLimit: data.aiHistoryLimit }),
      },
      select: {
        id: true,
        autopilotEnabled: true,
        businessHours: true,
        outsideHoursMessage: true,
        aiDelayMin: true,
        aiDelayMax: true,
        aiTypingEnabled: true,
        aiHistoryLimit: true,
      },
    });
  }

  async getBranding(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, brandPalette: true, logoUrl: true, faviconUrl: true },
    });
  }

  async updateBranding(tenantId: string, data: { brandPalette?: string }) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { brandPalette: data.brandPalette ?? undefined },
      select: { id: true, brandPalette: true, logoUrl: true, faviconUrl: true },
    });
  }

  async uploadBrandingImage(
    tenantId: string,
    field: 'logo' | 'favicon',
    fileBuffer: Buffer,
  ) {
    const folder = `tenants/${tenantId}/branding`;

    const result: any = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder, resource_type: 'image', type: 'upload', access_mode: 'public' },
          (err, res) => { if (err) return reject(err); resolve(res); },
        )
        .end(fileBuffer);
    });

    const urlField = field === 'logo' ? 'logoUrl' : 'faviconUrl';
    const pidField = field === 'logo' ? 'logoPublicId' : 'faviconPublicId';

    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoPublicId: true, faviconPublicId: true },
    });
    const oldPid = field === 'logo' ? current?.logoPublicId : current?.faviconPublicId;
    if (oldPid) {
      await cloudinary.uploader.destroy(oldPid, { resource_type: 'image', invalidate: true }).catch(() => null);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { [urlField]: result.secure_url, [pidField]: result.public_id },
      select: { id: true, brandPalette: true, logoUrl: true, faviconUrl: true },
    });
  }

  async removeBrandingImage(tenantId: string, field: 'logo' | 'favicon') {
    const urlField = field === 'logo' ? 'logoUrl' : 'faviconUrl';
    const pidField = field === 'logo' ? 'logoPublicId' : 'faviconPublicId';

    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoPublicId: true, faviconPublicId: true },
    });
    const oldPid = field === 'logo' ? current?.logoPublicId : current?.faviconPublicId;
    if (oldPid) {
      await cloudinary.uploader.destroy(oldPid, { resource_type: 'image', invalidate: true }).catch(() => null);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { [urlField]: null, [pidField]: null },
      select: { id: true, brandPalette: true, logoUrl: true, faviconUrl: true },
    });
  }

  async getPermissions(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    const saved = tenant?.permissionsConfig as any;
    return {
      ...resolvePermissions(saved),
      fieldVisibility: { partner: resolveFieldVisibility(saved?.fieldVisibility) },
      documentAccess: { partner: resolveDocumentAccess(saved?.documentAccess) },
    };
  }

  async updatePermissions(tenantId: string, config: Record<string, any>) {
    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    const merged = {
      ...((current?.permissionsConfig as any) ?? {}),
      ...config,
    };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { permissionsConfig: merged },
    });
    return {
      ...resolvePermissions(merged),
      fieldVisibility: { partner: resolveFieldVisibility((merged as any)?.fieldVisibility) },
    };
  }

  // ── Config SLA (por canal: oficial / light) ──────────────────────
  async getSlaConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slaConfig: true },
    });
    return resolveSlaConfig(tenant?.slaConfig as any);
  }

  async updateSlaConfig(tenantId: string, config: any) {
    const normalized = resolveSlaConfig(config);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { slaConfig: normalized as any },
    });
    return normalized;
  }
}
