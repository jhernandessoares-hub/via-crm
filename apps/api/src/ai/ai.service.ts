import { Injectable } from '@nestjs/common';
import { Logger } from '../logger';

const logger = new Logger('AiService');
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  private openai: OpenAI | null = null;

  constructor(private readonly prisma: PrismaService) {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('⚠️ AiService: OPENAI_API_KEY não definida — chamadas à IA vão falhar.');
    }
  }

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY não definida no .env');
      }
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  async findDefaultAgentForTenant(tenantId: string) {
    return this.prisma.aiAgent.findFirst({
      where: {
        tenantId,
        active: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        slug: true,
        mode: true,
        active: true,
        priority: true,
      },
    });
  }

  async generateFollowUp(params: {
    nome: string;
    status: string;
    tenantId: string;
    agentId?: string;
    leadId?: string;
    lastLeadMessage?: string;
    previousSuggestion?: string;
    conversationContext?: string;
    mode?: 'REGENERATE' | 'SHORTEN' | 'IMPROVE' | 'VARIATE';
  }) {
    let agentTitle = '';
    let agentDirectPrompt = ''; // campo prompt do próprio agente (prioridade máxima se preenchido)
    let personaBlock = '';
    let rulesBlock = '';
    let knowledgeContext = '';

    if (params.agentId) {
      const agent = await this.prisma.aiAgent.findFirst({
        where: { id: params.agentId, tenantId: params.tenantId, active: true },
        include: {
          knowledgeBases: {
            include: {
              knowledgeBase: {
                include: {
                  documents: { where: { extractedText: { not: null } }, orderBy: { createdAt: 'asc' } },
                  videos: { orderBy: { createdAt: 'asc' } },
                  kbLinks: { orderBy: { createdAt: 'asc' } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (agent) {
        agentTitle = agent.title?.trim() || '';
        if (agent.prompt?.trim()) agentDirectPrompt = agent.prompt.trim();

        const activeKBs = agent.knowledgeBases
          .map((item) => item.knowledgeBase)
          .filter((kb) => kb && kb.active)
          .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

        const personalityKBs = activeKBs.filter((kb) => kb.type === 'PERSONALIDADE');
        const rulesKBs = activeKBs.filter((kb) => kb.type === 'REGRAS');
        const contentKBs = activeKBs.filter((kb) => kb.type !== 'PERSONALIDADE' && kb.type !== 'REGRAS');

        // --- Persona: agent.prompt > PERSONALIDADE KB > fallback mínimo ---
        if (agentDirectPrompt) {
          personaBlock = agentDirectPrompt;
        } else if (personalityKBs.length > 0) {
          personaBlock = personalityKBs.map((kb) => kb.prompt?.trim()).filter(Boolean).join('\n\n');
        } else {
          personaBlock =
            'Você é um atendente que conversa com leads pelo WhatsApp de forma simples, humana e direta.\n' +
            'Escreva como uma pessoa real, nunca como assistente virtual.';
        }

        // --- Regras: apenas se houver KB do tipo REGRAS ---
        if (rulesKBs.length > 0) {
          rulesBlock = rulesKBs
            .map((kb) => {
              const parts: string[] = [];
              if (kb.prompt?.trim()) parts.push(kb.prompt.trim());
              if (kb.whatAiUnderstood?.trim()) parts.push(kb.whatAiUnderstood.trim());
              return parts.join('\n');
            })
            .filter(Boolean)
            .join('\n\n');
        }

        // --- Conteúdo de conhecimento (produto, mercado, atendimento, etc.) ---
        if (contentKBs.length > 0) {
          knowledgeContext = contentKBs
            .map((kb) => {
              const parts: string[] = [`[${kb.title}]`];
              if (kb.prompt?.trim()) parts.push(kb.prompt.trim());
              if (kb.whatAiUnderstood?.trim()) parts.push(`Resumo: ${kb.whatAiUnderstood.trim()}`);
              if (kb.exampleOutput?.trim()) parts.push(`Exemplo: ${kb.exampleOutput.trim()}`);

              const docs = (kb as any).documents as any[];
              if (docs?.length > 0) {
                const docParts = docs
                  .filter((d) => d.extractedText)
                  .map((d) => (d.title ? `[${d.title}]\n${d.extractedText}` : d.extractedText));
                if (docParts.length > 0) parts.push(`Documentos:\n${docParts.join('\n\n')}`);
              }

              const videos = (kb as any).videos as any[];
              if (videos?.length > 0) {
                const lines = videos.map((v) => {
                  let l = v.url;
                  if (v.title) l = `${v.title}: ${v.url}`;
                  if (v.description) l += ` — ${v.description}`;
                  return l;
                });
                parts.push(`Vídeos:\n${lines.join('\n')}`);
              }

              const links = (kb as any).kbLinks as any[];
              if (links?.length > 0) {
                const lines = links.map((l) => {
                  let s = l.url;
                  if (l.title) s = `${l.title}: ${l.url}`;
                  if (l.description) s += ` — ${l.description}`;
                  return s;
                });
                parts.push(`Links:\n${lines.join('\n')}`);
              }

              return parts.join('\n');
            })
            .join('\n\n--------------------\n\n');
        }
      }
    }

    // Fallback quando não há agente configurado
    if (!personaBlock) {
      personaBlock =
        'Você é um atendente que conversa com leads pelo WhatsApp de forma simples, humana e direta.\n' +
        'Escreva como uma pessoa real, nunca como assistente virtual.';
    }

    const lastLeadMessage = String(params.lastLeadMessage || '').trim();
    const previousSuggestion = String(params.previousSuggestion || '').trim();
    const conversationContext = String(params.conversationContext || '').trim();
    const isModifyMode =
      params.mode === 'SHORTEN' || params.mode === 'IMPROVE' || params.mode === 'VARIATE';

    const modeInstruction =
      params.mode === 'SHORTEN'
        ? 'Encurte a sugestão anterior mantendo exatamente o mesmo assunto e respondendo a mesma pergunta do lead. Não mude o contexto. Não inicie com saudação.'
        : params.mode === 'IMPROVE'
          ? 'Melhore a sugestão anterior deixando-a mais clara, natural e convincente. Mantenha exatamente o mesmo contexto e a mesma pergunta sendo respondida. Não mude o assunto.'
          : params.mode === 'VARIATE'
            ? 'Reescreva a sugestão anterior com construção de frase diferente, mantendo fielmente o contexto e a intenção da resposta. Não mude o assunto.'
            : params.mode === 'REGENERATE'
              ? 'Gere uma nova resposta para a mensagem do lead. Mantenha o contexto da pergunta original.'
              : '';

    const prompt = `${personaBlock}

${knowledgeContext ? `Conhecimento disponível:\n${knowledgeContext}\n` : ''}
Lead: ${params.nome} | Status: ${params.status}

${lastLeadMessage ? `Última mensagem do lead:\n${lastLeadMessage}\n` : ''}
${conversationContext ? `Contexto recente da conversa:\n${conversationContext}\n` : ''}
${isModifyMode && previousSuggestion ? `Sugestão anterior da IA (para modificar):\n${previousSuggestion}\n` : ''}
${modeInstruction ? `Tarefa: ${modeInstruction}` : ''}
${rulesBlock ? `\nRegras adicionais:\n${rulesBlock}` : ''}`;

    const systemContent = [
      `Você é ${agentTitle || 'um atendente'} respondendo leads pelo WhatsApp.`,
      'Escreva sempre como pessoa real. Nunca como assistente virtual.',
      'Use linguagem simples, curta e natural.',
      'Nunca use: "vi que você entrou em contato", "como posso ajudar", "fico feliz em ajudar".',
      isModifyMode && previousSuggestion
        ? 'Você está modificando uma sugestão anterior. NUNCA mude o assunto — responda exatamente a mesma pergunta do lead que a sugestão anterior respondia. Não reinicie a conversa. Não transforme em saudação.'
        : 'Responda a pergunta do lead diretamente. Se for saudação simples, responda só com saudação curta.',
    ]
      .filter(Boolean)
      .join(' ');

    const completion = await this.getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    const output = completion.choices[0]?.message?.content?.trim() || '';

    if (params.agentId) {
      try {
        await this.prisma.aiExecutionLog.create({
          data: {
            tenantId: params.tenantId,
            agentId: params.agentId,
            leadId: params.leadId || null,
            inputText: prompt,
            outputText: output,
            mode: 'COPILOT',
          },
        });
      } catch (err) {
        logger.error('Erro ao salvar AiExecutionLog', { error: (err as any)?.message || String(err) });
      }
    }

    return output;
  }
}