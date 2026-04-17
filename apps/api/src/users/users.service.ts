import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";
import * as bcrypt from 'bcrypt';
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
    senha: string;
    role?: string;
    branchId?: string | null;
  }) {
    const email = data.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw new BadRequestException('E-mail já cadastrado neste tenant.');

    const validRoles = ['MANAGER', 'AGENT'];
    const role = (data.role && validRoles.includes(data.role)) ? data.role : 'AGENT';

    const senhaHash = await bcrypt.hash(data.senha, 10);

    return this.prisma.user.create({
      data: {
        tenantId,
        nome: data.nome.trim(),
        email,
        senhaHash,
        role: role as any,
        ativo: true,
        branchId: data.branchId ?? null,
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
    });
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

    // OWNER não pode virar OWNER via esta rota — role se limita a MANAGER/AGENT
    const validRoles = ['MANAGER', 'AGENT'];
    if (data.role && !validRoles.includes(data.role)) {
      throw new BadRequestException('Role inválido. Use MANAGER ou AGENT.');
    }

    const updateData: any = {};
    if (data.nome !== undefined) updateData.nome = data.nome.trim();
    if (data.role !== undefined) updateData.role = data.role;
    if (data.ativo !== undefined) updateData.ativo = data.ativo;
    if (data.branchId !== undefined) updateData.branchId = data.branchId;
    if (data.recebeLeads !== undefined) updateData.recebeLeads = data.recebeLeads;
    if (data.senha) updateData.senhaHash = await bcrypt.hash(data.senha, 10);

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
          select: { nome: true, brandPalette: true, logoUrl: true, faviconUrl: true },
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

    // Troca de senha: exige senha atual
    if (data.novaSenha) {
      if (!data.senhaAtual) throw new BadRequestException('Informe a senha atual para trocar a senha.');
      const ok = await bcrypt.compare(data.senhaAtual, user.senhaHash);
      if (!ok) throw new BadRequestException('Senha atual incorreta.');
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
    if (data.whatsappNumber !== undefined) updateData.whatsappNumber = data.whatsappNumber?.trim() || null;
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

  async getNotificationSettings(_userId: string, _tenantId: string) {
    // notificationSettings foi removido do schema — retorna padrão
    return { events: ['new_lead'], stages: [] };
  }

  async updateNotificationSettings(
    _userId: string,
    _tenantId: string,
    data: { events: string[]; stages: string[] },
  ) {
    // notificationSettings foi removido do schema — sem-op por ora
    return data;
  }
}
