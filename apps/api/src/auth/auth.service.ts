import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
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

    const accessToken = await this.jwt.signAsync(payload, { expiresIn: '15m' });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, type: 'refresh' },
      { expiresIn: '7d' },
    );

    this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'LOGIN',
      metadata: { email: user.email },
    });

    return {
      accessToken,
      refreshToken,
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

  async refreshAccessToken(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token inválido para refresh.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId, ativo: true },
      select: { id: true, tenantId: true, email: true, role: true, branchId: true },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado ou inativo.');

    const newPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };

    const newAccessToken = await this.jwt.signAsync(newPayload, { expiresIn: '15m' });

    this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'TOKEN_REFRESH',
    });

    return { accessToken: newAccessToken };
  }

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestException('Email inválido.');

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, ativo: true },
      select: { id: true, tenantId: true, nome: true, email: true },
    });

    // Sempre retorna 200 para não revelar se o email existe (LGPD / segurança)
    if (!user) return;

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    await this.email.sendPasswordReset(user.email, resetUrl, user.nome);

    this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      metadata: { email: user.email },
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token) throw new BadRequestException('Token inválido.');
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('A senha deve ter no mínimo 8 caracteres.');
    }

    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
      select: { id: true, tenantId: true, email: true, passwordResetExpiry: true },
    });

    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('Token inválido ou expirado.');
    }

    const senhaHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { senhaHash, passwordResetToken: null, passwordResetExpiry: null },
    });

    this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      metadata: { email: user.email },
    });
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
