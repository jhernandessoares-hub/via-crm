import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class DevelopmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, role?: string) {
    // Não-OWNER só vê empreendimentos publicados
    const where: any = { tenantId };
    if (role && role !== 'OWNER') where.publishedAt = { not: null };
    return this.prisma.development.findMany({
      where,
      include: {
        _count: { select: { towers: true, units: true } },
        towers: { include: { units: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string, role?: string) {
    const dev = await this.prisma.development.findFirst({
      where: { id, tenantId },
      include: {
        towers: {
          include: {
            units: {
              include: { lead: { select: { id: true, nome: true, nomeCorreto: true } } },
            },
          },
          orderBy: { nome: 'asc' },
        },
        paymentCondition: true,
      },
    });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    // Não-OWNER não pode ver rascunho
    if (role && role !== 'OWNER' && !(dev as any).publishedAt) {
      throw new NotFoundException('Empreendimento não encontrado');
    }
    return dev;
  }

  async publish(tenantId: string, id: string) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.development.update({
      where: { id },
      data: { publishedAt: new Date() } as any,
    });
  }

  async unpublish(tenantId: string, id: string) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.development.update({
      where: { id },
      data: { publishedAt: null } as any,
    });
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
        sunOrientation: data.sunOrientation || 'LESTE',
        prazoEntrega: data.prazoEntrega?.trim() ? new Date(data.prazoEntrega) : undefined,
        lat: data.lat != null && data.lat !== '' ? Number(data.lat) : null,
        lng: data.lng != null && data.lng !== '' ? Number(data.lng) : null,
        gridRows: data.gridRows ? Number(data.gridRows) : 10,
        gridCols: data.gridCols ? Number(data.gridCols) : 10,
      },
    });
  }

  async update(tenantId: string, id: string, data: any) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');

    // Monta explicitamente apenas os campos conhecidos pelo schema Prisma
    // (evita Internal Server Error quando campos novos ainda não foram gerados no client)
    const safeNum = (v: any) => (v != null && v !== '') ? Number(v) : null;
    const safeStr = (v: any) => (v != null ? String(v) : null);

    const updateData: any = {};

    if (data.nome !== undefined)        updateData.nome        = data.nome;
    if (data.tipo !== undefined)        updateData.tipo        = data.tipo;
    if (data.subtipo !== undefined)     updateData.subtipo     = data.subtipo;
    if (data.status !== undefined)      updateData.status      = data.status;
    if (data.descricao !== undefined)   updateData.descricao   = data.descricao;
    if (data.sunOrientation !== undefined) updateData.sunOrientation = data.sunOrientation;
    if (data.endereco !== undefined)    updateData.endereco    = data.endereco;
    if (data.cidade !== undefined)      updateData.cidade      = data.cidade;
    if (data.estado !== undefined)      updateData.estado      = data.estado;
    if (data.gridRows !== undefined)    updateData.gridRows    = Number(data.gridRows);
    if (data.gridCols !== undefined)    updateData.gridCols    = Number(data.gridCols);
    if (data.gridLayout !== undefined)  updateData.gridLayout  = data.gridLayout;
    if (data.lat !== undefined)         updateData.lat         = safeNum(data.lat);
    if (data.lng !== undefined)         updateData.lng         = safeNum(data.lng);
    if (data.prazoEntrega !== undefined) {
      updateData.prazoEntrega = data.prazoEntrega?.trim() ? new Date(data.prazoEntrega) : null;
    }

    // Campos adicionados no rebuild — requerem prisma generate para funcionar.
    // Se o Prisma client ainda não os conhece, são ignorados silenciosamente.
    const prismaHasNewFields = 'entranceLat' in (this.prisma.development.fields ?? {});
    if (prismaHasNewFields || true) {
      // Tentamos sempre — o try/catch no bloco abaixo protege contra client desatualizado
      if (data.entranceLat !== undefined)   updateData.entranceLat   = safeNum(data.entranceLat);
      if (data.entranceLng !== undefined)   updateData.entranceLng   = safeNum(data.entranceLng);
      if (data.implantacaoMode !== undefined) {
        const m = safeStr(data.implantacaoMode)?.toUpperCase();
        updateData.implantacaoMode = (m === 'SATELITE' || m === 'IMAGEM') ? m : null;
      }
      if (data.terrainDesign !== undefined) updateData.terrainDesign = data.terrainDesign;
      if (data.areasComuns !== undefined) updateData.areasComuns = data.areasComuns;
    }

    try {
      return await this.prisma.development.update({ where: { id }, data: updateData });
    } catch (e: any) {
      // Se o Prisma client ainda não conhece os campos novos, tenta sem eles
      if (e?.message?.includes('Unknown field') || e?.code === 'P2009') {
        const { entranceLat, entranceLng, implantacaoMode, terrainDesign, publishedAt, areasComuns, ...safeData } = updateData;
        return await this.prisma.development.update({ where: { id }, data: safeData });
      }
      throw e;
    }
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
      data: {
        tenantId,
        developmentId,
        nome: data.nome || 'Nova Torre',
        floors: data.floors ? Number(data.floors) : 1,
        unitsPerFloor: data.unitsPerFloor ? Number(data.unitsPerFloor) : 1,
        gridX: data.gridX != null ? Number(data.gridX) : null,
        gridY: data.gridY != null ? Number(data.gridY) : null,
        gridWidth: data.gridWidth != null ? Number(data.gridWidth) : 1,
        gridHeight: data.gridHeight != null ? Number(data.gridHeight) : 1,
        larguraM: data.larguraM != null ? Number(data.larguraM) : 20,
        profundidadeM: data.profundidadeM != null ? Number(data.profundidadeM) : 15,
        alturaAndarM: data.alturaAndarM != null ? Number(data.alturaAndarM) : 3.0,
        rotacao: data.rotacao != null ? Number(data.rotacao) : 0,
        offsetX: data.offsetX != null ? Number(data.offsetX) : 0,
        offsetY: data.offsetY != null ? Number(data.offsetY) : 0,
        lados: data.lados ?? 'FRENTE,FUNDO,ESQUERDA,DIREITA',
        facadeImageUrl: data.facadeImageUrl,
        roofType: data.roofType ?? 'PLANO',
        roofColor: data.roofColor,
        facadeColor: data.facadeColor ?? '#e5e7eb',
        balconyType: data.balconyType ?? 'NONE',
        floorPlan: data.floorPlan ?? undefined,
        hasLobbyFloor: data.terreoConfig === 'SEM_APTO' || (data.terreoConfig == null && data.hasLobbyFloor),
        terreoConfig: data.terreoConfig ?? 'NUMERICO',
        terreoLabelText: data.terreoLabelText != null ? String(data.terreoLabelText) : 'T',
        implantacaoX: data.implantacaoX != null && data.implantacaoX !== '' ? Number(data.implantacaoX) : null,
        implantacaoY: data.implantacaoY != null && data.implantacaoY !== '' ? Number(data.implantacaoY) : null,
        implantacaoW: data.implantacaoW != null && data.implantacaoW !== '' ? Number(data.implantacaoW) : null,
        implantacaoH: data.implantacaoH != null && data.implantacaoH !== '' ? Number(data.implantacaoH) : null,
        implantacaoLat: data.implantacaoLat != null && data.implantacaoLat !== '' ? Number(data.implantacaoLat) : null,
        implantacaoLng: data.implantacaoLng != null && data.implantacaoLng !== '' ? Number(data.implantacaoLng) : null,
        fasesConfig: data.fasesConfig ?? null,
        subsolos: data.subsolos != null ? Number(data.subsolos) : 0,
        ladoConfig: data.ladoConfig ?? null,
        floorUnitsConfig: data.floorUnitsConfig ?? null,
        posicaoPad: data.posicaoPad != null ? Math.max(1, Math.min(4, Number(data.posicaoPad))) : 2,
        posicaoFinalMap: Array.isArray(data.posicaoFinalMap) ? data.posicaoFinalMap : null,
        prefixoUnidade: data.prefixoUnidade != null ? String(data.prefixoUnidade) : '',
        andarInicialContagem: data.andarInicialContagem ?? 'PRIMEIRO_PAV',
        andarInicialDisplay: data.andarInicialDisplay != null ? Number(data.andarInicialDisplay) : 1,
        subsoloDisplay: data.subsoloDisplay ?? 'PREFIXO_S',
      },
    });
  }

  async updateTower(tenantId: string, developmentId: string, towerId: string, data: any) {
    const tower = await this.prisma.tower.findFirst({ where: { id: towerId, developmentId, tenantId } });
    if (!tower) throw new NotFoundException('Torre não encontrada');

    const n  = (v: any) => (v != null && v !== '') ? Number(v) : undefined;
    const nn = (v: any) => (v != null && v !== '') ? Number(v) : null;

    // Monta explicitamente apenas campos conhecidos pelo schema Prisma
    // (evita PrismaClientValidationError quando o client está desatualizado)
    const updateData: any = {};
    if (data.nome          !== undefined) updateData.nome          = String(data.nome);
    if (data.floors        !== undefined) updateData.floors        = n(data.floors) ?? 1;
    if (data.unitsPerFloor !== undefined) updateData.unitsPerFloor = n(data.unitsPerFloor) ?? 1;
    if (data.larguraM      !== undefined) updateData.larguraM      = n(data.larguraM) ?? 20;
    if (data.profundidadeM !== undefined) updateData.profundidadeM = n(data.profundidadeM) ?? 15;
    if (data.alturaAndarM  !== undefined) updateData.alturaAndarM  = n(data.alturaAndarM) ?? 3;
    if (data.rotacao       !== undefined) updateData.rotacao       = n(data.rotacao) ?? 0;
    if (data.offsetX       !== undefined) updateData.offsetX       = n(data.offsetX) ?? 0;
    if (data.offsetY       !== undefined) updateData.offsetY       = n(data.offsetY) ?? 0;
    if (data.gridX         !== undefined) updateData.gridX         = nn(data.gridX);
    if (data.gridY         !== undefined) updateData.gridY         = nn(data.gridY);
    if (data.gridWidth     !== undefined) updateData.gridWidth     = nn(data.gridWidth);
    if (data.gridHeight    !== undefined) updateData.gridHeight    = nn(data.gridHeight);
    if (data.lados         !== undefined) updateData.lados         = String(data.lados);
    if (data.facadeColor   !== undefined) updateData.facadeColor   = data.facadeColor ?? null;
    if (data.facadeImageUrl !== undefined) updateData.facadeImageUrl = data.facadeImageUrl ?? null;
    if (data.roofType      !== undefined) updateData.roofType      = data.roofType ?? null;
    if (data.roofColor     !== undefined) updateData.roofColor     = data.roofColor ?? null;
    if (data.balconyType   !== undefined) updateData.balconyType   = data.balconyType ?? null;
    if (data.terreoConfig   !== undefined) {
      updateData.terreoConfig   = data.terreoConfig;
      updateData.hasLobbyFloor  = data.terreoConfig === 'SEM_APTO';
    } else if (data.hasLobbyFloor !== undefined) {
      updateData.hasLobbyFloor = Boolean(data.hasLobbyFloor);
    }
    if (data.terreoLabelText !== undefined) updateData.terreoLabelText = String(data.terreoLabelText ?? 'T');
    if (data.floorPlan     !== undefined) updateData.floorPlan     = data.floorPlan ?? null;
    for (const k of ['implantacaoX','implantacaoY','implantacaoW','implantacaoH','implantacaoLat','implantacaoLng'] as const) {
      if (data[k] !== undefined) updateData[k] = nn(data[k]);
    }
    if (data.ladoConfig        !== undefined) updateData.ladoConfig        = data.ladoConfig ?? null;
    if (data.subsolos          !== undefined) updateData.subsolos          = n(data.subsolos) ?? 0;
    if (data.floorUnitsConfig  !== undefined) updateData.floorUnitsConfig  = data.floorUnitsConfig ?? null;
    if (data.fasesConfig            !== undefined) updateData.fasesConfig            = data.fasesConfig ?? null;
    if (data.posicaoPad             !== undefined) updateData.posicaoPad             = data.posicaoPad != null ? Math.max(1, Math.min(4, Number(data.posicaoPad))) : 2;
    if (data.posicaoFinalMap        !== undefined) updateData.posicaoFinalMap        = Array.isArray(data.posicaoFinalMap) ? data.posicaoFinalMap : null;
    if (data.prefixoUnidade         !== undefined) updateData.prefixoUnidade         = String(data.prefixoUnidade ?? '');
    if (data.andarInicialContagem   !== undefined) updateData.andarInicialContagem   = data.andarInicialContagem;
    if (data.andarInicialDisplay    !== undefined) updateData.andarInicialDisplay    = Number(data.andarInicialDisplay);
    if (data.subsoloDisplay         !== undefined) updateData.subsoloDisplay         = data.subsoloDisplay;

    return this.prisma.tower.update({ where: { id: towerId }, data: updateData });
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

    const units: any[] = [];
    const floorsNum = Number(data.floors) || 1;
    const unitsPerFloorNum = Number(data.unitsPerFloor) || 1;
    const pad = Math.max(1, Math.min(4, Number((tower as any).posicaoPad ?? 2)));
    const fmt = (n: number) => n.toString().padStart(pad, '0');
    const finalMap: number[] | null = Array.isArray((tower as any).posicaoFinalMap) ? (tower as any).posicaoFinalMap as number[] : null;
    const getFinal = (globalPos: number) => finalMap ? (finalMap[globalPos - 1] ?? globalPos) : globalPos;

    // Configurações de numeração
    const prefixo = ((tower as any).prefixoUnidade ?? '').trim();
    const contagem: string = (tower as any).andarInicialContagem ?? 'PRIMEIRO_PAV';
    const iniDisplay: number = Number((tower as any).andarInicialDisplay ?? 1);
    const subsoloMode: string = (tower as any).subsoloDisplay ?? 'PREFIXO_S';
    // terreoConfig: "SEM_APTO" | "NUMERICO" | "TERREO_LABEL" — fallback para hasLobbyFloor legado
    const terreoConfig: string = (tower as any).terreoConfig ?? ((tower as any).hasLobbyFloor ? 'SEM_APTO' : 'NUMERICO');
    const terreoLabelText: string = (((tower as any).terreoLabelText ?? 'T').trim()) || 'T';
    const hasLobby = terreoConfig === 'SEM_APTO';
    const buildNome = (internalAndar: number, pos: number, maxSubsolosCount: number): string => {
      const suffix = fmt(getFinal(pos));
      let displayStr: string;
      if (internalAndar < 0) {
        const s = -internalAndar;
        if (contagem === 'SUBSOLO') {
          displayStr = (iniDisplay + maxSubsolosCount - s).toString();
        } else if (subsoloMode === 'PREFIXO_S') {
          displayStr = `S${s}`;
        } else {
          displayStr = (iniDisplay - s - (contagem === 'PRIMEIRO_PAV' ? 1 : 0)).toString();
        }
      } else {
        // Andares normais (>= 1)
        if (terreoConfig === 'TERREO_LABEL' && contagem !== 'SUBSOLO') {
          // Andar 1 = label textual; andares acima começam em iniDisplay
          displayStr = internalAndar === 1 ? terreoLabelText : (iniDisplay + internalAndar - 2).toString();
        } else if (contagem === 'SUBSOLO') {
          displayStr = (iniDisplay + maxSubsolosCount + (hasLobby ? 1 : 0) + internalAndar - 1).toString();
        } else if (contagem === 'TERREO') {
          displayStr = (iniDisplay + internalAndar - (hasLobby ? 0 : 1)).toString();
        } else {
          // PRIMEIRO_PAV / NUMERICO
          displayStr = (iniDisplay + internalAndar - 1).toString();
        }
      }
      return prefixo ? `${prefixo} ${displayStr}${suffix}` : `${displayStr}${suffix}`;
    };

    type FaseConfig = { nome: string; unidades: number; subsolos: number; excludedSlots?: { andar: number; localPos: number }[] };
    const fases = (tower as any).fasesConfig as FaseConfig[] | null;

    if (fases && fases.length > 0) {
      let posOffset = 0;
      const faseRanges = fases.map((f) => {
        const posStart = posOffset + 1;
        posOffset += f.unidades;
        return { ...f, posStart, posEnd: posOffset };
      });
      const maxSubsolos = Math.max(...fases.map((f) => f.subsolos));

      for (let s = maxSubsolos; s >= 1; s--) {
        const andar = -s;
        for (const fase of faseRanges) {
          if (fase.subsolos < s) continue;
          for (let pos = fase.posStart; pos <= fase.posEnd; pos++) {
            const localPos = pos - fase.posStart + 1;
            if ((fase.excludedSlots ?? []).some((sl) => sl.andar === andar && sl.localPos === localPos)) continue;
            units.push({ tenantId, developmentId, towerId, nome: buildNome(andar, pos, maxSubsolos), andar, posicao: pos, status: 'DISPONIVEL' });
          }
        }
      }

      for (let andar = 1; andar <= floorsNum; andar++) {
        for (const fase of faseRanges) {
          for (let pos = fase.posStart; pos <= fase.posEnd; pos++) {
            const localPos = pos - fase.posStart + 1;
            if ((fase.excludedSlots ?? []).some((sl) => sl.andar === andar && sl.localPos === localPos)) continue;
            units.push({ tenantId, developmentId, towerId, nome: buildNome(andar, pos, maxSubsolos), andar, posicao: pos, status: 'DISPONIVEL' });
          }
        }
      }
    } else {
      // fallback legado (sem fasesConfig)
      const subsolos = Number((tower as any).subsolos ?? 0);
      const floorUnitsConfig: Record<string, number> = ((tower as any).floorUnitsConfig as any) ?? {};
      const unitsForFloor = (andar: number) => floorUnitsConfig[String(andar)] ?? unitsPerFloorNum;

      for (let s = subsolos; s >= 1; s--) {
        const andar = -s;
        for (let pos = 1; pos <= unitsForFloor(andar); pos++) {
          units.push({ tenantId, developmentId, towerId, nome: buildNome(andar, pos, subsolos), andar, posicao: pos, status: 'DISPONIVEL' });
        }
      }
      for (let andar = 1; andar <= floorsNum; andar++) {
        for (let pos = 1; pos <= unitsForFloor(andar); pos++) {
          units.push({ tenantId, developmentId, towerId, nome: buildNome(andar, pos, subsolos), andar, posicao: pos, status: 'DISPONIVEL' });
        }
      }
    }

    await this.prisma.developmentUnit.createMany({ data: units, skipDuplicates: true });
    return { message: `${units.length} unidades criadas` };
  }

  async bulkUpdateUnits(tenantId: string, developmentId: string, towerId: string, data: { andar?: number; posicaoMin?: number; posicaoMax?: number; updates: any }) {
    const tower = await this.prisma.tower.findFirst({ where: { id: towerId, developmentId, tenantId } });
    if (!tower) throw new NotFoundException('Torre não encontrada');
    const where: any = { towerId, tenantId };
    if (data.andar !== undefined) where.andar = Number(data.andar);
    if (data.posicaoMin !== undefined || data.posicaoMax !== undefined) {
      where.posicao = {};
      if (data.posicaoMin !== undefined) where.posicao.gte = Number(data.posicaoMin);
      if (data.posicaoMax !== undefined) where.posicao.lte = Number(data.posicaoMax);
    }

    const updates = { ...data.updates };
    for (const f of ['areaM2', 'quartos', 'suites', 'banheiros', 'vagas', 'valorVenda', 'valorAvaliado', 'finalPrice']) {
      if (updates[f] !== undefined) updates[f] = updates[f] != null && updates[f] !== '' ? Number(updates[f]) : null;
    }

    await this.prisma.developmentUnit.updateMany({ where, data: updates });
    return { message: 'Unidades atualizadas' };
  }

  async bulkUpdateUnitsIndividual(tenantId: string, developmentId: string, units: Array<{ id: string; [key: string]: any }>) {
    const numericFields = ['areaM2', 'quartos', 'suites', 'banheiros', 'vagas', 'valorVenda', 'valorAvaliado'];
    await this.prisma.$transaction(
      units.map(({ id, ...raw }) => {
        const data: any = {};
        for (const f of numericFields) {
          if (raw[f] !== undefined) data[f] = raw[f] != null && raw[f] !== '' ? Number(raw[f]) : null;
        }
        return this.prisma.developmentUnit.updateMany({ where: { id, developmentId, tenantId }, data });
      }),
    );
    return { updated: units.length };
  }

  async updateUnit(tenantId: string, developmentId: string, unitId: string, data: any) {
    const unit = await this.prisma.developmentUnit.findFirst({ where: { id: unitId, developmentId, tenantId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    
    const updateData = { ...data };
    if (updateData.areaM2 !== undefined) updateData.areaM2 = updateData.areaM2 != null && updateData.areaM2 !== '' ? Number(updateData.areaM2) : null;
    if (updateData.quartos !== undefined) updateData.quartos = updateData.quartos != null && updateData.quartos !== '' ? Number(updateData.quartos) : null;
    if (updateData.suites !== undefined) updateData.suites = updateData.suites != null && updateData.suites !== '' ? Number(updateData.suites) : null;
    if (updateData.banheiros !== undefined) updateData.banheiros = updateData.banheiros != null && updateData.banheiros !== '' ? Number(updateData.banheiros) : null;
    if (updateData.vagas !== undefined) updateData.vagas = updateData.vagas != null && updateData.vagas !== '' ? Number(updateData.vagas) : null;
    if (updateData.valorVenda !== undefined) updateData.valorVenda = updateData.valorVenda != null && updateData.valorVenda !== '' ? Number(updateData.valorVenda) : null;
    if (updateData.valorAvaliado !== undefined) updateData.valorAvaliado = updateData.valorAvaliado != null && updateData.valorAvaliado !== '' ? Number(updateData.valorAvaliado) : null;
    if (updateData.finalPrice !== undefined) updateData.finalPrice = updateData.finalPrice != null && updateData.finalPrice !== '' ? Number(updateData.finalPrice) : null;
    if (updateData.loteAreaM2 !== undefined) updateData.loteAreaM2 = updateData.loteAreaM2 != null && updateData.loteAreaM2 !== '' ? Number(updateData.loteAreaM2) : null;
    if (updateData.loteFrente !== undefined) updateData.loteFrente = updateData.loteFrente != null && updateData.loteFrente !== '' ? Number(updateData.loteFrente) : null;
    if (updateData.loteFundo !== undefined) updateData.loteFundo = updateData.loteFundo != null && updateData.loteFundo !== '' ? Number(updateData.loteFundo) : null;
    // leadId é passado como string UUID ou null — sem conversão necessária
    if (updateData.leadId !== undefined) updateData.leadId = updateData.leadId || null;
    // nunca persistir o objeto lead embutido (apenas o leadId FK)
    delete updateData.lead;

    return this.prisma.developmentUnit.update({ where: { id: unitId }, data: updateData });
  }

  async getPaymentCondition(tenantId: string, developmentId: string) {
    const dev = await this.prisma.development.findFirst({ where: { id: developmentId, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.developmentPaymentCondition.findUnique({ where: { developmentId } });
  }

  async upsertPaymentCondition(tenantId: string, developmentId: string, data: any) {
    const dev = await this.prisma.development.findFirst({ where: { id: developmentId, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    
    const payload = {
      aceitaFinanciamento: data.aceitaFinanciamento ?? true,
      valorAto: data.valorAto != null && data.valorAto !== '' ? Number(data.valorAto) : null,
      entradaPercentual: data.entradaPercentual != null && data.entradaPercentual !== '' ? Number(data.entradaPercentual) : null,
      entradaParcelas: data.entradaParcelas != null && data.entradaParcelas !== '' ? Number(data.entradaParcelas) : null,
      descontoAVista: data.descontoAVista != null && data.descontoAVista !== '' ? Number(data.descontoAVista) : null,
      financiamentoBase: data.financiamentoBase,
      financiamentoPercentual: data.financiamentoPercentual != null && data.financiamentoPercentual !== '' ? Number(data.financiamentoPercentual) : null,
      proSoluto: data.proSoluto ?? false,
      proSolutoPercentual: data.proSolutoPercentual != null && data.proSolutoPercentual !== '' ? Number(data.proSolutoPercentual) : null,
      proSolutoParcelas: data.proSolutoParcelas != null && data.proSolutoParcelas !== '' ? Number(data.proSolutoParcelas) : null,
      obs: data.obs,
    };

    return this.prisma.developmentPaymentCondition.upsert({
      where: { developmentId },
      create: { tenantId, developmentId, ...payload },
      update: payload,
    });
  }

  async updateGrid(tenantId: string, id: string, data: { gridRows: number; gridCols: number; gridLayout: any }) {
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');
    return this.prisma.development.update({ where: { id }, data: { 
      gridRows: Number(data.gridRows), 
      gridCols: Number(data.gridCols), 
      gridLayout: data.gridLayout 
    } as any });
  }

  async uploadModel(tenantId: string, id: string, file: any) {
    if (!file?.buffer) throw new BadRequestException('Arquivo inválido');
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');

    if ((dev as any).modelPublicId) {
      await cloudinary.uploader.destroy((dev as any).modelPublicId, { resource_type: 'raw' }).catch(() => {});
    }

    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `via-crm/developments/${tenantId}/models`, resource_type: 'raw' },
        (err, res) => { if (err) return reject(err); resolve(res as any); },
      ).end(file.buffer);
    });

    return this.prisma.development.update({
      where: { id },
      data: { modelUrl: result.secure_url, modelPublicId: result.public_id } as any,
    });
  }

  async uploadImplantationImage(tenantId: string, id: string, file: any) {
    if (!file?.buffer) throw new BadRequestException('Arquivo inválido');
    const dev = await this.prisma.development.findFirst({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Empreendimento não encontrado');

    // Remove imagem anterior se existir
    if ((dev as any).implantacaoPublicId) {
      await cloudinary.uploader.destroy((dev as any).implantacaoPublicId).catch(() => {});
    }

    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `via-crm/developments/${tenantId}/implantacao`, resource_type: 'image' },
        (err, res) => { if (err) return reject(err); resolve(res as any); },
      ).end(file.buffer);
    });

    return this.prisma.development.update({
      where: { id },
      data: { implantacaoUrl: result.secure_url, implantacaoPublicId: result.public_id } as any,
    });
  }
}
