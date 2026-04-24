import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevelopmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertDevelopment(tenantId: string, id: string) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return dev;
  }

  private async assertTower(tenantId: string, developmentId: string, towerId: string) {
    const tower = await this.prisma.tower.findFirst({ where: { id: towerId, developmentId, tenantId } });
    if (!tower) throw new NotFoundException('Torre não encontrada');
    return tower;
  }

  private async assertUnit(tenantId: string, developmentId: string, unitId: string) {
    const unit = await this.prisma.developmentUnit.findFirst({ where: { id: unitId, developmentId, tenantId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return unit;
  }

  // ── Developments ──────────────────────────────────────────────────────────

  async list(tenantId: string) {
    return this.prisma.development.findMany({
      where: { tenantId },
      include: {
        towers: { include: { _count: { select: { units: true } } } },
        _count: { select: { units: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const dev = await this.prisma.development.findFirst({
      where: { id, tenantId },
      include: {
        towers: {
          orderBy: { nome: 'asc' },
          include: {
            units: { orderBy: [{ andar: 'asc' }, { posicao: 'asc' }] },
          },
        },
      },
    });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return dev;
  }

  async create(tenantId: string, body: any) {
    return this.prisma.development.create({
      data: {
        tenantId,
        nome: body.nome,
        tipo: body.tipo,
        subtipo: body.subtipo,
        endereco: body.endereco ?? null,
        cidade: body.cidade ?? null,
        estado: body.estado ?? null,
        sunOrientation: body.sunOrientation ?? 'LESTE',
        prazoEntrega: body.prazoEntrega ? new Date(body.prazoEntrega) : null,
        status: body.status ?? 'LANCAMENTO',
        gridRows: body.gridRows ?? 10,
        gridCols: body.gridCols ?? 10,
        gridLayout: body.gridLayout ?? null,
        descricao: body.descricao ?? null,
      },
    });
  }

  async update(tenantId: string, id: string, body: any) {
    await this.assertDevelopment(tenantId, id);
    return this.prisma.development.update({
      where: { id },
      data: {
        nome: body.nome,
        tipo: body.tipo,
        subtipo: body.subtipo,
        endereco: body.endereco,
        cidade: body.cidade,
        estado: body.estado,
        sunOrientation: body.sunOrientation,
        prazoEntrega: body.prazoEntrega ? new Date(body.prazoEntrega) : undefined,
        status: body.status,
        gridRows: body.gridRows,
        gridCols: body.gridCols,
        gridLayout: body.gridLayout,
        descricao: body.descricao,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.assertDevelopment(tenantId, id);
    await this.prisma.development.delete({ where: { id } });
    return { ok: true };
  }

  // ── Torres ────────────────────────────────────────────────────────────────

  async createTower(tenantId: string, developmentId: string, body: any) {
    await this.assertDevelopment(tenantId, developmentId);
    return this.prisma.tower.create({
      data: {
        tenantId,
        developmentId,
        nome: body.nome,
        floors: body.floors ?? 1,
        unitsPerFloor: body.unitsPerFloor ?? 1,
        gridX: body.gridX ?? null,
        gridY: body.gridY ?? null,
      },
    });
  }

  async updateTower(tenantId: string, developmentId: string, towerId: string, body: any) {
    await this.assertTower(tenantId, developmentId, towerId);
    return this.prisma.tower.update({
      where: { id: towerId },
      data: {
        nome: body.nome,
        floors: body.floors,
        unitsPerFloor: body.unitsPerFloor,
        gridX: body.gridX,
        gridY: body.gridY,
      },
    });
  }

  async removeTower(tenantId: string, developmentId: string, towerId: string) {
    await this.assertTower(tenantId, developmentId, towerId);
    await this.prisma.tower.delete({ where: { id: towerId } });
    return { ok: true };
  }

  // ── Unidades ──────────────────────────────────────────────────────────────

  async bulkCreateUnits(tenantId: string, developmentId: string, towerId: string, body: any) {
    await this.assertTower(tenantId, developmentId, towerId);
    const { floors, unitsPerFloor, prefix, areaM2, quartos, suites, banheiros, vagas, valorVenda, valorAvaliado } = body;

    const units: any[] = [];
    for (let f = 1; f <= floors; f++) {
      for (let p = 1; p <= unitsPerFloor; p++) {
        const nome = `${prefix ?? ''}${f}${String(p).padStart(2, '0')}`;
        units.push({
          tenantId,
          developmentId,
          towerId,
          nome,
          andar: f,
          posicao: p,
          status: 'DISPONIVEL',
          areaM2: areaM2 ?? null,
          quartos: quartos ?? null,
          suites: suites ?? null,
          banheiros: banheiros ?? null,
          vagas: vagas ?? null,
          valorVenda: valorVenda ?? null,
          valorAvaliado: valorAvaliado ?? null,
        });
      }
    }

    await this.prisma.developmentUnit.createMany({ data: units });
    return { created: units.length };
  }

  async bulkCreateLots(tenantId: string, developmentId: string, towerId: string, body: any) {
    await this.assertTower(tenantId, developmentId, towerId);
    const { total, prefix, areaM2, valorVenda } = body;

    const units = Array.from({ length: total }, (_, i) => ({
      tenantId,
      developmentId,
      towerId,
      nome: `${prefix ?? 'Lote'} ${i + 1}`,
      posicao: i + 1,
      status: 'DISPONIVEL',
      areaM2: areaM2 ?? null,
      valorVenda: valorVenda ?? null,
    }));

    await this.prisma.developmentUnit.createMany({ data: units });
    return { created: units.length };
  }

  async updateUnit(tenantId: string, developmentId: string, unitId: string, body: any) {
    await this.assertUnit(tenantId, developmentId, unitId);

    if (body.status === 'BLOQUEADO' && !body.bloqueioMotivo) {
      throw new ForbiddenException('Informe o motivo do bloqueio');
    }

    return this.prisma.developmentUnit.update({
      where: { id: unitId },
      data: {
        nome: body.nome,
        status: body.status,
        bloqueioMotivo: body.bloqueioMotivo ?? null,
        areaM2: body.areaM2,
        quartos: body.quartos,
        suites: body.suites,
        banheiros: body.banheiros,
        vagas: body.vagas,
        valorVenda: body.valorVenda,
        valorAvaliado: body.valorAvaliado,
      },
    });
  }

  async bulkUpdateUnits(tenantId: string, developmentId: string, towerId: string, body: any) {
    await this.assertTower(tenantId, developmentId, towerId);
    const { andar, updates } = body;

    const units = await this.prisma.developmentUnit.findMany({
      where: { towerId, developmentId, tenantId, ...(andar != null ? { andar } : {}) },
    });

    await Promise.all(
      units.map((u) =>
        this.prisma.developmentUnit.update({
          where: { id: u.id },
          data: updates,
        }),
      ),
    );

    return { updated: units.length };
  }

  async removeUnit(tenantId: string, developmentId: string, unitId: string) {
    await this.assertUnit(tenantId, developmentId, unitId);
    await this.prisma.developmentUnit.delete({ where: { id: unitId } });
    return { ok: true };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async dashboard(tenantId: string, developmentId: string) {
    await this.assertDevelopment(tenantId, developmentId);

    const units = await this.prisma.developmentUnit.findMany({
      where: { developmentId, tenantId },
    });

    const total = units.length;
    const disponivel = units.filter((u) => u.status === 'DISPONIVEL').length;
    const reservado = units.filter((u) => u.status === 'RESERVADO').length;
    const vendido = units.filter((u) => u.status === 'VENDIDO').length;
    const bloqueado = units.filter((u) => u.status === 'BLOQUEADO').length;

    const vgvTotal = units.reduce((s, u) => s + (u.valorVenda ?? 0), 0);
    const vgvVendido = units.filter((u) => u.status === 'VENDIDO').reduce((s, u) => s + (u.valorVenda ?? 0), 0);
    const vgvDisponivel = units.filter((u) => u.status === 'DISPONIVEL').reduce((s, u) => s + (u.valorVenda ?? 0), 0);

    return {
      total, disponivel, reservado, vendido, bloqueado,
      vgvTotal, vgvVendido, vgvDisponivel,
      percentualVendido: total > 0 ? Math.round((vendido / total) * 100) : 0,
    };
  }
}
