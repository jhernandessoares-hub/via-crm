import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { QueueService } from '../queue/queue.service';
import { DEFAULT_GLOBAL_SAFETY_RULES, DEFAULT_AGENT_IDENTITY_RULES, DEFAULT_WHATSAPP_FORMATTING_RULES } from '../ai/ai.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly queue: QueueService,
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

  async createTenant(data: {
    nome: string; slug: string; ownerNome: string; ownerEmail: string; ownerSenha: string; plan?: string;
    logradouro?: string; numero?: string; bairro?: string; cep?: string;
    cidade?: string; estado?: string; site?: string; redesSociais?: string;
    proprietarioNome?: string; proprietarioTelefone?: string;
    whatsappPhoneNumberId?: string; whatsappToken?: string; whatsappVerifyToken?: string;
  }) {
    const senhaHash = await bcrypt.hash(data.ownerSenha, 10);
    const tenant = await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          nome: data.nome, slug: data.slug, plan: data.plan || 'STARTER',
          logradouro: data.logradouro || null, numero: data.numero || null,
          bairro: data.bairro || null, cep: data.cep || null,
          cidade: data.cidade || null, estado: data.estado || null,
          site: data.site || null, redesSociais: data.redesSociais || null,
          proprietarioNome: data.proprietarioNome || null,
          proprietarioTelefone: data.proprietarioTelefone || null,
          whatsappPhoneNumberId: data.whatsappPhoneNumberId || null,
          whatsappToken: data.whatsappToken || null,
          whatsappVerifyToken: data.whatsappVerifyToken || null,
        },
      });
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
    try {
      await this.seedTemplatesForTenant(tenant.id);
    } catch {}
    this.audit.log({ action: 'PLATFORM_CREATE_TENANT', metadata: { slug: data.slug } });
    return tenant;
  }

  async updateTenant(id: string, data: {
    nome?: string; slug?: string;
    logradouro?: string; numero?: string; bairro?: string; cep?: string;
    cidade?: string; estado?: string; site?: string; redesSociais?: string;
    proprietarioNome?: string; proprietarioTelefone?: string;
    whatsappPhoneNumberId?: string; whatsappToken?: string; whatsappVerifyToken?: string;
  }) {
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.logradouro !== undefined && { logradouro: data.logradouro || null }),
        ...(data.numero !== undefined && { numero: data.numero || null }),
        ...(data.bairro !== undefined && { bairro: data.bairro || null }),
        ...(data.cep !== undefined && { cep: data.cep || null }),
        ...(data.cidade !== undefined && { cidade: data.cidade || null }),
        ...(data.estado !== undefined && { estado: data.estado || null }),
        ...(data.site !== undefined && { site: data.site || null }),
        ...(data.redesSociais !== undefined && { redesSociais: data.redesSociais || null }),
        ...(data.proprietarioNome !== undefined && { proprietarioNome: data.proprietarioNome || null }),
        ...(data.proprietarioTelefone !== undefined && { proprietarioTelefone: data.proprietarioTelefone || null }),
        ...(data.whatsappPhoneNumberId !== undefined && { whatsappPhoneNumberId: data.whatsappPhoneNumberId || null }),
        ...(data.whatsappToken !== undefined && { whatsappToken: data.whatsappToken || null }),
        ...(data.whatsappVerifyToken !== undefined && { whatsappVerifyToken: data.whatsappVerifyToken || null }),
      },
    });
    this.audit.log({ action: 'PLATFORM_UPDATE_TENANT', resourceType: 'tenant', resourceId: id, metadata: { fields: Object.keys(data) } });
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

  async createUser(tenantId: string, data: { nome: string; email: string; senha: string; role?: string }) {
    const existing = await this.prisma.user.findFirst({ where: { email: data.email.trim().toLowerCase() } });
    if (existing) throw new BadRequestException('E-mail já está em uso.');
    const branch = await this.prisma.branch.findFirst({ where: { tenantId, ativo: true }, orderBy: { criadoEm: 'asc' } });
    if (!branch) throw new BadRequestException('Nenhuma branch encontrada para este tenant.');
    const senhaHash = await bcrypt.hash(data.senha, 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        branchId: branch.id,
        nome: data.nome,
        email: data.email.trim().toLowerCase(),
        senhaHash,
        ativo: true,
        role: (data.role as any) || 'AGENT',
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
    });
    this.audit.log({ action: 'PLATFORM_CREATE_USER', resourceType: 'tenant', resourceId: tenantId, metadata: { userId: user.id } });
    return user;
  }

  async updateUser(tenantId: string, userId: string, data: { nome?: string; email?: string; role?: string }) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    if (data.email) {
      const conflict = await this.prisma.user.findFirst({ where: { email: data.email.trim().toLowerCase(), id: { not: userId } } });
      if (conflict) throw new BadRequestException('E-mail já está em uso.');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
        ...(data.role !== undefined && { role: data.role as any }),
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
    });
    this.audit.log({ action: 'PLATFORM_UPDATE_USER', resourceType: 'tenant', resourceId: tenantId, metadata: { userId, fields: Object.keys(data) } });
    return updated;
  }

  async toggleUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { ativo: !user.ativo },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
    });
    this.audit.log({ action: 'PLATFORM_TOGGLE_USER', resourceType: 'tenant', resourceId: tenantId, metadata: { userId, ativo: updated.ativo } });
    return updated;
  }

  async resetUserPassword(tenantId: string, userId: string, novaSenha: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    if (!novaSenha || novaSenha.length < 6) throw new BadRequestException('Senha deve ter ao menos 6 caracteres.');
    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { senhaHash } });
    this.audit.log({ action: 'PLATFORM_RESET_USER_PASSWORD', resourceType: 'tenant', resourceId: tenantId, metadata: { userId } });
    return { ok: true };
  }

  async deleteUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    if (user.role === 'OWNER') throw new BadRequestException('Não é possível remover o OWNER do tenant.');
    await this.prisma.user.delete({ where: { id: userId } });
    this.audit.log({ action: 'PLATFORM_DELETE_USER', resourceType: 'tenant', resourceId: tenantId, metadata: { userId } });
    return { ok: true };
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

  // ── TEMP: migração de agents prd → dev (remover após uso) ───────────────
  async exportTenantAgents(tenantId: string) {
    const agents = await this.prisma.aiAgent.findMany({
      where: { tenantId },
      include: { tools: true },
      orderBy: { createdAt: 'asc' },
    });
    return { tenantId, agents, exportedAt: new Date() };
  }

  async importAgentTemplates(agents: any[]) {
    const results = { created: 0, skipped: 0 };
    for (const a of agents) {
      const slug = a.slug?.trim().toLowerCase();
      if (!slug || !a.title || !a.prompt) { results.skipped++; continue; }
      const exists = await this.prisma.agentTemplate.findUnique({ where: { slug } });
      if (exists) { results.skipped++; continue; }
      await this.prisma.agentTemplate.create({
        data: {
          title: a.title, slug, description: a.description ?? null,
          objective: a.objective ?? null, prompt: a.prompt,
          exampleOutput: a.exampleOutput ?? null, mode: a.mode ?? 'COPILOT',
          audience: a.audience ?? null, permissions: a.permissions ?? [],
          active: a.active ?? true, model: a.model ?? null,
          temperature: a.temperature ?? null, isOrchestrator: a.isOrchestrator ?? false,
          routingKeywords: a.routingKeywords ?? [],
        },
      });
      results.created++;
    }
    return results;
  }

  // ── Agent Templates ──────────────────────────────────────────────────────

  async listAgentTemplates() {
    return this.prisma.agentTemplate.findMany({
      orderBy: { createdAt: 'asc' },
      include: { tools: { orderBy: { createdAt: 'asc' } }, _count: { select: { agents: true } } },
    });
  }

  async createAgentTemplate(data: {
    title: string; slug: string; description?: string; objective?: string;
    prompt: string; exampleOutput?: string; mode?: string; audience?: string;
    permissions?: string[]; active?: boolean; model?: string | null;
    temperature?: number | null; isOrchestrator?: boolean; routingKeywords?: string[];
  }) {
    const slug = data.slug.trim().toLowerCase();
    const existing = await this.prisma.agentTemplate.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException('Já existe um template com esse slug.');
    const template = await this.prisma.agentTemplate.create({
      data: {
        title: data.title,
        slug,
        description: data.description ?? null,
        objective: data.objective ?? null,
        prompt: data.prompt,
        exampleOutput: data.exampleOutput ?? null,
        mode: (data.mode as any) ?? 'COPILOT',
        audience: data.audience ?? null,
        permissions: data.permissions ?? [],
        active: data.active ?? true,
        model: data.model ?? null,
        temperature: data.temperature ?? null,
        isOrchestrator: data.isOrchestrator ?? false,
        routingKeywords: data.routingKeywords ?? [],
      },
    });
    this.audit.log({ action: 'PLATFORM_CREATE_AGENT_TEMPLATE', resourceType: 'agentTemplate', resourceId: template.id, metadata: { slug } });
    return template;
  }

  async updateAgentTemplate(id: string, data: {
    title?: string; description?: string | null; objective?: string | null;
    prompt?: string; exampleOutput?: string | null; mode?: string; audience?: string | null;
    permissions?: string[]; active?: boolean; model?: string | null;
    temperature?: number | null; isOrchestrator?: boolean; routingKeywords?: string[];
  }) {
    const template = await this.prisma.agentTemplate.findUnique({ where: { id } });
    if (!template) throw new BadRequestException('Template não encontrado.');
    const updated = await this.prisma.agentTemplate.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.objective !== undefined && { objective: data.objective }),
        ...(data.prompt !== undefined && { prompt: data.prompt }),
        ...(data.exampleOutput !== undefined && { exampleOutput: data.exampleOutput }),
        ...(data.mode !== undefined && { mode: data.mode as any }),
        ...(data.audience !== undefined && { audience: data.audience }),
        ...(data.permissions !== undefined && { permissions: data.permissions }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.temperature !== undefined && { temperature: data.temperature }),
        ...(data.isOrchestrator !== undefined && { isOrchestrator: data.isOrchestrator }),
        ...(data.routingKeywords !== undefined && { routingKeywords: data.routingKeywords }),
      },
    });
    this.audit.log({ action: 'PLATFORM_UPDATE_AGENT_TEMPLATE', resourceType: 'agentTemplate', resourceId: id });
    return updated;
  }

  async deleteAgentTemplate(id: string) {
    const template = await this.prisma.agentTemplate.findUnique({ where: { id } });
    if (!template) throw new BadRequestException('Template não encontrado.');
    // Desvincula agents existentes (templateId → null, mantém isCustomized)
    await this.prisma.aiAgent.updateMany({
      where: { templateId: id },
      data: { templateId: null },
    });
    await this.prisma.agentTemplate.delete({ where: { id } });
    this.audit.log({ action: 'PLATFORM_DELETE_AGENT_TEMPLATE', resourceType: 'agentTemplate', resourceId: id });
    return { ok: true };
  }

  async pushAgentTemplate(templateId: string, options: { tenantIds?: string[]; all?: boolean; force?: boolean }) {
    const template = await this.prisma.agentTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new BadRequestException('Template não encontrado.');

    let tenants: { id: string }[];
    if (options.all) {
      tenants = await this.prisma.tenant.findMany({ where: { ativo: true }, select: { id: true } });
    } else if (options.tenantIds?.length) {
      tenants = options.tenantIds.map((id) => ({ id }));
    } else {
      throw new BadRequestException('Informe tenantIds ou use all: true.');
    }

    const results = { created: 0, updated: 0, skipped: 0 };

    for (const { id: tenantId } of tenants) {
      const existing = await this.prisma.aiAgent.findFirst({ where: { tenantId, templateId } });

      if (existing) {
        if (existing.isCustomized && !options.force) {
          results.skipped++;
          continue;
        }
        await this.prisma.aiAgent.update({
          where: { id: existing.id },
          data: {
            title: template.title,
            description: template.description,
            objective: template.objective,
            prompt: template.prompt,
            exampleOutput: template.exampleOutput,
            mode: template.mode,
            audience: template.audience,
            permissions: template.permissions,
            model: template.model,
            temperature: template.temperature,
            isOrchestrator: template.isOrchestrator,
            routingKeywords: template.routingKeywords,
            syncedAt: new Date(),
            ...(options.force && { isCustomized: false }),
          },
        });
        results.updated++;
      } else {
        // Verifica conflito de slug no tenant
        const slugConflict = await this.prisma.aiAgent.findFirst({ where: { tenantId, slug: template.slug } });
        if (slugConflict) {
          results.skipped++;
          continue;
        }
        await this.prisma.aiAgent.create({
          data: {
            tenantId,
            templateId: template.id,
            title: template.title,
            slug: template.slug,
            description: template.description,
            objective: template.objective,
            prompt: template.prompt,
            exampleOutput: template.exampleOutput,
            mode: template.mode,
            audience: template.audience,
            permissions: template.permissions,
            active: template.active,
            model: template.model,
            temperature: template.temperature,
            isOrchestrator: template.isOrchestrator,
            routingKeywords: template.routingKeywords,
            isCustomized: false,
            syncedAt: new Date(),
          },
        });
        results.created++;
      }
    }

    this.audit.log({ action: 'PLATFORM_PUSH_AGENT_TEMPLATE', resourceType: 'agentTemplate', resourceId: templateId, metadata: results });
    return results;
  }

  async getOutdatedTenants() {
    const templates = await this.prisma.agentTemplate.findMany({ where: { active: true } });

    const report = await Promise.all(
      templates.map(async (tpl) => {
        const outdatedAgents = await this.prisma.aiAgent.findMany({
          where: {
            templateId: tpl.id,
            syncedAt: { lt: tpl.updatedAt },
          },
          select: {
            id: true,
            tenantId: true,
            isCustomized: true,
            syncedAt: true,
            tenant: { select: { nome: true, slug: true } },
          },
        });

        return {
          template: { id: tpl.id, title: tpl.title, slug: tpl.slug, updatedAt: tpl.updatedAt },
          canUpdate: outdatedAgents.filter((a) => !a.isCustomized),
          customized: outdatedAgents.filter((a) => a.isCustomized),
        };
      }),
    );

    return report.filter((r) => r.canUpdate.length > 0 || r.customized.length > 0);
  }

  // ── Template Tools ───────────────────────────────────────────────────────
  async listTemplateTool(templateId: string) {
    return this.prisma.agentTemplateTool.findMany({ where: { templateId }, orderBy: { createdAt: 'asc' } });
  }

  async createTemplateTool(templateId: string, data: { name: string; label: string; description: string; webhookUrl?: string; webhookMethod?: string }) {
    const template = await this.prisma.agentTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new BadRequestException('Template não encontrado.');
    return this.prisma.agentTemplateTool.create({
      data: {
        templateId,
        name: data.name.toLowerCase().replace(/\s+/g, '_'),
        label: data.label,
        description: data.description,
        type: 'WEBHOOK',
        webhookUrl: data.webhookUrl ?? null,
        webhookMethod: data.webhookMethod ?? 'POST',
        active: true,
      },
    });
  }

  async updateTemplateTool(templateId: string, toolId: string, data: { label?: string; description?: string; webhookUrl?: string; webhookMethod?: string; active?: boolean }) {
    return this.prisma.agentTemplateTool.update({
      where: { id: toolId },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.webhookUrl !== undefined && { webhookUrl: data.webhookUrl }),
        ...(data.webhookMethod !== undefined && { webhookMethod: data.webhookMethod }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  async deleteTemplateTool(templateId: string, toolId: string) {
    return this.prisma.agentTemplateTool.delete({ where: { id: toolId } });
  }

  // ── Queue Monitoring ─────────────────────────────────────────────────────

  async getQueueStatus() {
    return this.queue.getQueuesStatus();
  }

  async getStuckLeads(windowMinutes = 120) {
    // Só considera leads com mensagem mais antiga que 5 minutos (delay normal da IA é até 90s)
    const MIN_STUCK_MINUTES = 5;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const stuckCutoff = new Date(Date.now() - MIN_STUCK_MINUTES * 60 * 1000);

    // Leads que receberam mensagem recente mas não tiveram resposta da IA depois
    const recentInbound = await this.prisma.leadEvent.findMany({
      where: {
        channel: 'whatsapp.in',
        criadoEm: { gte: since, lte: stuckCutoff },
        lead: { deletedAt: null },
      },
      select: {
        leadId: true,
        criadoEm: true,
        payloadRaw: true,
        lead: {
          select: {
            id: true,
            nome: true,
            telefone: true,
            botPaused: true,
            tenantId: true,
            tenant: { select: { nome: true, slug: true } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
      distinct: ['leadId'],
    });

    const stuck: Array<{
      leadId: string; leadNome: string; telefone: string | null;
      tenantId: string; tenantNome: string | undefined; tenantSlug: string | undefined;
      lastMessageAt: Date; lastMessage: string; minutesAgo: number;
    }> = [];

    for (const ev of recentInbound) {
      if (ev.lead.botPaused) continue;

      const aiResponse = await this.prisma.leadEvent.findFirst({
        where: {
          leadId: ev.leadId,
          channel: { in: ['whatsapp.out', 'ai.suggestion'] },
          criadoEm: { gte: ev.criadoEm },
        },
        select: { id: true },
      });
      if (aiResponse) continue;

      const payload = ev.payloadRaw as any;
      const lastMessage =
        payload?.text?.body || payload?.text || payload?.message || payload?.body || '';

      stuck.push({
        leadId: ev.leadId,
        leadNome: ev.lead.nome || 'Sem nome',
        telefone: ev.lead.telefone,
        tenantId: ev.lead.tenantId,
        tenantNome: ev.lead.tenant?.nome,
        tenantSlug: ev.lead.tenant?.slug,
        lastMessageAt: ev.criadoEm,
        lastMessage: String(lastMessage).slice(0, 100),
        minutesAgo: Math.floor((Date.now() - new Date(ev.criadoEm).getTime()) / 60000),
      });
    }

    return { total: stuck.length, windowMinutes, leads: stuck };
  }

  async recoverQueue(tenantId?: string) {
    const retryResult = await this.queue.retryAllFailedJobs();

    let rescheduleResult = { scheduled: 0, leadIds: [] as string[] };
    if (tenantId) {
      rescheduleResult = await this.queue.rescheduleInboundAiForRecentLeads(this.prisma, tenantId, 120);
    } else {
      // Todos os tenants com autopilot ativo
      const tenants = await this.prisma.tenant.findMany({
        where: { ativo: true, autopilotEnabled: true },
        select: { id: true },
      });
      for (const t of tenants) {
        const r = await this.queue.rescheduleInboundAiForRecentLeads(this.prisma, t.id, 120);
        rescheduleResult.scheduled += r.scheduled;
        rescheduleResult.leadIds.push(...r.leadIds);
      }
    }

    this.audit.log({ action: 'PLATFORM_QUEUE_RECOVER', metadata: { tenantId: tenantId || 'all', retriedFailed: retryResult.retried, byQueue: retryResult.byQueue, rescheduled: rescheduleResult.scheduled } });

    return {
      retriedFailed: retryResult.retried,
      byQueue: retryResult.byQueue,
      rescheduled: rescheduleResult.scheduled,
      leadIds: rescheduleResult.leadIds,
    };
  }

  async seedTemplatesForTenant(tenantId: string) {
    const templates = await this.prisma.agentTemplate.findMany({
      where: { active: true },
      include: { tools: true },
    });
    let seeded = 0;

    for (const tpl of templates) {
      const exists = await this.prisma.aiAgent.findFirst({ where: { tenantId, templateId: tpl.id } });
      if (exists) continue;
      const slugConflict = await this.prisma.aiAgent.findFirst({ where: { tenantId, slug: tpl.slug } });
      if (slugConflict) continue;

      const agent = await this.prisma.aiAgent.create({
        data: {
          tenantId,
          templateId: tpl.id,
          title: tpl.title,
          slug: tpl.slug,
          description: tpl.description,
          objective: tpl.objective,
          prompt: tpl.prompt,
          exampleOutput: tpl.exampleOutput,
          mode: tpl.mode,
          audience: tpl.audience,
          permissions: tpl.permissions,
          active: tpl.active,
          model: tpl.model,
          temperature: tpl.temperature,
          isOrchestrator: tpl.isOrchestrator,
          routingKeywords: tpl.routingKeywords,
          isCustomized: false,
          syncedAt: new Date(),
        },
      });

      // Copia tools do template
      for (const tool of tpl.tools) {
        await this.prisma.agentTool.create({
          data: {
            tenantId,
            agentId: agent.id,
            name: tool.name,
            label: tool.label,
            description: tool.description,
            type: tool.type,
            webhookUrl: tool.webhookUrl,
            webhookMethod: tool.webhookMethod,
            active: tool.active,
          },
        });
      }

      seeded++;
    }

    return { seeded };
  }

  // ── Platform Config (global AI rules) ──────────────────────────────────────

  readonly PLATFORM_CONFIG_KEYS = ['globalAgentRules', 'agentIdentityRules', 'whatsappFormattingRules'] as const;

  async getPlatformConfig(): Promise<Record<string, string>> {
    const rows = await this.prisma.platformConfig.findMany();
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;

    // Retorna o padrão hardcoded quando a chave ainda não foi configurada no banco
    // Assim o admin vê o valor atual e pode editá-lo a partir daí
    if (!result['globalAgentRules']) result['globalAgentRules'] = DEFAULT_GLOBAL_SAFETY_RULES;
    if (!result['agentIdentityRules']) result['agentIdentityRules'] = DEFAULT_AGENT_IDENTITY_RULES;
    if (!result['whatsappFormattingRules']) result['whatsappFormattingRules'] = DEFAULT_WHATSAPP_FORMATTING_RULES;

    return result;
  }

  async updatePlatformConfig(data: Record<string, string>): Promise<Record<string, string>> {
    for (const [key, value] of Object.entries(data)) {
      const current = await this.prisma.platformConfig.findUnique({ where: { key } });
      const previousValue = current?.value ?? '';

      await this.prisma.platformConfig.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });

      await this.prisma.platformConfigHistory.create({
        data: { key, previousValue, newValue: String(value) },
      });
    }
    this.audit.log({ action: 'PLATFORM_UPDATE_CONFIG', metadata: { keys: Object.keys(data) } });
    return this.getPlatformConfig();
  }

  async getPlatformConfigHistory(key: string) {
    return this.prisma.platformConfigHistory.findMany({
      where: { key },
      orderBy: { changedAt: 'desc' },
      take: 20,
    });
  }
}
