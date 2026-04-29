import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class DevelopmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.development.findMany({
      where: { tenantId },
      include: { _count: { select: { towers: true, units: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const dev = await this.prisma.development.findFirst({
      where: { id, tenantId },
      include: {
        towers: { include: { units: true }, orderBy: { nome: 'asc' } },
        paymentCondition: true,
      },
    });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return dev;
  }

  async create(tenantId: string, data: any) {
    return this.prisma.development.create({
      data: {
        tenantId,
        nome: data.nome,
        tipo: data.tipo || 'VERTICAL',
        subtipo: data.subtipo || 'APARTAMENTO',
        status: data.status || 'LANCAMENTO',
        endereco: data.endereco,
        cidade: data.cidade,
        estado: data.estado,
        descricao: data.descricao,
        gridRows: data.gridRows || 10,
        gridCols: data.gridCols || 10,
      },
    });
  }

  async update(tenantId: string, id: string, data: any) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.development.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    await this.prisma.development.delete({ where: { id } });
    return { message: 'Empreendimento excluído' };
  }

  async getDashboard(tenantId: string, id: string) {
    const dev = await this.prisma.development.findFirst({
      where: { id, tenantId },
      include: { units: true },
    });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');

    const units = (dev as any).units || [];
    const total = units.length;
    const disponivel = units.filter((u: any) => u.status === 'DISPONIVEL').length;
    const reservado = units.filter((u: any) => u.status === 'RESERVADO').length;
    const vendido = units.filter((u: any) => u.status === 'VENDIDO').length;
    const bloqueado = units.filter((u: any) => u.status === 'BLOQUEADO').length;
    const vgvTotal = units.reduce((s: number, u: any) => s + (u.valorVenda || 0), 0);
    const vgvVendido = units.filter((u: any) => u.status === 'VENDIDO').reduce((s: number, u: any) => s + (u.finalPrice || u.valorVenda || 0), 0);
    const vgvReservado = units.filter((u: any) => u.status === 'RESERVADO').reduce((s: number, u: any) => s + (u.valorVenda || 0), 0);
    const vgvDisponivel = units.filter((u: any) => u.status === 'DISPONIVEL').reduce((s: number, u: any) => s + (u.valorVenda || 0), 0);
    const percentualVendido = total > 0 ? Math.round((vendido / total) * 100) : 0;
    const vso = total > 0 ? Math.round(((vendido + reservado) / total) * 100) : 0;

    const monthlyMap: Record<string, { mes: string; vendas: number; vgv: number }> = {};
    units.filter((u: any) => u.status === 'VENDIDO' && u.soldAt).forEach((u: any) => {
      const mes = new Date(u.soldAt).toISOString().slice(0, 7);
      if (!monthlyMap[mes]) monthlyMap[mes] = { mes, vendas: 0, vgv: 0 };
      monthlyMap[mes].vendas += 1;
      monthlyMap[mes].vgv += u.finalPrice || u.valorVenda || 0;
    });
    const monthly = Object.values(monthlyMap).sort((a, b) => a.mes.localeCompare(b.mes));

    return { total, disponivel, reservado, vendido, bloqueado, vgvTotal, vgvVendido, vgvReservado, vgvDisponivel, percentualVendido, vso, monthly };
  }

  async createTower(tenantId: string, developmentId: string, data: any) {
    const dev = await this.prisma.development.findFirst({ where: { id: developmentId, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.tower.create({
      data: { tenantId, developmentId, nome: data.nome, floors: data.floors || 1, unitsPerFloor: data.unitsPerFloor || 1 },
    });
  }

  async updateTower(tenantId: string, developmentId: string, towerId: string, data: any) {
    const tower = await this.prisma.tower.findFirst({ where: { id: towerId, developmentId, tenantId } });
    if (!tower) throw new NotFoundException('Torre não encontrada');
    return this.prisma.tower.update({ where: { id: towerId }, data });
  }

  async removeTower(tenantId: string, developmentId: string, towerId: string) {
    const tower = await this.prisma.tower.findFirst({ where: { id: towerId, developmentId, tenantId } });
    if (!tower) throw new NotFoundException('Torre não encontrada');
    await this.prisma.tower.delete({ where: { id: towerId } });
    return { message: 'Torre excluída' };
  }

  async bulkCreateUnits(tenantId: string, developmentId: string, towerId: string, data: { floors: number; unitsPerFloor: number; prefix?: string }) {
    const tower = await this.prisma.tower.findFirst({ where: { id: towerId, developmentId, tenantId } });
    if (!tower) throw new NotFoundException('Torre não encontrada');

    const prefix = data.prefix?.trim() || 'Apto';
    const units: any[] = [];
    for (let andar = 1; andar <= data.floors; andar++) {
      for (let pos = 1; pos <= data.unitsPerFloor; pos++) {
        const numero = `${andar}${pos.toString().padStart(2, '0')}`;
        units.push({ tenantId, developmentId, towerId, nome: `${prefix} ${numero}`, andar, posicao: pos, status: 'DISPONIVEL' });
      }
    }
    await this.prisma.developmentUnit.createMany({ data: units, skipDuplicates: true });
    return { message: `${units.length} unidades criadas` };
  }

  async bulkUpdateUnits(tenantId: string, developmentId: string, towerId: string, data: { andar?: number; updates: any }) {
    const tower = await this.prisma.tower.findFirst({ where: { id: towerId, developmentId, tenantId } });
    if (!tower) throw new NotFoundException('Torre não encontrada');
    const where: any = { towerId, tenantId, ...(data.andar !== undefined ? { andar: data.andar } : {}) };
    await this.prisma.developmentUnit.updateMany({ where, data: data.updates });
    return { message: 'Unidades atualizadas' };
  }

  async updateUnit(tenantId: string, developmentId: string, unitId: string, data: any) {
    const unit = await this.prisma.developmentUnit.findFirst({ where: { id: unitId, developmentId, tenantId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return this.prisma.developmentUnit.update({ where: { id: unitId }, data });
  }

  async getPaymentCondition(tenantId: string, developmentId: string) {
    const dev = await this.prisma.development.findFirst({ where: { id: developmentId, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.developmentPaymentCondition.findUnique({ where: { developmentId } });
  }

  async upsertPaymentCondition(tenantId: string, developmentId: string, data: any) {
    const dev = await this.prisma.development.findFirst({ where: { id: developmentId, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.developmentPaymentCondition.upsert({
      where: { developmentId },
      create: { tenantId, developmentId, ...data },
      update: data,
    });
  }

  async updateGrid(tenantId: string, id: string, data: { gridRows: number; gridCols: number; gridLayout: any }) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.development.update({ where: { id }, data: { gridRows: data.gridRows, gridCols: data.gridCols, gridLayout: data.gridLayout } as any });
  }

  async uploadImplantationImage(tenantId: string, id: string, file: any) {
    if (!file?.buffer) throw new BadRequestException('Arquivo inválido');
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');

    const url = await new Promise<string>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `via-crm/developments/${tenantId}`, resource_type: 'image' },
        (err, res) => { if (err) return reject(err); resolve(res!.secure_url); },
      ).end(file.buffer);
    });

    return this.prisma.development.update({ where: { id }, data: { implantationImageUrl: url } as any });
  }
}
