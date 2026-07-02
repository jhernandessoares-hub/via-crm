import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface FamiliaPortalRequestContext {
  familiaId: string;
  tenantId: string;
  leadId: string;
  jti: string;
  nomeFamilia: string;
}

/**
 * Guard do portal de famílias — diferente do CorrespondentAuthGuard (stateless),
 * este faz lookup no banco a cada request (família ATIVA + sessão não revogada),
 * para permitir revogar acesso instantaneamente se o contrato for cancelado.
 */
@Injectable()
export class FamiliaAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Token não fornecido.');

    let payload: any;
    try {
      payload = this.jwt.verify(auth.replace('Bearer ', ''));
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    if (!payload?.isFamiliaPortal || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Token inválido.');
    }

    const session = await this.prisma.preOcupacaoFamiliaSession.findUnique({
      where: { jti: payload.jti },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.familiaId !== payload.sub) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    const familia = await this.prisma.preOcupacaoFamilia.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId, status: 'ATIVA' },
      select: { id: true, tenantId: true, leadId: true, lead: { select: { nome: true, nomeCorreto: true } } },
    });
    if (!familia) throw new UnauthorizedException('Acesso não disponível para esta família.');

    const context: FamiliaPortalRequestContext = {
      familiaId: familia.id,
      tenantId: familia.tenantId,
      leadId: familia.leadId,
      jti: payload.jti,
      nomeFamilia: familia.lead.nomeCorreto || familia.lead.nome,
    };
    req.familia = context;
    return true;
  }
}
