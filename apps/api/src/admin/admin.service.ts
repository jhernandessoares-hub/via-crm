import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async login(email: string, senha: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!admin || !admin.ativo) throw new UnauthorizedException('Credenciais inválidas.');
    const ok = await bcrypt.compare(senha, admin.senhaHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas.');
    const token = await this.jwt.signAsync({ sub: admin.id, email: admin.email, nome: admin.nome, isPlatformAdmin: true }, { expiresIn: '8h' });
    this.audit.log({ action: 'PLATFORM_ADMIN_LOGIN', metadata: { email: admin.email } });
    return { accessToken: token, admin: { id: admin.id, email: admin.email, nome: admin.nome } };
  }

  async bootstrap(email: string, senha: string, nome: string, secret: string) {
    const envSecret = process.env.PLATFORM_ADMIN_SECRET;
    if (!envSecret || secret !== envSecret) throw new UnauthorizedException('Segredo inválido.');
    const existing = await this.prisma.platformAdmin.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) throw new BadRequestException('Admin já existe.');
    const senhaHash = await bcrypt.hash(senha, 10);
    const admin = await this.prisma.platformAdmin.create({ data: { email: email.trim().toLowerCase(), senhaHash, nome } });
    return { id: admin.id, email: admin.email, nome: admin.nome };
  }

  async listTenants(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: limit,
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true, nome: true, slug: true, ativo: true, plan: true, criadoEm: true,
          whatsappPhoneNumberId: true,
          _count: { select: { leads: true, users: true, channels: true } },
        },
      }),
      this.prisma.tenant.count(),
    ]);
    return { tenants, total, page, limit };
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true } },
        channels: { select: { id: true, type: true, name: true, active: true, leadsCount: true, lastLeadAt: true } },
        _count: { select: { leads: true, aiAgents: true, products: true } },
      },
    });
    if (!tenant) throw new BadRequestException('Tenant não encontrado.');
    return tenant;
  }

  async createTenant(data: { nome: string; slug: string; ownerNome: string; ownerEmail: string; ownerSenha: string; plan?: string }) {
    const senhaHash = await bcrypt.hash(data.ownerSenha, 10);
    const tenant = await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({ data: { nome: data.nome, slug: data.slug, plan: data.plan || 'STARTER' } });
      const branch = await tx.branch.create({ data: { tenantId: t.id, nome: 'Principal', ativo: true } });
      await tx.user.create({
        data: {
          tenantId: t.id,
          branchId: branch.id,
          nome: data.ownerNome,
          email: data.ownerEmail.trim().toLowerCase(),
          senhaHash,
          ativo: true,
          role: 'OWNER',
        },
      });
      return t;
    });
    try {
      await this.email.sendWelcome(data.ownerEmail, data.ownerNome, data.nome);
    } catch {}
    this.audit.log({ action: 'PLATFORM_CREATE_TENANT', metadata: { slug: data.slug } });
    return tenant;
  }

  async suspendTenant(id: string, suspend: boolean) {
    const tenant = await this.prisma.tenant.update({ where: { id }, data: { ativo: !suspend } });
    this.audit.log({ action: suspend ? 'PLATFORM_SUSPEND_TENANT' : 'PLATFORM_ACTIVATE_TENANT', resourceType: 'tenant', resourceId: id });
    return tenant;
  }

  async updatePlan(id: string, plan: string) {
    if (!['STARTER', 'PREMIUM'].includes(plan)) throw new BadRequestException('Plano inválido.');
    const tenant = await this.prisma.tenant.update({ where: { id }, data: { plan } });
    this.audit.log({ action: 'PLATFORM_CHANGE_PLAN', resourceType: 'tenant', resourceId: id, metadata: { plan } });
    return tenant;
  }

  async impersonate(tenantId: string, adminPayload: any) {
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'OWNER', ativo: true },
      select: { id: true, tenantId: true, email: true, role: true, branchId: true },
    });
    if (!owner) throw new BadRequestException('OWNER não encontrado para este tenant.');
    const token = await this.jwt.signAsync({
      sub: owner.id,
      tenantId: owner.tenantId,
      email: owner.email,
      role: owner.role,
      branchId: owner.branchId,
      impersonatedBy: adminPayload.sub,
    }, { expiresIn: '2h' });
    this.audit.log({
      action: 'PLATFORM_IMPERSONATE',
      resourceType: 'tenant',
      resourceId: tenantId,
      metadata: { adminId: adminPayload.sub, targetOwnerId: owner.id },
    });
    return { accessToken: token, owner };
  }

  async getHealth() {
    const [tenantCount, leadCount, auditCount] = await Promise.all([
      this.prisma.tenant.count({ where: { ativo: true } }),
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.auditLog.count(),
    ]);
    return { tenants: tenantCount, leads: leadCount, auditLogs: auditCount, timestamp: new Date() };
  }

  async getAuditLogs(page = 1, limit = 50, tenantId?: string) {
    const skip = (page - 1) * limit;
    const where = tenantId ? { tenantId } : {};
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { logs, total, page, limit };
  }

  async getTenantStats(tenantId: string) {
    const [leadsTotal, leadsThisMonth, users, channels, aiAgents] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.lead.count({
        where: { tenantId, deletedAt: null, criadoEm: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
      this.prisma.user.count({ where: { tenantId, ativo: true } }),
      this.prisma.channel.count({ where: { tenantId, active: true } }),
      this.prisma.aiAgent.count({ where: { tenantId } }),
    ]);
    return { leadsTotal, leadsThisMonth, users, channels, aiAgents };
  }

  async exportTenantData(tenantId: string) {
    const [tenant, leads, users, channels] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.lead.findMany({ where: { tenantId } }),
      this.prisma.user.findMany({ where: { tenantId }, select: { id: true, nome: true, email: true, role: true, criadoEm: true } }),
      this.prisma.channel.findMany({ where: { tenantId }, select: { id: true, type: true, name: true, active: true } }),
    ]);
    this.audit.log({ action: 'PLATFORM_EXPORT_TENANT_DATA', resourceType: 'tenant', resourceId: tenantId });
    return { tenant, leads, users, channels, exportedAt: new Date() };
  }
}
