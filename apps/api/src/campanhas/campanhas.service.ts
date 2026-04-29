import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { Logger } from '../logger';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const logger = new Logger('CampanhasService');

@Injectable()
export class CampanhasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly unofficial: WhatsappUnofficialService,
  ) {}

  // ── MODELOS ───────────────────────────────────────────────────────────────

  async listModelos(tenantId: string, userId: string) {
    return this.prisma.campanhaModelo.findMany({
      where: { tenantId, userId },
      include: {
        _count: { select: { disparos: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async createModelo(tenantId: string, userId: string, dto: {
    nome: string;
    mensagem: string;
    delayMinSegundos?: number;
    delayMaxSegundos?: number;
  }) {
    const min = Math.max(5, dto.delayMinSegundos ?? 5);
    const max = Math.max(min, dto.delayMaxSegundos ?? 15);
    return this.prisma.campanhaModelo.create({
      data: { tenantId, userId, nome: dto.nome, mensagem: dto.mensagem, delayMinSegundos: min, delayMaxSegundos: max },
    });
  }

  async updateModelo(id: string, tenantId: string, userId: string, dto: any) {
    await this.assertModeloOwner(id, tenantId, userId);
    const min = dto.delayMinSegundos != null ? Math.max(5, dto.delayMinSegundos) : undefined;
    const max = dto.delayMaxSegundos != null ? Math.max(min ?? 5, dto.delayMaxSegundos) : undefined;
    return this.prisma.campanhaModelo.update({
      where: { id },
      data: { nome: dto.nome, mensagem: dto.mensagem, delayMinSegundos: min, delayMaxSegundos: max },
    });
  }

  async deleteModelo(id: string, tenantId: string, userId: string) {
    await this.assertModeloOwner(id, tenantId, userId);
    // Bloqueia se há disparo ativo ligado a este modelo
    const ativo = await this.prisma.campanhaDisparo.findFirst({
      where: { modeloId: id, status: { in: ['RODANDO', 'PAUSADA'] } },
      select: { id: true },
    });
    if (ativo) throw new BadRequestException('Modelo possui disparo ativo — pause ou cancele antes de excluir');
    // Remove histórico de disparos concluídos/cancelados (contatos em cascata via schema)
    await this.prisma.campanhaDisparo.deleteMany({ where: { modeloId: id } });
    await this.prisma.campanhaModelo.delete({ where: { id } });
    return { ok: true };
  }

  async uploadModeloMedia(id: string, tenantId: string, userId: string, file: { buffer: Buffer; mimetype: string }) {
    await this.assertModeloOwner(id, tenantId, userId);
    const isVideo = file.mimetype.startsWith('video/');
    const url = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `via-crm/campanhas/modelos/${id}`, resource_type: isVideo ? 'video' : 'image' },
        (err, result) => err || !result ? reject(err) : resolve(result.secure_url),
      );
      Readable.from(file.buffer).pipe(stream);
    });
    await this.prisma.campanhaModelo.update({
      where: { id },
      data: { mediaUrl: url, mediaType: isVideo ? 'VIDEO' : 'IMAGE' },
    });
    return { url };
  }

  async removeModeloMedia(id: string, tenantId: string, userId: string) {
    await this.assertModeloOwner(id, tenantId, userId);
    await this.prisma.campanhaModelo.update({ where: { id }, data: { mediaUrl: null, mediaType: null } });
    return { ok: true };
  }

  // ── VALIDAÇÃO WA ─────────────────────────────────────────────────────────

  async validateNumbers(sessionId: string, tenantId: string, numeros: string[]) {
    const session = await this.prisma.whatsappUnofficialSession.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return this.unofficial.validateNumbers(sessionId, numeros);
  }

  // ── DISPAROS ──────────────────────────────────────────────────────────────

  async listDisparos(tenantId: string) {
    const disparos = await this.prisma.campanhaDisparo.findMany({
      where: { tenantId },
      include: {
        modelo: { select: { nome: true } },
        session: { select: { nome: true, phoneNumber: true } },
      },
      orderBy: { iniciadaEm: 'desc' },
    });

    // Calcula não responderam (enviados sem resposta após 24h)
    const agora = new Date();
    const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

    const stats = await Promise.all(disparos.map(async (d) => {
      const naoResponderam24h = await this.prisma.campanhaContato.count({
        where: {
          disparoId: d.id,
          status: 'ENVIADO',
          enviadoEm: { lt: limite24h },
        },
      });
      return { ...d, naoResponderam24h };
    }));

    return stats;
  }

  async getDisparo(id: string, tenantId: string) {
    const d = await this.prisma.campanhaDisparo.findFirst({
      where: { id, tenantId },
      include: {
        modelo: { select: { nome: true, mensagem: true, mediaUrl: true, mediaType: true, delayMinSegundos: true, delayMaxSegundos: true } },
        session: { select: { id: true, nome: true, phoneNumber: true } },
      },
    });
    if (!d) throw new NotFoundException('Disparo não encontrado');
    return {
      ...d,
      mensagem: d.modelo.mensagem,
      mediaUrl: d.modelo.mediaUrl,
      mediaType: d.modelo.mediaType,
      delayMinSegundos: d.modelo.delayMinSegundos,
      delayMaxSegundos: d.modelo.delayMaxSegundos,
    };
  }

  async createRascunho(tenantId: string, userId: string, dto: {
    nome: string;
    sessionId: string;
    mensagem: string;
    delayMinSegundos?: number;
    delayMaxSegundos?: number;
  }) {
    const session = await this.prisma.whatsappUnofficialSession.findFirst({
      where: { id: dto.sessionId, tenantId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    const min = Math.max(5, dto.delayMinSegundos ?? 5);
    const max = Math.max(min, dto.delayMaxSegundos ?? 15);

    const modelo = await this.prisma.campanhaModelo.create({
      data: { tenantId, userId, nome: dto.nome, mensagem: dto.mensagem, delayMinSegundos: min, delayMaxSegundos: max },
    });

    const disparo = await this.prisma.campanhaDisparo.create({
      data: { tenantId, userId, sessionId: dto.sessionId, modeloId: modelo.id, nome: dto.nome, status: 'RASCUNHO' },
    });

    logger.log(`Rascunho de campanha criado id=${disparo.id}`);
    return disparo;
  }

  async addContatosLista(id: string, tenantId: string, contatos: Array<{ telefone: string; nome?: string }>) {
    const d = await this.prisma.campanhaDisparo.findFirst({ where: { id, tenantId, status: 'RASCUNHO' } });
    if (!d) throw new BadRequestException('Campanha não está em rascunho');

    const validos = contatos
      .filter((c) => c.telefone?.trim())
      .map((c) => ({ telefone: c.telefone.replace(/\D/g, ''), nome: c.nome?.trim() || null }));

    if (validos.length === 0) throw new BadRequestException('Nenhum contato válido');

    await this.prisma.$transaction([
      this.prisma.campanhaContato.createMany({
        data: validos.map((c) => ({ disparoId: id, telefone: c.telefone, nome: c.nome })),
      }),
      this.prisma.campanhaDisparo.update({ where: { id }, data: { totalContatos: { increment: validos.length } } }),
    ]);

    return { adicionados: validos.length };
  }

  async startDisparo(id: string, tenantId: string) {
    const d = await this.prisma.campanhaDisparo.findFirst({ where: { id, tenantId, status: 'RASCUNHO' } });
    if (!d) throw new BadRequestException('Campanha não está em rascunho');
    if (d.totalContatos === 0) throw new BadRequestException('Adicione contatos antes de iniciar');

    await this.prisma.campanhaDisparo.update({ where: { id }, data: { status: 'RODANDO' } });
    await this.queue.scheduleCampaignNext(id, 0);
    logger.log(`Disparo iniciado id=${id} total=${d.totalContatos}`);
    return { ok: true };
  }

  async createDisparo(tenantId: string, userId: string, dto: {
    modeloId: string;
    sessionId: string;
    contatos: Array<{ telefone: string; nome?: string }>;
  }) {
    const modelo = await this.prisma.campanhaModelo.findFirst({
      where: { id: dto.modeloId, tenantId },
    });
    if (!modelo) throw new NotFoundException('Modelo não encontrado');

    const session = await this.prisma.whatsappUnofficialSession.findFirst({
      where: { id: dto.sessionId, tenantId, status: 'CONNECTED' },
    });
    if (!session) throw new BadRequestException('Sessão não está conectada');

    const contatos = dto.contatos
      .filter((c) => c.telefone?.trim())
      .map((c) => ({ telefone: c.telefone.replace(/\D/g, ''), nome: c.nome?.trim() || null }));

    if (contatos.length === 0) throw new BadRequestException('Nenhum contato válido');

    const nome = `${modelo.nome} — ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    const disparo = await this.prisma.campanhaDisparo.create({
      data: {
        tenantId, userId,
        sessionId: dto.sessionId,
        modeloId: dto.modeloId,
        nome,
        status: 'RODANDO',
        totalContatos: contatos.length,
        contatos: { createMany: { data: contatos.map((c) => ({ telefone: c.telefone, nome: c.nome })) } },
      },
    });

    await this.queue.scheduleCampaignNext(disparo.id, 0);
    logger.log(`Disparo iniciado id=${disparo.id} total=${contatos.length}`);
    return disparo;
  }

  async pauseDisparo(id: string, tenantId: string) {
    await this.assertDisparoAtivo(id, tenantId);
    await this.prisma.campanhaDisparo.update({ where: { id }, data: { status: 'PAUSADA' } });
    return { ok: true };
  }

  async resumeDisparo(id: string, tenantId: string) {
    const d = await this.prisma.campanhaDisparo.findFirst({ where: { id, tenantId, status: 'PAUSADA' } });
    if (!d) throw new BadRequestException('Disparo não está pausado');
    await this.prisma.campanhaDisparo.update({ where: { id }, data: { status: 'RODANDO' } });
    await this.queue.scheduleCampaignNext(id, 0);
    return { ok: true };
  }

  async cancelDisparo(id: string, tenantId: string) {
    const d = await this.prisma.campanhaDisparo.findFirst({
      where: { id, tenantId },
      select: { status: true },
    });
    if (!d) throw new NotFoundException('Disparo não encontrado');
    if (['CONCLUIDA', 'CANCELADA'].includes(d.status)) return { ok: true };
    await this.queue.cancelCampaignJobs(id);
    await this.prisma.campanhaDisparo.update({ where: { id }, data: { status: 'CANCELADA' } });
    return { ok: true };
  }

  async getActiveDisparo(sessionId: string, tenantId: string) {
    return this.prisma.campanhaDisparo.findFirst({
      where: { sessionId, tenantId, status: { in: ['RODANDO', 'PAUSADA'] } },
      orderBy: { iniciadaEm: 'desc' },
    });
  }

  async listContatosDisparo(disparoId: string, tenantId: string, page = 1, limit = 50) {
    await this.getDisparo(disparoId, tenantId);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.campanhaContato.findMany({ where: { disparoId }, skip, take: limit, orderBy: { criadoEm: 'asc' } }),
      this.prisma.campanhaContato.count({ where: { disparoId } }),
    ]);
    return { items, total };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertModeloOwner(id: string, tenantId: string, userId: string) {
    const m = await this.prisma.campanhaModelo.findFirst({ where: { id, tenantId, userId }, select: { id: true } });
    if (!m) throw new NotFoundException('Modelo não encontrado');
  }

  private async assertDisparoAtivo(id: string, tenantId: string) {
    const d = await this.prisma.campanhaDisparo.findFirst({ where: { id, tenantId, status: 'RODANDO' } });
    if (!d) throw new BadRequestException('Disparo não está rodando');
  }
}
