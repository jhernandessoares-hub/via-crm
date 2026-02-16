import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(data: { tenantId: string; email: string; senha: string }) {
    const email = data.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        tenantId: data.tenantId,
        email,
        ativo: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(data.senha, user.senhaHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // ✅ Agora o token carrega role e branchId
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        tenantId: user.tenantId,
        nome: user.nome,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
      },
    };
  }

  async registerMaster(data: { tenantId: string; nome: string; email: string; senha: string }) {
    const email = data.email.trim().toLowerCase();

    const senhaHash = await bcrypt.hash(data.senha, 10);

    // Regra simples do V1: o primeiro usuário do tenant é o "master"
    // (Depois a gente cria RBAC e permissões.)
    const existingCount = await this.prisma.user.count({
      where: { tenantId: data.tenantId },
    });

    if (existingCount > 0) {
      // Por enquanto bloqueia criar outro master pelo endpoint
      throw new UnauthorizedException('Já existe usuário criado para este tenant.');
    }

    const user = await this.prisma.user.create({
      data: {
        tenantId: data.tenantId,
        nome: data.nome.trim(),
        email,
        senhaHash,
        ativo: true,
      },
    });

    return {
      id: user.id,
      tenantId: user.tenantId,
      nome: user.nome,
      email: user.email,
    };
  }
}
