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
}
