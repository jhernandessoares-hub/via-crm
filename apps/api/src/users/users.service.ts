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
    if (data.senha) updateData.senhaHash = await bcrypt.hash(data.senha, 10);

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, nome: true, email: true, role: true, ativo: true, branchId: true, criadoEm: true },
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
        role: true,
        whatsappNumber: true,
        secretaryName: true,
        secretaryBotName: true,
        secretaryGender: true,
        branchId: true,
        ativo: true,
        criadoEm: true,
      },
    });
  }

  async updateMe(
    userId: string,
    tenantId: string,
    data: {
      whatsappNumber?: string | null;
      secretaryName?: string | null;
      secretaryBotName?: string | null;
      secretaryGender?: string;
    },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.whatsappNumber !== undefined && {
          whatsappNumber: data.whatsappNumber?.trim() || null,
        }),
        ...(data.secretaryName !== undefined && {
          secretaryName: data.secretaryName?.trim() || null,
        }),
        ...(data.secretaryBotName !== undefined && {
          secretaryBotName: data.secretaryBotName?.trim() || null,
        }),
        ...(data.secretaryGender !== undefined && {
          secretaryGender: data.secretaryGender,
        }),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        whatsappNumber: true,
        secretaryName: true,
        secretaryBotName: true,
        secretaryGender: true,
      },
    });
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
