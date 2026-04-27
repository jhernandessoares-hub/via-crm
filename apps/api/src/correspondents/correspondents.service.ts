import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class CorrespondentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async list() {
    return this.prisma.correspondent.findMany({ orderBy: { nome: 'asc' } });
  }

  async findOne(id: string) {
    const c = await this.prisma.correspondent.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Correspondente não encontrado');
    return c;
  }

  async create(body: any) {
    const exists = await this.prisma.correspondent.findUnique({ where: { email: body.email } });
    if (exists) throw new ConflictException('E-mail já cadastrado');

    const senhaHash = await bcrypt.hash(body.senha, 10);
    return this.prisma.correspondent.create({
      data: {
        nome:     body.nome,
        email:    body.email,
        telefone: body.telefone ?? null,
        empresa:  body.empresa ?? null,
        creci:    body.creci ?? null,
        senhaHash,
      },
    });
  }

  async update(id: string, body: any) {
    await this.findOne(id);
    const data: any = {
      nome:     body.nome,
      telefone: body.telefone,
      empresa:  body.empresa,
      creci:    body.creci,
      ativo:    body.ativo,
    };
    if (body.senha) data.senhaHash = await bcrypt.hash(body.senha, 10);
    return this.prisma.correspondent.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.correspondent.update({ where: { id }, data: { ativo: false } });
    return { ok: true };
  }

  async login(email: string, senha: string) {
    const c = await this.prisma.correspondent.findUnique({ where: { email } });
    if (!c || !c.ativo) throw new UnauthorizedException('Credenciais inválidas');
    const ok = await bcrypt.compare(senha, c.senhaHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const token = this.jwt.sign(
      { sub: c.id, isCorrespondent: true },
      { expiresIn: '8h' },
    );
    return { token, correspondent: { id: c.id, nome: c.nome, email: c.email, empresa: c.empresa } };
  }

  async me(id: string) {
    const c = await this.prisma.correspondent.findUnique({
      where: { id },
      select: { id: true, nome: true, email: true, empresa: true, telefone: true, creci: true },
    });
    if (!c) throw new NotFoundException('Correspondente não encontrado');
    return c;
  }
}
