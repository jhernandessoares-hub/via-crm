import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { Logger } from '../logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');

const logger = new Logger('SecretaryService');

const SECRETARY_SLUG = 'secretaria-pessoal';
const CONTEXT_MESSAGES = 10;

const CRITICAL_RULE =
  'REGRA CRÍTICA: Você NUNCA deve inventar dados, números, nomes ou informações do sistema. ' +
  'Se não tiver acesso a um dado real, diga exatamente: ' +
  '"Não tenho acesso a essa informação no momento." ' +
  'Jamais simule ou estime dados como se fossem reais.';

@Injectable()
export class SecretaryService {
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
  ) {}

  private getOpenAI(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY não definida no .env');
    if (!this.openai) this.openai = new OpenAI({ apiKey });
    return this.openai;
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST /secretary/message
  // ─────────────────────────────────────────────────────────────────────

  async sendMessage(params: {
    tenantId: string;
    userId: string;
    sessionId?: string;
    text: string;
  }) {
    const sessionId = params.sessionId?.trim() || uuidv4();

    // 1. Busca agente com KBs
    const agent = await this.prisma.aiAgent.findFirst({
      where: { tenantId: params.tenantId, slug: SECRETARY_SLUG, active: true },
      include: {
        knowledgeBases: {
          include: {
            knowledgeBase: {
              include: {
                teachings: { orderBy: { createdAt: 'desc' as const }, take: 20 },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // 2. Consultas reais de dados do sistema (filtradas pelas permissões do agente)
    console.log('[DEBUG] agent found:', agent ? agent.slug : 'NULL - agente não encontrado');
    console.log('[DEBUG] agent?.permissions =>', (agent as any)?.permissions);
    const agentPermissions: string[] = (agent as any)?.permissions ?? [];
    console.log('[DEBUG] agentPermissions =>', agentPermissions);
    const realDataBlock = await this.buildRealDataBlock(params.tenantId, params.userId, agentPermissions);

    // 3. Monta system prompt (persona + KB + regra crítica)
    const systemPrompt = this.buildSystemPrompt(agent, realDataBlock);

    // 4. Carrega contexto recente da sessão
    const history = await this.prisma.secretaryConversation.findMany({
      where: { tenantId: params.tenantId, userId: params.userId, sessionId },
      orderBy: { createdAt: 'asc' },
      take: CONTEXT_MESSAGES,
    });

    const contextMessages: OpenAI.ChatCompletionMessageParam[] = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 5. Chama GPT
    const completion = await this.getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...contextMessages,
        { role: 'user', content: params.text },
      ],
      temperature: 0.7,
    });

    const replyText = completion.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('A IA não retornou resposta.');

    // 6. TTS → audioBase64
    const audioBase64 = await this.synthesize(replyText);

    // 7. Persiste mensagens
    await this.prisma.secretaryConversation.createMany({
      data: [
        {
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId,
          role: 'user',
          content: params.text,
        },
        {
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId,
          role: 'assistant',
          content: replyText,
        },
      ],
    });

    return { text: replyText, audioBase64, sessionId };
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST /secretary/transcribe
  // ─────────────────────────────────────────────────────────────────────

  async transcribe(file: { buffer: Buffer; mimetype: string; originalname?: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo de áudio vazio.');

    const filename = file.originalname || 'audio.webm';
    const mimetype = file.mimetype || 'audio/webm';

    const audioFile = new File([new Uint8Array(file.buffer)], filename, { type: mimetype });

    const result = await this.getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt',
    });

    return { text: result.text?.trim() || '' };
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST /secretary/upload
  // ─────────────────────────────────────────────────────────────────────

  async upload(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ url: string; filename: string; mimetype: string; text?: string }> {
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo vazio.');

    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${uuidv4()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'secretary', tenantId);

    fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, file.buffer);

    const url = `/uploads/secretary/${tenantId}/${safeName}`;
    const result: { url: string; filename: string; mimetype: string; text?: string } = {
      url,
      filename: file.originalname,
      mimetype: file.mimetype,
    };

    // Extração de texto para TXT
    if (file.mimetype === 'text/plain' || ext === '.txt') {
      result.text = file.buffer.toString('utf-8').trim();
    }

    // Extração de texto para PDF
    if (file.mimetype === 'application/pdf' || ext === '.pdf') {
      try {
        const parsed = await pdfParse(file.buffer);
        result.text = parsed.text?.trim() || '';
      } catch (err) {
        logger.error('Erro ao extrair texto do PDF', { error: (err as any)?.message });
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────
  // GET /secretary/history
  // ─────────────────────────────────────────────────────────────────────

  async getHistory(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    limit?: number;
  }) {
    if (!params.sessionId?.trim()) throw new BadRequestException('sessionId é obrigatório.');

    const messages = await this.prisma.secretaryConversation.findMany({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        sessionId: params.sessionId,
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(params.limit ?? 20, 100),
    });

    return { sessionId: params.sessionId, messages };
  }

  // ─────────────────────────────────────────────────────────────────────
  // GET /secretary/sessions
  // ─────────────────────────────────────────────────────────────────────

  async getSessions(tenantId: string, userId: string) {
    const rows = await this.prisma.secretaryConversation.groupBy({
      by: ['sessionId'],
      where: { tenantId, userId },
      _max: { createdAt: true },
      _count: { id: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });

    return rows.map((r) => ({
      sessionId: r.sessionId,
      messageCount: r._count.id,
      lastMessageAt: r._max.createdAt,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  private async buildRealDataBlock(
    tenantId: string,
    userId: string,
    permissions: string[],
  ): Promise<string> {
    console.log('[DEBUG] buildRealDataBlock called with:', permissions);
    const permSet = new Set(permissions);
    console.log('[DEBUG] permSet has leads:', permSet.has('leads'));
    console.log('[DEBUG] permSet has products:', permSet.has('products'));

    const has = (p: string) => permissions.length === 0 || permissions.includes(p);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const nowLabel = now.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const sections: string[] = [`DADOS REAIS DO SISTEMA (${nowLabel}):`];

    // ── LEADS ──────────────────────────────────────────
    if (has('leads')) {
      const [total, countNovo, countEmContato, countQualificado, countProposta, countFechado, countPerdido, leadsHoje] =
        await Promise.all([
          this.prisma.lead.count({ where: { tenantId } }),
          this.prisma.lead.count({ where: { tenantId, status: 'NOVO' } }),
          this.prisma.lead.count({ where: { tenantId, status: 'EM_CONTATO' } }),
          this.prisma.lead.count({ where: { tenantId, status: 'QUALIFICADO' } }),
          this.prisma.lead.count({ where: { tenantId, status: 'PROPOSTA' } }),
          this.prisma.lead.count({ where: { tenantId, status: 'FECHADO' } }),
          this.prisma.lead.count({ where: { tenantId, status: 'PERDIDO' } }),
          this.prisma.lead.count({ where: { tenantId, criadoEm: { gte: startOfToday } } }),
        ]);
      sections.push(
        `LEADS:\n` +
          `- Total: ${total} | Novos: ${countNovo} | Em contato: ${countEmContato} | Qualificados: ${countQualificado} | Propostas: ${countProposta} | Fechados: ${countFechado} | Perdidos: ${countPerdido}\n` +
          `- Criados hoje: ${leadsHoje}`,
      );
    }

    // ── AGENDA ─────────────────────────────────────────
    if (has('calendar')) {
      const eventosHoje = await this.calendar.findToday(tenantId, userId);
      let agendaBlock: string;
      if (eventosHoje.length === 0) {
        agendaBlock = 'Nenhum evento agendado para hoje.';
      } else {
        agendaBlock = eventosHoje
          .map((e) => {
            const hora = e.allDay
              ? 'Dia todo'
              : new Date(e.startAt).toLocaleTimeString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                  hour: '2-digit',
                  minute: '2-digit',
                });
            return `- ${hora} — ${e.title}`;
          })
          .join('\n');
      }
      sections.push(`AGENDA DE HOJE:\n${agendaBlock}`);
    }

    // ── FILA DO GERENTE ────────────────────────────────
    if (has('manager_queue')) {
      const filaGerente = await this.prisma.lead.count({
        where: { tenantId, needsManagerReview: true },
      });
      sections.push(`FILA DO GERENTE:\n- ${filaGerente} lead(s) aguardando revisão`);
    }

    // ── PRODUTOS ───────────────────────────────────────
    if (has('products')) {
      const products = await this.prisma.product.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          title: true,
          city: true,
          neighborhood: true,
          type: true,
          dealType: true,
          price: true,
          bedrooms: true,
          areaM2: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      if (products.length === 0) {
        sections.push('PRODUTOS DISPONÍVEIS:\n- Nenhum produto ativo cadastrado.');
      } else {
        const lines = products.map((p, i) => {
          const partes: string[] = [];
          if (p.neighborhood || p.city) {
            partes.push([p.neighborhood, p.city].filter(Boolean).join(', '));
          }
          partes.push(p.dealType === 'RENT' ? 'Locação' : 'Venda');
          if (p.price != null) {
            partes.push(
              'R$ ' +
                Number(p.price).toLocaleString('pt-BR', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }),
            );
          }
          if (p.bedrooms != null) partes.push(`${p.bedrooms} quarto${p.bedrooms !== 1 ? 's' : ''}`);
          if (p.areaM2 != null) partes.push(`${p.areaM2}m²`);
          return `${i + 1}. ${p.title} — ${partes.join(' | ')}`;
        });
        sections.push(`PRODUTOS DISPONÍVEIS (${products.length} ativos):\n${lines.join('\n')}`);
      }
    }

    const result = sections.join('\n\n');
    console.log('[DEBUG] realDataBlock result:', result);
    return result;
  }

  private buildSystemPrompt(agent: any, realDataBlock: string): string {
    const parts: string[] = [];

    // Regra crítica sempre em primeiro lugar
    parts.push(CRITICAL_RULE);

    // Dados reais do sistema
    parts.push(realDataBlock);

    // Persona / prompt do agente
    if (agent?.prompt?.trim()) {
      parts.push(agent.prompt.trim());
    } else {
      parts.push(
        'Você é uma secretária pessoal inteligente, organizada e discreta. ' +
          'Responda de forma clara, direta e profissional. ' +
          'Ajude o usuário com agendamentos, lembretes, resumos e tarefas.',
      );
    }

    // KBs vinculadas
    const activeKBs: any[] = (agent?.knowledgeBases ?? [])
      .map((link: any) => link.knowledgeBase)
      .filter((kb: any) => kb?.active);

    if (activeKBs.length > 0) {
      const kbContext = activeKBs
        .map((kb: any) => {
          const lines: string[] = [`[${kb.title}]`];
          if (kb.prompt?.trim()) lines.push(kb.prompt.trim());

          const teachings: any[] = kb.teachings ?? [];
          if (teachings.length > 0) {
            const ex = teachings
              .map((t: any) => {
                const tp = [`[${t.title}]`];
                if (t.leadMessage) tp.push(`Pergunta: "${t.leadMessage}"`);
                tp.push(`Resposta: "${t.approvedResponse}"`);
                return tp.join('\n');
              })
              .join('\n\n');
            lines.push(`Exemplos aprovados:\n${ex}`);
          }
          return lines.join('\n');
        })
        .join('\n\n--------------------\n\n');

      parts.push(`Conhecimento disponível:\n${kbContext}`);
    }

    parts.push('Responda sempre em português. Seja concisa e objetiva.');

    const systemPrompt = parts.join('\n\n');
    console.log('[DEBUG] systemPrompt final:\n', systemPrompt.substring(0, 500));
    return systemPrompt;
  }

  private async synthesize(text: string): Promise<string> {
    try {
      const response = await this.getOpenAI().audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: text,
        response_format: 'mp3',
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.toString('base64');
    } catch (err) {
      logger.error('Erro ao gerar áudio TTS', { error: (err as any)?.message });
      return '';
    }
  }
}
