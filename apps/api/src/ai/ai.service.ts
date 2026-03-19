import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  private openai: OpenAI | null = null;

  constructor(private readonly prisma: PrismaService) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ AiService: OPENAI_API_KEY não definida — chamadas à IA vão falhar.');
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
    conversationContext?: string;
    mode?: 'REGENERATE' | 'SHORTEN' | 'IMPROVE' | 'VARIATE';
  }) {
    let agentPrompt = '';
    let agentTitle = '';
    let knowledgeBaseContext = '';

    if (params.agentId) {
      const agent = await this.prisma.aiAgent.findFirst({
        where: {
          id: params.agentId,
          tenantId: params.tenantId,
          active: true,
        },
        include: {
          knowledgeBases: {
            include: {
              knowledgeBase: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      if (agent) {
        agentTitle = agent.title?.trim() || '';
        if (agent.prompt && agent.prompt.trim()) {
          agentPrompt = agent.prompt.trim();
        }

        const activeKnowledgeBases = agent.knowledgeBases
          .map((item) => item.knowledgeBase)
          .filter((kb) => kb && kb.active)
          .sort((a, b) => a.priority - b.priority);

        if (activeKnowledgeBases.length > 0) {
          knowledgeBaseContext = activeKnowledgeBases
            .map((kb, index) => {
              const parts: string[] = [];

              parts.push(`Base ${index + 1}: ${kb.title}`);
              parts.push(`Tipo: ${kb.type}`);

              if (kb.prompt && kb.prompt.trim()) {
                parts.push(`Conteúdo principal:\n${kb.prompt.trim()}`);
              }

              if (kb.whatAiUnderstood && kb.whatAiUnderstood.trim()) {
                parts.push(`O que a IA entendeu:\n${kb.whatAiUnderstood.trim()}`);
              }

              if (kb.exampleOutput && kb.exampleOutput.trim()) {
                parts.push(`Exemplo de saída:\n${kb.exampleOutput.trim()}`);
              }

              if (kb.tags && kb.tags.length > 0) {
                parts.push(`Tags: ${kb.tags.join(', ')}`);
              }

              if (kb.links && kb.links.length > 0) {
                parts.push(`Links de apoio: ${kb.links.join(', ')}`);
              }

              return parts.join('\n');
            })
            .join('\n\n--------------------\n\n');
        }
      }
    }

    const lastLeadMessage = String(params.lastLeadMessage || '').trim();
    const conversationContext = String(params.conversationContext || '').trim();

    const modeInstruction =
      params.mode === 'SHORTEN'
        ? 'Ajuste extra: gere uma versão mais curta da resposta, mas sem perder o contexto da pergunta original do lead. Nunca transforme resposta objetiva em saudação genérica.'
        : params.mode === 'IMPROVE'
          ? 'Ajuste extra: gere uma versão melhorada da resposta, mais clara, mais natural e mais convincente, mas mantendo exatamente o mesmo contexto e respondendo a mesma pergunta do lead.'
          : params.mode === 'VARIATE'
            ? 'Ajuste extra: gere uma resposta diferente da anterior, com outra construção de frase, mas mantendo fielmente o contexto original e a intenção da pergunta do lead.'
            : params.mode === 'REGENERATE'
              ? 'Ajuste extra: gere uma nova resposta para a mesma situação, ignorando a resposta anterior e mantendo fielmente o contexto da pergunta do lead. Nunca responder como se fosse início de conversa se o lead já fez pergunta clara.'
              : '';

    const personaBlock = agentPrompt
      ? agentPrompt
      : `Você é um atendente que conversa com pessoas pelo WhatsApp de forma simples, humana e consultiva.

Seu estilo de conversa é natural, educado e direto.
Você não escreve como assistente virtual.
Você escreve como uma pessoa real conversando no WhatsApp.

Nem toda mensagem é uma solicitação direta ao seu serviço.
Algumas pessoas mandam mensagem errada ou só querem confirmar algo.

Se a mensagem não for sobre seu produto ou serviço, responda normalmente como pessoa.
Não tente vender quando não fizer sentido.`;

    const prompt = `
${personaBlock}

${knowledgeBaseContext ? `Base de conhecimento disponível:\n${knowledgeBaseContext}\n` : ''}

Dados do lead:
Nome: ${params.nome}
Status: ${params.status}

${lastLeadMessage ? `Última mensagem do lead:\n${lastLeadMessage}\n` : ''}

${conversationContext ? `Contexto recente da conversa:\n${conversationContext}\n` : ''}

Objetivo da resposta:

- responder a última mensagem do lead
- parecer humano
- ser natural no WhatsApp
- responder primeiro o que foi perguntado
- quando fizer sentido, conduzir a conversa

Estilo de escrita obrigatório:

- frases curtas
- linguagem simples
- tom humano
- evitar texto perfeito demais
- pode usar: vc, pq, tbm
- evitar marketing exagerado
- evitar frases robóticas
- não usar "me conta"

Forma de escrever preferida:

frase curta

pergunta simples

Exemplo:

Olá tudo bem?

Qual anúncio vc viu?

Ou:

Olá tudo bem?

Trabalhamos sim com esse serviço.

Qual opção vc viu?

Regras importantes:

- não parecer robô
- não escrever como assistente virtual
- não empurrar venda sem contexto
- responder primeiro a pergunta do lead
- se a mensagem for vaga, perguntar algo simples para entender melhor

Regra de saudação (MUITO IMPORTANTE):

Se a mensagem do lead for apenas uma saudação simples como:
"oi", "oii", "oiii", "olá", "bom dia", "boa tarde", "boa noite"

Responda apenas com uma saudação curta.

Exemplos corretos:
"Olá tudo bem?"
"Oi tudo bem?"
"Olá boa noite

Tudo bem?"

Não faça perguntas adicionais nesse momento.
Não puxe assunto.
Não tente vender.
Espere o lead falar primeiro.

Regra para "tudo bem" / "e com vc" (MUITO IMPORTANTE):

Se o lead disser algo como:
"tudo bem"
"tudo e com vc?"
"e com vc?"
"tudo bem e vc?"
"como vc tá?"

Responda direto e de forma curta.

Exemplos corretos:
"Tudo bem também 🙏🏽"
"Tudo certo 🙏🏽"
"Tudo ótimo 🙏🏽"

Nessa situação:
- não cumprimente de novo
- não escreva "olá" ou "oi" novamente
- não reinicie a conversa
- não faça nova pergunta nesse momento

Regra de contexto original (MUITO IMPORTANTE):

Se o lead fez uma pergunta objetiva, toda resposta gerada deve continuar respondendo exatamente essa pergunta.

Mesmo ao encurtar, melhorar, variar ou regenerar:
- nunca perder o contexto original
- nunca transformar a resposta em saudação genérica
- nunca responder como se fosse início de conversa
- nunca trocar uma resposta objetiva por "oi", "bom dia", "olá tudo bem?" ou similares

Exemplos do que NÃO pode acontecer:

Lead: "é da padaria?"
Errado: "Oi, tudo bem?"
Errado: "Bom dia"
Errado: "Olá, tudo bem?"

Lead: "é do açougue?"
Errado: "Tudo certo?"
Errado: "Bom dia"

Lead: "é da farmácia?"
Errado: "Olá, tudo bem?"

Exemplos corretos:

Lead: "é da padaria?"
Correto: "Não, acho que mandou msg errada 🙂"
Correto: "Não, não somos da padaria."

Lead: "é do açougue?"
Correto: "Não, acho que é msg errada."
Correto: "Não kkk, número errado 🙂"

Lead: "é da farmácia?"
Correto: "Não, acho que mandou msg errada 🙂"

Frases proibidas (evitar comportamento de robô):

- "vi que você entrou em contato"
- "como posso ajudar"
- "fico feliz em ajudar"
- "em que posso ajudar hoje"

Nunca usar essas frases.

${modeInstruction ? `Ajuste solicitado:\n${modeInstruction}\n` : ''}
`;

    const completion = await this.getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            `Você é ${agentTitle || 'um atendente'} que conversa com leads pelo WhatsApp. Escreva sempre como uma pessoa real, nunca como assistente virtual. Use linguagem simples, natural e curta. Prefira frases diretas e humanas. Primeiro entenda o que a pessoa quis dizer antes de tentar vender algo. Se a mensagem do lead for apenas uma saudação simples, responda apenas com uma saudação curta e espere a próxima mensagem. Se o lead perguntar "tudo bem" ou "e com vc", responda direto com algo como "Tudo bem também 🙏🏽", "Tudo certo 🙏🏽" ou "Tudo ótimo 🙏🏽", sem cumprimentar de novo, sem reiniciar a conversa e sem fazer nova pergunta. Se o lead fez uma pergunta objetiva, toda resposta deve continuar respondendo exatamente essa pergunta, inclusive em encurtar, regenerar, melhorar ou variar. Nunca troque pergunta objetiva por saudação genérica. Nunca use frases como "vi que você entrou em contato", "como posso ajudar", "fico feliz em ajudar" ou "em que posso ajudar hoje". Responda como alguém experiente, consultivo e tranquilo.`,
        },
        {
          role: 'user',
          content: prompt,
        },
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
        console.error('Erro ao salvar AiExecutionLog', err);
      }
    }

    return output;
  }
}