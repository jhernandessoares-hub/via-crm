import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { nome: string; slug: string }) {
    const slug = data.slug.trim().toLowerCase();

    if (!slug.match(/^[a-z0-9-]+$/)) {
      throw new BadRequestException('Slug inválido. Use letras minúsculas, números e hífen.');
    }

    return this.prisma.tenant.create({
      data: {
        nome: data.nome.trim(),
        slug,
      },
    });
  }

  async list() {
    return this.prisma.tenant.findMany({
      orderBy: { criadoEm: 'desc' },
    });
  }
}
