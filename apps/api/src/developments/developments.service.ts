import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevelopmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProduct(user: any, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: user.tenantId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  private async assertUnit(user: any, productId: string, unitId: string) {
    const unit = await this.prisma.developmentUnit.findFirst({
      where: { id: unitId, productId, tenantId: user.tenantId },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return unit;
  }

  private calcPrice(
    basePrice: number,
    floor: number,
    position: number,
    totalPositions: number,
    rules: any,
  ): number {
    let price = basePrice;
    if (rules?.floorIncrement) {
      price += (floor - 1) * rules.floorIncrement;
    }
    if (rules?.cornerPremium && (position === 1 || position === totalPositions)) {
      price += rules.cornerPremium;
    }
    return Math.round(price * 100) / 100;
  }

  async list(user: any, productId: string) {
    await this.assertProduct(user, productId);
    return this.prisma.developmentUnit.findMany({
      where: { productId, tenantId: user.tenantId },
      include: { lead: { select: { id: true, nome: true, nomeCorreto: true, telefone: true } } },
      orderBy: [{ tower: 'asc' }, { floor: 'asc' }, { number: 'asc' }],
    });
  }

  async findOne(user: any, productId: string, unitId: string) {
    return this.assertUnit(user, productId, unitId);
  }

  async create(user: any, productId: string, body: any) {
    await this.assertProduct(user, productId);
    return this.prisma.developmentUnit.create({
      data: {
        tenantId: user.tenantId,
        productId,
        tower: body.tower ?? null,
        floor: body.floor ?? null,
        number: body.number,
        areaM2: body.areaM2 ?? null,
        price: body.price ?? null,
        notes: body.notes ?? null,
        status: 'DISPONIVEL',
      },
    });
  }

  async bulkCreate(user: any, productId: string, body: any) {
    const product = await this.assertProduct(user, productId);
    const { tower, floors, unitsPerFloor, prefix, areaM2 } = body;
    const rules = (product as any).priceRules;
    const basePrice = rules?.basePrice ?? null;

    const units: any[] = [];
    for (let f = 1; f <= floors; f++) {
      for (let p = 1; p <= unitsPerFloor; p++) {
        const number = `${prefix ?? ''}${f}${String(p).padStart(2, '0')}`;
        const price =
          basePrice != null
            ? this.calcPrice(basePrice, f, p, unitsPerFloor, rules)
            : null;
        units.push({
          tenantId: user.tenantId,
          productId,
          tower: tower ?? null,
          floor: f,
          number,
          areaM2: areaM2 ?? null,
          price,
          status: 'DISPONIVEL',
        });
      }
    }

    await this.prisma.developmentUnit.createMany({ data: units });
    return { created: units.length };
  }

  async bulkCreateLots(user: any, productId: string, body: any) {
    const product = await this.assertProduct(user, productId);
    const { rows, cols, prefix, areaM2 } = body;
    const rules = (product as any).priceRules;
    const basePrice = rules?.basePrice ?? null;

    const total = rows * cols;
    const units: any[] = [];
    for (let i = 1; i <= total; i++) {
      units.push({
        tenantId: user.tenantId,
        productId,
        number: `${prefix ?? 'Lote'} ${i}`,
        areaM2: areaM2 ?? null,
        price: basePrice,
        status: 'DISPONIVEL',
      });
    }

    await this.prisma.developmentUnit.createMany({ data: units });
    return { created: units.length };
  }

  async update(user: any, productId: string, unitId: string, body: any) {
    await this.assertUnit(user, productId, unitId);
    return this.prisma.developmentUnit.update({
      where: { id: unitId },
      data: {
        tower: body.tower,
        floor: body.floor,
        number: body.number,
        areaM2: body.areaM2,
        price: body.price,
        notes: body.notes,
        status: body.status,
      },
    });
  }

  async sell(user: any, productId: string, unitId: string, body: any) {
    await this.assertUnit(user, productId, unitId);
    return this.prisma.developmentUnit.update({
      where: { id: unitId },
      data: {
        status: 'VENDIDO',
        leadId: body.leadId ?? null,
        buyerName: body.buyerName ?? null,
        soldAt: new Date(),
      },
    });
  }

  async reserve(user: any, productId: string, unitId: string, body: any) {
    await this.assertUnit(user, productId, unitId);
    return this.prisma.developmentUnit.update({
      where: { id: unitId },
      data: {
        status: 'RESERVADO',
        leadId: body.leadId ?? null,
        reservedAt: new Date(),
      },
    });
  }

  async release(user: any, productId: string, unitId: string) {
    await this.assertUnit(user, productId, unitId);
    return this.prisma.developmentUnit.update({
      where: { id: unitId },
      data: {
        status: 'DISPONIVEL',
        leadId: null,
        buyerName: null,
        soldAt: null,
        reservedAt: null,
      },
    });
  }

  async remove(user: any, productId: string, unitId: string) {
    await this.assertUnit(user, productId, unitId);
    await this.prisma.developmentUnit.delete({ where: { id: unitId } });
    return { ok: true };
  }

  async recalcPrices(user: any, productId: string) {
    const product = await this.assertProduct(user, productId);
    const rules = (product as any).priceRules;
    if (!rules?.basePrice) throw new BadRequestException('priceRules.basePrice não definido no produto');

    const units = await this.prisma.developmentUnit.findMany({
      where: { productId, tenantId: user.tenantId },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });

    const byFloor: Record<number, any[]> = {};
    for (const u of units) {
      const f = u.floor ?? 1;
      if (!byFloor[f]) byFloor[f] = [];
      byFloor[f].push(u);
    }

    const updates = units.map((u) => {
      const f = u.floor ?? 1;
      const floorUnits = byFloor[f] ?? [];
      const pos = floorUnits.findIndex((x) => x.id === u.id) + 1;
      const price = this.calcPrice(rules.basePrice, f, pos, floorUnits.length, rules);
      return this.prisma.developmentUnit.update({ where: { id: u.id }, data: { price } });
    });

    await Promise.all(updates);
    return { recalculated: units.length };
  }

  async updatePriceRules(user: any, productId: string, priceRules: any) {
    await this.assertProduct(user, productId);
    return this.prisma.product.update({
      where: { id: productId },
      data: { priceRules },
    });
  }
}
