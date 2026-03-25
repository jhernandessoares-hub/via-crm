import { Injectable } from '@nestjs/common';
import { Logger } from '../logger';

const logger = new Logger('AiService');
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

/** Extrai os campos textuais de uma KB de forma uniforme para todos os tipos. */
function buildKbFields(kb: { prompt?: string | null }): string {
  const parts: string[] = [];
  if (kb.prompt?.trim()) parts.push(kb.prompt.trim());
  return parts.join('\n');
}

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
                  teachings: { orderBy: { createdAt: 'desc' as const }, take: 30 },
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
          personaBlock = personalityKBs.map((kb) => buildKbFields(kb)).filter(Boolean).join('\n\n');
        } else {
          personaBlock =
            'Você é um atendente que conversa com leads pelo WhatsApp de forma simples, humana e direta.\n' +
            'Escreva como uma pessoa real, nunca como assistente virtual.';
        }

        // --- Regras: apenas se houver KB do tipo REGRAS ---
        if (rulesKBs.length > 0) {
          rulesBlock = rulesKBs
            .map((kb) => buildKbFields(kb))
            .filter(Boolean)
            .join('\n\n');
        }

        // --- Conteúdo de conhecimento (produto, mercado, atendimento, etc.) ---
        if (contentKBs.length > 0) {
          knowledgeContext = contentKBs
            .map((kb) => {
              const fields = buildKbFields(kb);
              const parts: string[] = [`[${kb.title}]`];
              if (fields) parts.push(fields);

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

              const teachings = (kb as any).teachings as any[];
              if (teachings?.length > 0) {
                const lines = teachings.map((t: any) => {
                  const tParts = [`[${t.title}]`];
                  if (t.leadMessage) tParts.push(`Lead: "${t.leadMessage}"`);
                  tParts.push(`Resposta aprovada: "${t.approvedResponse}"`);
                  return tParts.join('\n');
                });
                parts.push(`Exemplos reais aprovados (${teachings.length}):\n${lines.join('\n\n')}`);
              }

              return parts.join('\n');
            })
            .join('\n\n--------------------\n\n');
        }

        // --- Teachings de KBs de Personalidade e Regras ---
        const nonContentTeachingLines: string[] = [];
        for (const kb of [...personalityKBs, ...rulesKBs]) {
          const teachings = (kb as any).teachings as any[];
          if (teachings?.length > 0) {
            const lines = teachings.map((t: any) => {
              const tParts = [`[${t.title}]`];
              if (t.leadMessage) tParts.push(`Lead: "${t.leadMessage}"`);
              tParts.push(`Resposta aprovada: "${t.approvedResponse}"`);
              return tParts.join('\n');
            });
            nonContentTeachingLines.push(`Exemplos reais aprovados (${teachings.length}):\n${lines.join('\n\n')}`);
          }
        }
        if (nonContentTeachingLines.length > 0) {
          const section = nonContentTeachingLines.join('\n\n--------------------\n\n');
          knowledgeContext = knowledgeContext
            ? `${knowledgeContext}\n\n--------------------\n\n${section}`
            : section;
        }
      }
    }

    // Fallback quando não há agente configurado
    if (!personaBlock) {
      personaBlock =
        'Você é um atendente que conversa com leads pelo WhatsApp de forma simples, humana e direta.\n' +
        'Escreva como uma pessoa real, nunca como assistente virtual.';
    }

    // Produtos disponíveis do tenant
    const productsBlock = await this.buildProductsBlock(params.tenantId);

    // [DEBUG] Log do personaBlock resolvido
    logger.log('[DEBUG] personaBlock =>\n' + personaBlock);

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

    // ── role: system ────────────────────────────────────────────────────────
    const systemParts: string[] = [];

    // 1. Persona (identidade e voz do agente)
    systemParts.push(personaBlock);

    // 2. Instruções comportamentais fixas
    const behaviorLines = [
      'Escreva sempre como pessoa real. Nunca como assistente virtual.',
      'Use linguagem simples, curta e natural.',
      'Nunca use: "vi que você entrou em contato", "como posso ajudar", "fico feliz em ajudar".',
      isModifyMode && previousSuggestion
        ? 'Você está modificando uma sugestão anterior. NUNCA mude o assunto — responda exatamente a mesma pergunta do lead que a sugestão anterior respondia. Não reinicie a conversa. Não transforme em saudação.'
        : 'Responda a pergunta do lead diretamente. Se for saudação simples, responda só com saudação curta.',
    ].filter(Boolean);
    systemParts.push(behaviorLines.join(' '));

    // 3. Regras obrigatórias (KBs do tipo REGRAS)
    if (rulesBlock) systemParts.push(`Regras adicionais:\n${rulesBlock}`);

    // 4. Instrução sobre uso dos imóveis disponíveis
    if (productsBlock) {
      systemParts.push(
        'Quando o lead demonstrar interesse em imóvel, consulte a lista de IMÓVEIS DISPONÍVEIS no contexto ' +
        'e sugira os mais compatíveis com o perfil dele. Sempre mencione título, localização e preço. ' +
        'Nunca invente imóveis que não estão na lista.',
      );
    }

    const systemContent = systemParts.join('\n\n');

    // [DEBUG] Log do systemContent completo enviado para a OpenAI
    logger.log('[DEBUG] systemContent =>\n' + systemContent);

    // ── role: user ──────────────────────────────────────────────────────────
    const userParts: string[] = [];

    if (knowledgeContext) userParts.push(`Conhecimento disponível:\n${knowledgeContext}`);
    if (productsBlock) userParts.push(productsBlock);
    userParts.push(`Lead: ${params.nome} | Status: ${params.status}`);
    if (lastLeadMessage) userParts.push(`Última mensagem do lead:\n${lastLeadMessage}`);
    if (conversationContext) userParts.push(`Contexto recente da conversa:\n${conversationContext}`);
    if (isModifyMode && previousSuggestion) userParts.push(`Sugestão anterior da IA (para modificar):\n${previousSuggestion}`);
    if (modeInstruction) userParts.push(`Tarefa: ${modeInstruction}`);

    const prompt = userParts.join('\n\n');

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

  private async buildProductsBlock(tenantId: string): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        type: true,
        dealType: true,
        neighborhood: true,
        city: true,
        price: true,
        rentPrice: true,
        bedrooms: true,
        suites: true,
        bathrooms: true,
        parkingSpaces: true,
        areaM2: true,
        builtAreaM2: true,
        standard: true,
        condominiumName: true,
        description: true,
      },
      take: 30,
      orderBy: { createdAt: 'desc' },
    });

    if (products.length === 0) return '';

    const fmtBRL = (n: any): string | null => {
      if (n == null) return null;
      const num = Number(n);
      if (!Number.isFinite(num)) return null;
      return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    };

    const TYPE_LABEL: Record<string, string> = {
      EMPREENDIMENTO: 'Empreendimento', LOTEAMENTO: 'Loteamento', APARTAMENTO: 'Apartamento',
      CASA: 'Casa', KITNET: 'Kitnet', SOBRADO: 'Sobrado', TERRENO: 'Terreno',
      SALA_COMERCIAL: 'Sala Comercial', LOJA: 'Loja', SALAO_COMERCIAL: 'Salão Comercial',
      BARRACAO: 'Barracão/Galpão', OUTRO: 'Outro',
    };

    const STANDARD_LABEL: Record<string, string> = {
      ECONOMICO: 'Econômico', MEDIO: 'Médio', ALTO: 'Alto', LUXO: 'Luxo',
    };

    const lines = products.map((p, i) => {
      const parts: string[] = [];

      // Linha 1: índice, título, tipo, localização
      const location = [p.neighborhood, p.city].filter(Boolean).join(', ');
      const typeLabel = TYPE_LABEL[String(p.type)] ?? String(p.type);
      parts.push(`${i + 1}. ${p.title} — ${typeLabel}${location ? ` | ${location}` : ''}`);

      // Linha 2: preços
      const priceBRL = fmtBRL(p.price);
      const rentBRL = fmtBRL(p.rentPrice);
      const priceStr = [
        priceBRL ? `Venda: R$ ${priceBRL}` : null,
        rentBRL ? `Locação: R$ ${rentBRL}/mês` : null,
      ].filter(Boolean).join(' | ');
      if (priceStr) parts.push(`   ${priceStr}`);

      // Linha 3: características físicas
      const physParts: string[] = [];
      if (p.bedrooms != null) physParts.push(`${p.bedrooms} quarto${p.bedrooms !== 1 ? 's' : ''}`);
      if (p.suites != null) physParts.push(`${p.suites} suíte${p.suites !== 1 ? 's' : ''}`);
      if (p.bathrooms != null) physParts.push(`${p.bathrooms} banheiro${p.bathrooms !== 1 ? 's' : ''}`);
      if (p.parkingSpaces != null) physParts.push(`${p.parkingSpaces} vaga${p.parkingSpaces !== 1 ? 's' : ''}`);
      const area = p.builtAreaM2 ?? p.areaM2;
      if (area != null) physParts.push(`${area}m²`);
      if (physParts.length > 0) parts.push(`   ${physParts.join(' | ')}`);

      // Linha 4: padrão e condomínio
      const extraParts: string[] = [];
      if (p.standard) extraParts.push(`Padrão: ${STANDARD_LABEL[String(p.standard)] ?? p.standard}`);
      if (p.condominiumName) extraParts.push(`Condomínio: ${p.condominiumName}`);
      if (extraParts.length > 0) parts.push(`   ${extraParts.join(' | ')}`);

      // Linha 5: descrição resumida
      if (p.description?.trim()) {
        const desc = p.description.trim().slice(0, 100);
        parts.push(`   ${desc}${p.description.trim().length > 100 ? '...' : ''}`);
      }

      return parts.join('\n');
    });

    return `IMÓVEIS DISPONÍVEIS PARA VENDA/LOCAÇÃO:\n\n${lines.join('\n\n')}`;
  }

  async generateTeachingTitle(leadMessage: string | null | undefined, approvedResponse: string): Promise<string> {
    const parts: string[] = [];
    if (leadMessage?.trim()) parts.push(`Pergunta/contexto do lead: "${leadMessage.trim()}"`);
    if (approvedResponse?.trim()) parts.push(`Resposta aprovada: "${approvedResponse.trim().slice(0, 300)}"`);
    const content = parts.join('\n');
    if (!content) return 'Ensinamento';

    try {
      const completion = await this.getOpenAI().chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Crie um título curto (máximo 8 palavras) e descritivo para este ensinamento de vendas. Responda APENAS com o título, sem aspas, sem pontuação final.\n\n${content}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 30,
      });
      return completion.choices[0]?.message?.content?.trim() || 'Ensinamento';
    } catch {
      return 'Ensinamento';
    }
  }

  async summarizeKbPrompt(prompt: string): Promise<string> {
    const content = prompt.slice(0, 4000).trim();
    if (!content) return '';

    const completion = await this.getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Você é um assistente técnico. Resuma em 2 a 3 frases curtas o que este conteúdo ensina a um atendente de vendas. Seja objetivo e direto, sem introduções.\n\nConteúdo:\n${content}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    return completion.choices[0]?.message?.content?.trim() || '';
  }
}