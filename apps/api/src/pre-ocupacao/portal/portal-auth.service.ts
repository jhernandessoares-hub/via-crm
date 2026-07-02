import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { Logger } from '../../logger';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function onlyDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

function maskCpf(cpf: string): string {
  const digits = onlyDigits(cpf);
  if (digits.length < 4) return '***';
  return `***.***.${digits.slice(-5, -2)}-${digits.slice(-2)}`;
}

function last4(value: string): string {
  return onlyDigits(value).slice(-4);
}

async function resolveTenantIdBySlug(prisma: PrismaService, slug: string): Promise<string> {
  const site = await prisma.tenantSite.findUnique({ where: { slug }, select: { tenantId: true } });
  if (!site) throw new NotFoundException('Site não encontrado.');
  return site.tenantId;
}

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger('PortalAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(slug: string, cpfInput: string, telefoneFinalInput: string, ipAddress?: string) {
    const tenantId = await resolveTenantIdBySlug(this.prisma, slug);
    const cpf = onlyDigits(cpfInput || '');
    const telefoneFinal = onlyDigits(telefoneFinalInput || '');

    if (cpf.length < 11 || telefoneFinal.length !== 4) {
      throw new UnauthorizedException('CPF ou telefone inválidos.');
    }

    const leads = await this.prisma.lead.findMany({
      where: { tenantId, cpf: { not: null } },
      select: { id: true, cpf: true, telefone: true },
    });
    const matches = leads.filter(
      (l) => l.cpf && onlyDigits(l.cpf) === cpf && l.telefone && last4(l.telefone) === telefoneFinal,
    );

    if (matches.length === 0) {
      await this.audit.log({
        tenantId,
        action: 'PORTAL_FAMILIA_LOGIN_FAILED',
        resourceType: 'PreOcupacaoFamilia',
        ipAddress,
        metadata: { cpf: maskCpf(cpf) },
      });
      throw new UnauthorizedException('Acesso ainda não liberado. Procure a equipe de atendimento.');
    }

    const familias = await this.prisma.preOcupacaoFamilia.findMany({
      where: { tenantId, status: 'ATIVA', leadId: { in: matches.map((m) => m.id) } },
      include: { lead: { select: { nome: true, nomeCorreto: true, numero: true } } },
    });

    if (familias.length === 0) {
      await this.audit.log({
        tenantId,
        action: 'PORTAL_FAMILIA_LOGIN_FAILED',
        resourceType: 'PreOcupacaoFamilia',
        ipAddress,
        metadata: { cpf: maskCpf(cpf) },
      });
      throw new UnauthorizedException('Acesso ainda não liberado. Procure a equipe de atendimento.');
    }

    if (familias.length > 1) {
      this.logger.warn(`Login do portal encontrou múltiplas famílias ativas para o mesmo CPF+telefone (tenant ${tenantId}).`);
      await this.audit.log({
        tenantId,
        action: 'PORTAL_FAMILIA_LOGIN_FAILED',
        resourceType: 'PreOcupacaoFamilia',
        ipAddress,
        metadata: { cpf: maskCpf(cpf), motivo: 'CPF_DUPLICADO', familiaIds: familias.map((f) => f.id) },
      });
      throw new ConflictException('Não foi possível identificar seu cadastro de forma única. Procure a equipe de atendimento.');
    }

    const familia = familias[0];
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.preOcupacaoFamiliaSession.create({
      data: { jti, familiaId: familia.id, expiresAt },
    });

    const token = this.jwt.sign(
      { sub: familia.id, tenantId, jti, isFamiliaPortal: true },
      { expiresIn: '30d' },
    );

    await this.audit.log({
      tenantId,
      action: 'PORTAL_FAMILIA_LOGIN',
      resourceType: 'PreOcupacaoFamilia',
      resourceId: familia.id,
      ipAddress,
      metadata: { cpf: maskCpf(cpf) },
    });

    return {
      token,
      familia: {
        nome: familia.lead.nomeCorreto || familia.lead.nome,
        numero: familia.numero,
      },
    };
  }

  async logout(jti: string) {
    await this.prisma.preOcupacaoFamiliaSession.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async me(familiaId: string) {
    const familia = await this.prisma.preOcupacaoFamilia.findUnique({
      where: { id: familiaId },
      include: { lead: { select: { nome: true, nomeCorreto: true, numero: true } } },
    });
    if (!familia) throw new NotFoundException('Família não encontrada.');
    return {
      familia: { numero: familia.numero, status: familia.status },
      lead: { nome: familia.lead.nomeCorreto || familia.lead.nome, numero: familia.lead.numero },
    };
  }
}
