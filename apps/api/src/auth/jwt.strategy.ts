import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET não definido no .env'); })(),
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) throw new UnauthorizedException();

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId, ativo: true },
      select: { id: true, tenantId: true, email: true, role: true, branchId: true, nome: true },
    });

    if (!user) throw new UnauthorizedException('Sessão inválida ou usuário desativado.');

    return user;
  }
}
