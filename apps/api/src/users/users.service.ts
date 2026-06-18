import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { LimitsService } from "../plans/limits.service";
import { UsageService, LimitExceededException } from "../plans/usage.service";
import { validatePasswordStrength } from "../auth/password-strength.util";
import { normalizePhoneBR, isValidWhatsappNumber } from "../common/phone.util";

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private limitsService: LimitsService,
    private usageService: UsageService,
  ) {}

  async listByTenant(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        branchId: true,
        recebeLeads: true,
        criadoEm: true,
      },
      orderBy: { criadoEm: "desc" },
    });
  }

  async listBranches(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });
  }

  async getTeamMember(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        branchId: true,
        criadoEm: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async inviteTeamMember(tenantId: string, requesterId: string, data: {
    nome: string;
    email: string;
    role?: string;
    branchId?: string | null;
  }) {
    const email = data.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw new BadRequestException('E-mail já cadastrado neste tenant.');

    const activeUsers = await this.prisma.user.count({ where: { tenantId, ativo: true } });
    const maxUsers = await this.limitsService.resolveLimit(tenantId, 'maxUsers');
    if (maxUsers >= 0 && activeUsers >= maxUsers) {
      throw new LimitExceededException('maxUsers', activeUsers, maxUsers);
    }

    const validRoles = ['MANAGER', 'AGENT', 'PARTNER'];
    const role = (data.role && validRoles.includes(data.role)) ? data.role : 'AGENT';

    // Conta criada sem senha utilizável — hash descartável. O membro define a
    // própria senha pelo link de convite (token abaixo).
    const senhaHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        nome: data.nome.trim(),
        email,
        senhaHash,
        role: role as any,
        ativo: true,
        branchId: data.branchId ?? null,
        passwordResetToken: token,
        passwordResetExpiry: expiry,
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true, tenantId: true },
    });

    // Envia o convite por email (não quebra o fluxo se falhar)
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { nome: true, slug: true },
      });
      if (tenant) {
        const baseUrl = process.env.APP_URL || 'http://localhost:3001';
        const inviteUrl = `${baseUrl}/definir-senha?token=${token}`;
        const loginUrl = `${baseUrl}/login`;
        await this.email.sendInvite(email, data.nome.trim(), tenant.nome, tenant.slug, inviteUrl, loginUrl);
      }
    } catch { /* não quebra o fluxo */ }

    return user;
  }

  async resendInvite(tenantId: string, userId: string) {
    const member = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!member) throw new NotFoundException('Usuário não encontrado.');
    if ((member as any).role === 'OWNER') throw new ForbiddenException('Não é possível reenviar convite para um OWNER.');

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nome: true, slug: true },
    });
    if (tenant) {
      const baseUrl = process.env.APP_URL || 'http://localhost:3001';
      const inviteUrl = `${baseUrl}/definir-senha?token=${token}`;
      const loginUrl = `${baseUrl}/login`;
      await this.email.sendInvite(member.email, member.nome, tenant.nome, tenant.slug, inviteUrl, loginUrl);
    }

    return { ok: true };
  }

  async updateTeamMember(tenantId: string, requesterId: string, userId: string, data: {
    nome?: string;
    role?: string;
    ativo?: boolean;
    branchId?: string | null;
    senha?: string;
    recebeLeads?: boolean;
  }) {
    const member = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!member) throw new NotFoundException('Usuário não encontrado.');

    // OWNER não pode alterar o próprio role/ativo por aqui (usaria /me)
    if (userId === requesterId && (data.role !== undefined || data.ativo !== undefined)) {
      throw new ForbiddenException('Não é permitido alterar seu próprio papel ou status por esta rota.');
    }

    // OWNER não pode virar OWNER via esta rota — role se limita a MANAGER/AGENT/PARTNER
    const validRoles = ['MANAGER', 'AGENT', 'PARTNER'];
    if (data.role && !validRoles.includes(data.role)) {
      throw new BadRequestException('Role inválido. Use MANAGER, AGENT ou PARTNER.');
    }

    const updateData: any = {};
    if (data.nome !== undefined) updateData.nome = data.nome.trim();
    if (data.role !== undefined) updateData.role = data.role;
    if (data.ativo !== undefined) updateData.ativo = data.ativo;
    if (data.branchId !== undefined) updateData.branchId = data.branchId;
    if (data.recebeLeads !== undefined) updateData.recebeLeads = data.recebeLeads;
    if (data.senha) {
      const pwError = validatePasswordStrength(data.senha);
      if (pwError) throw new BadRequestException(pwError);
      updateData.senhaHash = await bcrypt.hash(data.senha, 10);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, nome: true, email: true, role: true, ativo: true, branchId: true, recebeLeads: true, criadoEm: true },
    });
  }

  async removeTeamMember(tenantId: string, requesterId: string, userId: string) {
    if (userId === requesterId) throw new ForbiddenException('Não é possível remover o próprio usuário.');
    const member = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!member) throw new NotFoundException('Usuário não encontrado.');
    if ((member as any).role === 'OWNER') throw new ForbiddenException('Não é possível remover um OWNER.');

    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }

  async getMe(userId: string, tenantId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        nome: true,
        email: true,
        apelido: true,
        preferences: true,
        role: true,
        whatsappNumber: true,
        secretaryName: true,
        secretaryBotName: true,
        secretaryGender: true,
        branchId: true,
        ativo: true,
        criadoEm: true,
        tenant: {
          select: { nome: true, brandPalette: true, logoUrl: true, faviconUrl: true, plan: true, addons: true },
        },
      },
    });
  }

  async updateMe(
    userId: string,
    tenantId: string,
    data: {
      nome?: string;
      email?: string;
      apelido?: string | null;
      preferences?: Record<string, unknown>;
      senhaAtual?: string;
      novaSenha?: string;
      whatsappNumber?: string | null;
      secretaryName?: string | null;
      secretaryBotName?: string | null;
      secretaryGender?: string;
    },
  ) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    // Troca de senha: exige senha atual e força mínima
    if (data.novaSenha) {
      if (!data.senhaAtual) throw new BadRequestException('Informe a senha atual para trocar a senha.');
      const ok = await bcrypt.compare(data.senhaAtual, user.senhaHash);
      if (!ok) throw new BadRequestException('Senha atual incorreta.');
      const pwError = validatePasswordStrength(data.novaSenha);
      if (pwError) throw new BadRequestException(pwError);
    }

    // Validar email único no tenant
    if (data.email && data.email.trim().toLowerCase() !== user.email) {
      const conflict = await this.prisma.user.findFirst({
        where: { tenantId, email: data.email.trim().toLowerCase(), id: { not: userId } },
      });
      if (conflict) throw new BadRequestException('E-mail já utilizado por outro usuário.');
    }

    const updateData: any = {};
    if (data.nome !== undefined) updateData.nome = data.nome.trim();
    if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
    if (data.apelido !== undefined) updateData.apelido = data.apelido?.trim() || null;
    if (data.preferences !== undefined) updateData.preferences = data.preferences;
    if (data.novaSenha) updateData.senhaHash = await bcrypt.hash(data.novaSenha, 10);
    if (data.whatsappNumber !== undefined) {
      const raw = data.whatsappNumber?.trim() || '';
      if (!raw) {
        updateData.whatsappNumber = null;
      } else {
        const normalized = normalizePhoneBR(raw);
        if (!isValidWhatsappNumber(normalized)) {
          throw new BadRequestException('Número de WhatsApp inválido. Use DDD + número (ex: 11 99999-9999).');
        }
        updateData.whatsappNumber = normalized;
      }
    }
    if (data.secretaryName !== undefined) updateData.secretaryName = data.secretaryName?.trim() || null;
    if (data.secretaryBotName !== undefined) updateData.secretaryBotName = data.secretaryBotName?.trim() || null;
    if (data.secretaryGender !== undefined) updateData.secretaryGender = data.secretaryGender;

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        nome: true,
        email: true,
        apelido: true,
        preferences: true,
        role: true,
        whatsappNumber: true,
        secretaryName: true,
        secretaryBotName: true,
        secretaryGender: true,
      },
    });
  }

  async getRoundRobinConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { roundRobinConfig: true },
    });
    const cfg = (tenant?.roundRobinConfig ?? {}) as any;
    return {
      incluirGerentes: cfg.incluirGerentes ?? false,
      incluirOwner:    cfg.incluirOwner    ?? false,
    };
  }

  async updateRoundRobinConfig(tenantId: string, data: { incluirGerentes: boolean; incluirOwner: boolean }) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { roundRobinConfig: data },
    });
    return data;
  }

  async getNotificationSettings(userId: string, _tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationSettings: true },
    });
    // null = nunca configurou → padrão: recebe novo lead E lead qualificado
    if (!user?.notificationSettings) return { events: ['new_lead', 'lead_qualified'], stages: [], allTenantQualified: false };
    return user.notificationSettings as { events: string[]; stages: string[]; allTenantQualified?: boolean };
  }

  async updateNotificationSettings(
    userId: string,
    tenantId: string,
    data: { events: string[]; stages: string[]; allTenantQualified?: boolean },
  ) {
    await this.prisma.user.update({
      where: { id: userId, tenantId },
      data: { notificationSettings: data as any },
    });
    return data;
  }
}
