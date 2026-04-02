import { Injectable } from "@nestjs/common";
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
        ativo: true,
        criadoEm: true,
      },
      orderBy: { criadoEm: "desc" },
    });
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
}
