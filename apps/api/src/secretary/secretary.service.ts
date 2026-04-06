import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { Logger } from '../logger';

const logger = new Logger('SecretaryService');

const SECRETARY_SLUG = 'secretaria-pessoal';
const CONTEXT_MESSAGES = 10;


const SECRETARY_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'criar_evento',
      description: 'Cria um novo evento na agenda do usuário',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título do evento' },
          startAt: { type: 'string', description: 'Data/hora início ISO 8601 com fuso, ex: 2026-03-30T09:00:00-03:00' },
          endAt: { type: 'string', description: 'Data/hora fim ISO 8601 (opcional, padrão: +1h)' },
          allDay: { type: 'boolean', description: 'Evento de dia inteiro' },
          location: { type: 'string', description: 'Local do evento' },
          description: { type: 'string', description: 'Descrição ou observações' },
          eventType: { type: 'string', enum: ['VISITA', 'TAREFA', 'CAPTACAO', 'REUNIAO', 'FOLLOW_UP'], description: 'Tipo do evento' },
        },
        required: ['title', 'startAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'excluir_evento',
      description: 'Exclui um evento da agenda pelo ID',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID do evento (visível no bloco AGENDA com prefixo ID:)' },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remarcar_evento',
      description: 'Remarca ou atualiza título, data/hora ou local de um evento existente',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID do evento' },
          title: { type: 'string', description: 'Novo título (opcional)' },
          startAt: { type: 'string', description: 'Nova data/hora início ISO 8601' },
          endAt: { type: 'string', description: 'Nova data/hora fim ISO 8601' },
          location: { type: 'string', description: 'Novo local (opcional)' },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_lead',
      description: 'Busca um lead no CRM pelo nome ou telefone',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nome ou parte do telefone do lead' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_lead',
      description: 'Cria um novo lead manual no CRM',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome completo do lead' },
          telefone: { type: 'string', description: 'Telefone/WhatsApp (só números)' },
          email: { type: 'string', description: 'E-mail (opcional)' },
          observacao: { type: 'string', description: 'Observação inicial (opcional)' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'salvar_nota',
      description: 'Salva uma nota, informação, contato ou documento na biblioteca pessoal do usuário',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título da nota (opcional)' },
          content: { type: 'string', description: 'Conteúdo da nota' },
          category: {
            type: 'string',
            enum: ['NOTA', 'CONTATO', 'DOCUMENTO', 'SENHA', 'LEMBRETE', 'OUTRO'],
            description: 'Categoria da nota',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags opcionais' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_notas',
      description: 'Busca notas na biblioteca pessoal do usuário por texto ou categoria',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto para buscar no título ou conteúdo' },
          category: { type: 'string', description: 'Filtrar por categoria (opcional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mover_funil',
      description: 'Move um lead para uma etapa do funil de vendas',
      parameters: {
        type: 'object',
        properties: {
          leadId: { type: 'string', description: 'ID do lead' },
          etapa: {
            type: 'string',
            description: 'Nome da etapa destino',
            enum: [
              'Novo Lead', 'Primeiro Contato', 'Não Qualificado',
              'Interesse e Qualificação Confirmados', 'Agendamento de Visita',
              'Proposta', 'Aprovação de Crédito', 'Contrato',
              'Assinatura de Contrato', 'Banco', 'Registro',
              'Entrega / Contrato Registrado', 'Pós Venda IA', 'Base Fria',
            ],
          },
        },
        required: ['leadId', 'etapa'],
      },
    },
  },
];

const CRITICAL_RULE =
  'REGRA TÉCNICA: Para dados do CRM (leads, eventos, produtos), use APENAS o bloco CONTEXTO desta mensagem — ' +
  'nunca dados de mensagens anteriores, pois podem estar desatualizados. ' +
  'Quando o usuário se referir a "este lead" ou "ele/ela", use o lead mencionado mais recentemente na conversa. ' +
  'Nunca invente nomes, telefones ou dados de leads. Se não estiver no CONTEXTO, diga que não tem acesso agora.';

@Injectable()
export class SecretaryService {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

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

  private getAnthropic(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não definida no .env');
    if (!this.anthropic) this.anthropic = new Anthropic({ apiKey });
    return this.anthropic;
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST /secretary/message
  // ─────────────────────────────────────────────────────────────────────

  async sendMessage(params: {
    tenantId: string;
    userId: string;
    sessionId?: string;
    text: string;
    skipAudio?: boolean;
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
    logger.log(`agent found: ${agent ? agent.slug : 'NULL - agente não encontrado'}`);
    const agentPermissions: string[] = (agent as any)?.permissions ?? [];
    const agentModel: string = (agent as any)?.model?.trim() || 'gpt-4o-mini';
    const agentTemperature: number = (agent as any)?.temperature ?? 0.7;
    const { block: realDataBlock, gender } = await this.buildRealDataBlock(params.tenantId, params.userId, agentPermissions, params.text);

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

    // 5. Chama GPT com function calling (agenda CRUD)
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
      { role: 'user', content: params.text },
    ];

    const isClaudeModel = agentModel.startsWith('claude-');
    let replyText = '';

    if (isClaudeModel) {
      // ── Anthropic path ──────────────────────────────────────────────────
      const anthropicTools: Anthropic.Tool[] = SECRETARY_TOOLS.map((t) => ({
        name: (t as any).function.name,
        description: (t as any).function.description || '',
        input_schema: (t as any).function.parameters as Anthropic.Tool['input_schema'],
      }));

      const anthropicMessages: Anthropic.MessageParam[] = [
        ...contextMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string })),
        { role: 'user' as const, content: params.text },
      ];

      for (let round = 0; round < 4; round++) {
        const response = await this.getAnthropic().messages.create({
          model: agentModel,
          max_tokens: 1024,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: anthropicTools,
          temperature: agentTemperature,
        });

        const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock[];

        if (toolUseBlocks.length > 0) {
          anthropicMessages.push({ role: 'assistant', content: response.content });
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            const result = await this.executeTool(block.name, block.input as any, params.tenantId, params.userId);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }
          anthropicMessages.push({ role: 'user', content: toolResults });
        } else {
          const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
          replyText = textBlock?.text?.trim() || '';
          break;
        }
      }
    } else {
      // ── OpenAI path ─────────────────────────────────────────────────────
      for (let round = 0; round < 4; round++) {
        const completion = await this.getOpenAI().chat.completions.create({
          model: agentModel,
          messages,
          tools: SECRETARY_TOOLS,
          tool_choice: 'auto',
          temperature: agentTemperature,
        });

        const choice = completion.choices[0];

        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
          messages.push(choice.message);
          for (const toolCall of choice.message.tool_calls) {
            const tc = toolCall as any;
            const args = JSON.parse(tc.function?.arguments || '{}');
            const result = await this.executeTool(tc.function?.name, args, params.tenantId, params.userId);
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
          }
        } else {
          replyText = choice.message.content?.trim() || '';
          break;
        }
      }
    }

    if (!replyText) throw new Error('A IA não retornou resposta.');

    // 6. TTS → audioBase64 (somente se não silenciado)
    const ttsVoice = ({ FEMININO: 'nova', MASCULINO: 'onyx', NEUTRO: 'alloy' } as Record<string, string>)[gender] || 'nova';
    const audioBase64 = params.skipAudio ? '' : await this.synthesize(replyText, ttsVoice);

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

    // Limpeza automática (assíncrona — não bloqueia resposta)
    this.cleanupOldConversations(params.tenantId, params.userId).catch(() => {});

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

    // Extração de texto para PDF — import dinâmico para evitar crash no startup (Node.js v18)
    if (file.mimetype === 'application/pdf' || ext === '.pdf') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');
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

  async getAllHistory(params: { tenantId: string; userId: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 100, 200);
    const messages = await this.prisma.secretaryConversation.findMany({
      where: { tenantId: params.tenantId, userId: params.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { messages: messages.reverse() };
  }

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
  // DELETE /secretary/cleanup  (conversas com mais de 30 dias)
  // ─────────────────────────────────────────────────────────────────────

  async cleanupOldConversations(tenantId: string, userId: string) {
    // Regra 1: apaga mensagens com mais de 7 dias
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const byAge = await this.prisma.secretaryConversation.deleteMany({
      where: { tenantId, userId, createdAt: { lt: cutoff } },
    });

    // Regra 2: se ainda restar mais de 5000, apaga as mais antigas
    const total = await this.prisma.secretaryConversation.count({
      where: { tenantId, userId },
    });

    let byCount = 0;
    if (total > 5000) {
      const toDelete = total - 5000;
      const oldest = await this.prisma.secretaryConversation.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'asc' },
        take: toDelete,
        select: { id: true },
      });
      const del = await this.prisma.secretaryConversation.deleteMany({
        where: { id: { in: oldest.map((m) => m.id) } },
      });
      byCount = del.count;
    }

    return { deletedByAge: byAge.count, deletedByCount: byCount };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Calendar tool execution
  // ─────────────────────────────────────────────────────────────────────

  private async executeTool(name: string, args: any, tenantId: string, userId: string): Promise<string> {
    try {
      // ── Agenda ──────────────────────────────────────────────
      if (name === 'criar_evento') {
        const endAt = args.endAt || new Date(new Date(args.startAt).getTime() + 60 * 60 * 1000).toISOString();
        const evento = await this.calendar.create(tenantId, userId, {
          title: args.title, startAt: args.startAt, endAt,
          allDay: args.allDay || false, location: args.location,
          description: args.description, eventType: args.eventType || 'TAREFA',
        });
        return `Evento criado com sucesso. ID: ${evento.id}`;
      }
      if (name === 'excluir_evento') {
        await this.calendar.remove(tenantId, userId, args.eventId);
        return 'Evento excluído com sucesso.';
      }
      if (name === 'remarcar_evento') {
        await this.calendar.update(tenantId, userId, args.eventId, {
          title: args.title, startAt: args.startAt, endAt: args.endAt, location: args.location,
        });
        return 'Evento remarcado com sucesso.';
      }

      // ── Leads ────────────────────────────────────────────────
      if (name === 'buscar_lead') {
        const q = (args.query || '').trim();
        const leads = await this.prisma.lead.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { telefone: { contains: q.replace(/\D/g, '') } },
            ],
          },
          take: 5,
          select: { id: true, nome: true, telefone: true, origem: true, status: true, criadoEm: true, observacao: true, stage: { select: { name: true } } },
          orderBy: { criadoEm: 'desc' },
        });
        if (leads.length === 0) return `Nenhum lead encontrado para "${q}".`;

        const results: string[] = [];
        for (const l of leads as any[]) {
          const partes = [`[ID:${l.id}] ${l.nome}`, `Etapa: ${l.stage?.name || l.status || '—'}`, `Tel: ${l.telefone || '—'}`, `Origem: ${l.origem || '—'}`];
          if (l.observacao) partes.push(`Resumo: ${l.observacao}`);

          // Busca histórico de conversa com a IA (últimas 10 mensagens)
          const logs = await this.prisma.aiExecutionLog.findMany({
            where: { tenantId, leadId: l.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { inputText: true, outputText: true, createdAt: true },
          });

          let entry = `• ${partes.join(' | ')}`;
          if (logs.length > 0) {
            const history = logs.reverse().map((log: any) => {
              const dt = new Date(log.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              return `  [${dt}] Lead: "${log.inputText.slice(0, 200)}" → IA: "${(log.outputText || '').slice(0, 200)}"`;
            }).join('\n');
            entry += `\n  Histórico de conversa (últimas ${logs.length}):\n${history}`;
          } else {
            entry += '\n  Histórico de conversa: Nenhuma conversa registrada.';
          }
          results.push(entry);
        }
        return results.join('\n\n');
      }

      if (name === 'criar_lead') {
        const telefone = args.telefone?.replace(/\D/g, '') || null;
        const telefoneKey = telefone ? telefone.slice(-9) : null;

        const pipeline = await this.prisma.pipeline.findFirst({ where: { tenantId }, select: { id: true } });
        const firstStage = pipeline
          ? await this.prisma.pipelineStage.findFirst({ where: { tenantId, pipelineId: pipeline.id, key: 'NOVO_LEAD' }, select: { id: true } })
          : null;

        const lead = await this.prisma.lead.create({
          data: {
            tenantId, nome: args.nome.trim(), telefone, telefoneKey,
            email: args.email?.trim() || null,
            observacao: args.observacao?.trim() || null,
            origem: 'Formulário Interno', status: 'NOVO',
            stageId: firstStage?.id ?? null,
          },
          select: { id: true, nome: true },
        });
        return `Lead criado com sucesso. Nome: ${lead.nome} | ID: ${lead.id}`;
      }

      if (name === 'mover_funil') {
        const stage = await this.prisma.pipelineStage.findFirst({
          where: { tenantId, name: { contains: args.etapa, mode: 'insensitive' } },
          select: { id: true, name: true },
        });
        if (!stage) return `Etapa "${args.etapa}" não encontrada.`;

        await this.prisma.lead.update({
          where: { id: args.leadId },
          data: { stageId: stage.id },
        });
        return `Lead movido para "${stage.name}" com sucesso.`;
      }

      // ── Biblioteca pessoal ──────────────────────────────
      if (name === 'salvar_nota') {
        const note = await (this.prisma as any).personalNote.create({
          data: {
            tenantId, userId,
            title: args.title?.trim() || null,
            content: args.content.trim(),
            category: args.category || 'NOTA',
            tags: Array.isArray(args.tags) ? args.tags : [],
          },
        });
        return `Nota salva com sucesso. ID: ${note.id} | Categoria: ${note.category}`;
      }

      if (name === 'buscar_notas') {
        const where: any = { tenantId, userId };
        if (args.category) where.category = args.category;
        if (args.query) {
          where.OR = [
            { title: { contains: args.query, mode: 'insensitive' } },
            { content: { contains: args.query, mode: 'insensitive' } },
          ];
        }
        const notes = await (this.prisma as any).personalNote.findMany({
          where, orderBy: { createdAt: 'desc' }, take: 10,
          select: { id: true, title: true, content: true, category: true, createdAt: true },
        });
        if (notes.length === 0) return 'Nenhuma nota encontrada.';
        return notes.map((n: any) =>
          `• [${n.category}] ${n.title || 'Sem título'}: ${n.content.slice(0, 200)}${n.content.length > 200 ? '...' : ''}`
        ).join('\n');
      }

      return 'Função desconhecida.';
    } catch (err: any) {
      return `Erro: ${err?.message || 'Não foi possível executar a operação.'}`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Biblioteca pessoal (CRUD direto via API)
  // ─────────────────────────────────────────────────────────────────────

  async listNotes(tenantId: string, userId: string, category?: string, query?: string) {
    const where: any = { tenantId, userId };
    if (category) where.category = category;
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ];
    }
    return (this.prisma as any).personalNote.findMany({
      where, orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(tenantId: string, userId: string, data: { title?: string; content: string; category?: string; tags?: string[] }) {
    return (this.prisma as any).personalNote.create({
      data: {
        tenantId, userId,
        title: data.title?.trim() || null,
        content: data.content.trim(),
        category: data.category || 'NOTA',
        tags: data.tags || [],
      },
    });
  }

  async deleteNote(tenantId: string, userId: string, noteId: string) {
    await (this.prisma as any).personalNote.deleteMany({ where: { id: noteId, tenantId, userId } });
    return { ok: true };
  }

  async updateNote(tenantId: string, userId: string, noteId: string, data: { title?: string; content?: string; category?: string; tags?: string[] }) {
    return (this.prisma as any).personalNote.update({
      where: { id: noteId },
      data: {
        ...(data.title !== undefined && { title: data.title?.trim() || null }),
        ...(data.content !== undefined && { content: data.content.trim() }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  private async buildRealDataBlock(
    tenantId: string,
    userId: string,
    _permissions: string[],
    _userText = '',
  ): Promise<{ block: string; gender: string }> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const nowLabel = now.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    // Busca dados do usuário (role, branch, preferências)
    const userInfo = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { nome: true, role: true, branchId: true, secretaryName: true, secretaryBotName: true, secretaryGender: true },
    });
    const displayName = userInfo?.secretaryName?.trim() || userInfo?.nome || 'usuário';
    const gender = userInfo?.secretaryGender || 'FEMININO';
    const isMasc = gender === 'MASCULINO';
    const botName = userInfo?.secretaryBotName?.trim() || (isMasc ? 'Assistente' : 'Secretária');
    const role = userInfo?.role || 'AGENT';
    const branchId = userInfo?.branchId;

    // Filtro de leads baseado no role
    const leadWhere: any = { tenantId, deletedAt: null };
    if (role === 'AGENT') {
      leadWhere.assignedUserId = userId;
    } else if (role === 'MANAGER' && branchId) {
      leadWhere.branchId = branchId;
    }
    // OWNER vê todos do tenant

    // Filtro de agenda baseado no role
    const agendaWhere: any = { tenantId };
    if (role === 'AGENT') agendaWhere.userId = userId;
    else if (role === 'MANAGER' && branchId) agendaWhere.branchId = branchId;

    const article = isMasc ? 'um assistente' : 'uma assistente';
    const roleLabel = role === 'OWNER' ? 'Proprietário' : role === 'MANAGER' ? 'Gerente' : 'Corretor';
    const sections: string[] = [
      `CONTEXTO (${nowLabel}):\n` +
        `Você é ${article} pessoal inteligente. Seu nome é ${botName}.\n` +
        `Está atendendo um USUÁRIO INTERNO do CRM — não um cliente ou lead.\n` +
        `Usuário: ${userInfo?.nome || ''} | Perfil: ${roleLabel}. Chame-o de "${displayName}".\n` +
        `Seja eficiente, diret${isMasc ? 'o' : 'a'} e profissional.`,
    ];

    // ── ETAPAS DO FUNIL ────────────────────────────────
    const stages = await this.prisma.pipelineStage.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { name: true },
    });
    if (stages.length > 0) {
      sections.push(`ETAPAS DO FUNIL:\n${stages.map(s => `  - ${s.name}`).join('\n')}`);
    }

    // ── LEADS ──────────────────────────────────────────
    {
      const [total, leadsHoje, ultimosLeads] = await Promise.all([
        this.prisma.lead.count({ where: leadWhere }),
        this.prisma.lead.count({ where: { ...leadWhere, criadoEm: { gte: startOfToday } } }),
        this.prisma.lead.findMany({
          where: leadWhere,
          orderBy: { criadoEm: 'desc' },
          take: 15,
          select: { id: true, nome: true, telefone: true, status: true, origem: true, criadoEm: true, observacao: true, stage: { select: { name: true } } },
        }),
      ]);

      const ultimosLines = (ultimosLeads as any[]).map((l) => {
        const data = new Date(l.criadoEm).toLocaleDateString('pt-BR');
        const etapa = l.stage?.name || l.status;
        const partes = [`[ID:${l.id}] ${l.nome}`, `etapa: ${etapa}`, `entrada: ${data}`];
        if (l.telefone) partes.push(`tel: ${l.telefone}`);
        if (l.origem) partes.push(`origem: ${l.origem}`);
        if (l.observacao) partes.push(`resumo: ${l.observacao.slice(0, 120)}`);
        return `  - ${partes.join(' | ')}`;
      }).join('\n');

      const scopeLabel = role === 'AGENT' ? 'seus leads' : role === 'MANAGER' ? 'leads do time' : 'todos os leads';
      sections.push(
        `LEADS (${scopeLabel}):\n` +
          `- Total: ${total} | Chegaram hoje: ${leadsHoje}\n` +
          `- Últimos 15:\n${ultimosLines || '  Nenhum lead encontrado.'}`,
      );
    }

    // ── AGENDA ─────────────────────────────────────────
    {
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const next7days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59);

      const [eventosHoje, proximosEventos] = await Promise.all([
        this.prisma.calendarEvent.findMany({
          where: { ...agendaWhere, startAt: { gte: startOfToday, lte: endOfToday } },
          orderBy: { startAt: 'asc' },
          select: { id: true, title: true, startAt: true, allDay: true, location: true, status: true },
        }),
        this.prisma.calendarEvent.findMany({
          where: { ...agendaWhere, startAt: { gt: endOfToday, lte: next7days } },
          orderBy: { startAt: 'asc' },
          select: { id: true, title: true, startAt: true, allDay: true, location: true, status: true },
        }),
      ]);

      const formatEvento = (e: any) => {
        const dt = new Date(e.startAt);
        const diaSemana = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
        const dataCurta = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
        const hora = e.allDay ? 'Dia todo' : dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const partes = [`[ID:${e.id}] ${diaSemana} ${dataCurta} ${hora} — ${e.title}`];
        if (e.location) partes.push(`(${e.location})`);
        if (e.status && e.status !== 'AGENDADO') partes.push(`[${e.status}]`);
        return `  - ${partes.join(' ')}`;
      };

      const hojeBlock = eventosHoje.length === 0 ? '  Nenhum evento hoje.' : eventosHoje.map(formatEvento).join('\n');
      const proximosBlock = proximosEventos.length === 0 ? '  Nenhum evento nos próximos 7 dias.' : proximosEventos.map(formatEvento).join('\n');
      sections.push(`AGENDA:\n- Hoje (${eventosHoje.length} evento${eventosHoje.length !== 1 ? 's' : ''}):\n${hojeBlock}\n- Próximos 7 dias:\n${proximosBlock}`);
    }

    // ── PRODUTOS ───────────────────────────────────────
    {
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

    const block = sections.join('\n\n');
    return { block, gender };
  }

  private buildSystemPrompt(agent: any, realDataBlock: string): string {
    const parts: string[] = [];

    // Regra técnica mínima — comportamento fica no prompt do agente
    parts.push(CRITICAL_RULE);

    // Persona / prompt do agente (instruções gerais)
    if (agent?.prompt?.trim()) {
      parts.push(agent.prompt.trim());
    } else {
      parts.push(
        'Você é uma secretária pessoal inteligente, organizada e discreta. ' +
          'Responda de forma clara, direta e profissional. ' +
          'Ajude o usuário com agendamentos, lembretes, resumos e tarefas.',
      );
    }

    // Dados reais do sistema + configurações do usuário (vêm por último — têm prioridade sobre o prompt do agente)
    parts.push(realDataBlock);

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
    return systemPrompt;
  }

  private async synthesize(text: string, voice: string = 'nova'): Promise<string> {
    try {
      const response = await this.getOpenAI().audio.speech.create({
        model: 'tts-1',
        voice: voice as any,
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
