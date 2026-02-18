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

  private async resolveTenantId(input: string): Promise<string> {
    const v = (input || '').toString().trim();
    if (!v) throw new UnauthorizedException('Tenant inválido');

    // Se já parece UUID, usa direto
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      return v;
    }

    // Se não é UUID, trata como slug
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: v, ativo: true },
    });

    if (!tenant) throw new UnauthorizedException('Tenant inválido');

    return tenant.id;
  }

  async login(data: {
    tenantId: string; // pode ser UUID ou slug
    email: string;
    senha?: string;
    password?: string;
  }) {
    const email = (data.email || '').trim().toLowerCase();
    const senha = (data.senha ?? data.password ?? '').toString();

    if (!email || !senha) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tenantId = await this.resolveTenantId(data.tenantId);

    const user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        email,
        ativo: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const hash = (user as any).senhaHash || '';
    if (!hash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(senha, hash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

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

  async registerMaster(data: {
    tenantId: string; // pode ser UUID ou slug
    nome: string;
    email: string;
    senha: string;
  }) {
    const email = data.email.trim().toLowerCase();
    const senhaHash = await bcrypt.hash(data.senha, 10);

    const tenantId = await this.resolveTenantId(data.tenantId);

    const existingCount = await this.prisma.user.count({
      where: { tenantId },
    });

    if (existingCount > 0) {
      throw new UnauthorizedException('Já existe usuário criado para este tenant.');
    }

    const user = await this.prisma.user.create({
      data: {
        tenantId,
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
