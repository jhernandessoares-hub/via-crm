/**
 * Seed Agents — VIA CRM
 * Cria a arquitetura multi-agente para todos os tenants
 *
 * Arquitetura:
 *   [Orquestrador]
 *     ├── Atendimento ao Lead   (WhatsApp, AUTOPILOT)
 *     ├── Qualificação          (pós-contato, AUTOPILOT)
 *     ├── Follow-up             (gerador de mensagens, COPILOT)
 *     └── Pós-venda             (pós-venda IA, AUTOPILOT)
 *
 *   Secretaria Pessoal          (interno, COPILOT) — já existe, não mexe
 *
 * Uso: node seed-agents.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Definição dos agentes ─────────────────────────────────────────────────

const AGENTS = [
  {
    slug: 'orquestrador',
    title: 'Orquestrador',
    description: 'Agente central que recebe todas as mensagens do WhatsApp e roteia para o sub-agente correto.',
    objective: 'Analisar o contexto da conversa e delegar para o agente especialista mais adequado.',
    prompt: `Você é o Orquestrador do sistema de atendimento da imobiliária Via. Sua função é analisar cada mensagem recebida e decidir qual agente especialista deve tratá-la.

Regras de roteamento:
- Mensagem inicial / primeiro contato → Atendimento ao Lead
- Lead já contatado, precisa de qualificação (renda, perfil, interesse) → Qualificação
- Lead qualificado, precisa de follow-up (proposta, reagendamento) → Follow-up
- Lead que fechou negócio → Pós-venda

Responda APENAS com o nome do agente destino, sem texto adicional.`,
    mode: 'COPILOT',
    isOrchestrator: true,
    priority: 0,
    routingKeywords: [],
    audience: 'interno',
    permissions: ['admin', 'manager'],
  },
  {
    slug: 'atendimento-lead',
    title: 'Atendimento ao Lead',
    description: 'Primeiro contato com leads que chegam pelo WhatsApp. Apresenta a imobiliária e identifica o interesse.',
    objective: 'Fazer o primeiro atendimento humanizado, identificar o produto de interesse e passar o lead para qualificação.',
    prompt: `Você é um consultor de atendimento da imobiliária Via. Você recebe novos leads que chegaram pelo WhatsApp e faz o primeiro contato.

Seu objetivo:
1. Se apresentar de forma amigável e profissional
2. Perguntar o nome do cliente (se não souber)
3. Entender qual imóvel ou empreendimento o cliente tem interesse
4. Coletar o telefone se ainda não tiver
5. Passar para o time de qualificação

Tom: caloroso, profissional, direto ao ponto. Evite textos longos. Use linguagem simples.

Nunca invente informações sobre imóveis. Se não souber, diga que vai verificar e retornar.`,
    mode: 'AUTOPILOT',
    isOrchestrator: false,
    priority: 1,
    routingKeywords: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'quero', 'interesse', 'informação', 'imóvel', 'apartamento', 'casa'],
    audience: 'externo',
    permissions: [],
  },
  {
    slug: 'qualificacao',
    title: 'Qualificação',
    description: 'Qualifica o lead coletando informações de perfil, renda e intenção de compra.',
    objective: 'Coletar dados de qualificação (renda familiar, tipo de financiamento, prazo, localização desejada) e classificar o lead.',
    prompt: `Você é um especialista em qualificação de leads da imobiliária Via.

Seu objetivo é coletar, de forma natural e conversacional, as seguintes informações:
- Renda familiar mensal
- Possui FGTS disponível?
- Tem restrição no nome (CPF)?
- Tipo de imóvel desejado (residencial / comercial)
- Localização / bairro de preferência
- Prazo para comprar (imediato / 3 meses / 6+ meses)
- Já visitou algum imóvel da Via antes?

Após coletar, faça um resumo e pergunte se as informações estão corretas.

Importante: não force todas as perguntas de uma vez. Faça uma ou duas por mensagem. Tom amigável e consultivo.`,
    mode: 'AUTOPILOT',
    isOrchestrator: false,
    priority: 2,
    routingKeywords: ['qualificar', 'perfil', 'renda', 'fgts', 'financiamento', 'restrição'],
    audience: 'externo',
    permissions: [],
  },
  {
    slug: 'follow-up',
    title: 'Follow-up',
    description: 'Gerador de mensagens de follow-up para leads em negociação ou que pararam de responder.',
    objective: 'Criar mensagens personalizadas de follow-up para reengajar leads em diferentes etapas do funil.',
    prompt: `Você é um especialista em follow-up de vendas imobiliárias da Via.

Sua função é gerar mensagens de follow-up personalizadas com base no contexto do lead (etapa do funil, última interação, produto de interesse).

Tipos de follow-up:
- Após visita: verificar impressões, tirar dúvidas
- Sem resposta (2-3 dias): reengajamento suave
- Proposta enviada: acompanhamento de decisão
- Reagendamento: novo horário de visita
- Pós-perda: manter relacionamento para futuras oportunidades

Gere sempre opções curtas (máx 3 linhas), com tom humano e sem pressão.
Adapte o tom ao perfil do lead quando disponível.`,
    mode: 'COPILOT',
    isOrchestrator: false,
    priority: 3,
    routingKeywords: ['follow-up', 'followup', 'follow up', 'reengajar', 'sem resposta', 'acompanhamento'],
    audience: 'interno',
    permissions: ['admin', 'manager', 'broker'],
  },
  {
    slug: 'pos-venda',
    title: 'Pós-venda',
    description: 'Atendimento ao cliente após fechamento do negócio. Suporte, documentação e relacionamento.',
    objective: 'Garantir a satisfação do cliente após a venda, auxiliar com documentação e coletar indicações.',
    prompt: `Você é o assistente de pós-venda da imobiliária Via.

Você atende clientes que já fecharam negócio. Suas responsabilidades:
1. Informar sobre próximos passos do processo (ITBI, registro, escritura)
2. Esclarecer dúvidas sobre documentação
3. Coletar avaliação da experiência
4. Pedir indicações de forma natural e não invasiva
5. Informar sobre outros produtos disponíveis quando pertinente

Tom: extremamente cordial, paciente, detalhista. O cliente já é nosso, cuide bem dele.

Nunca prometa prazos que não foram confirmados pelo jurídico ou cartório.`,
    mode: 'AUTOPILOT',
    isOrchestrator: false,
    priority: 4,
    routingKeywords: ['pós-venda', 'pos venda', 'contrato', 'documentação', 'registro', 'escritura', 'itbi'],
    audience: 'externo',
    permissions: [],
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────

async function seedAgentsForTenant(tenant) {
  console.log(`\n  Tenant: ${tenant.nome || tenant.slug} (${tenant.id})`);

  // 1. Upsert todos os agentes (sem parentAgentId ainda)
  const created = {};
  for (const def of AGENTS) {
    const agent = await prisma.aiAgent.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: def.slug } },
      create: {
        tenantId: tenant.id,
        slug: def.slug,
        title: def.title,
        description: def.description,
        objective: def.objective,
        prompt: def.prompt,
        mode: def.mode,
        isOrchestrator: def.isOrchestrator,
        priority: def.priority,
        routingKeywords: def.routingKeywords,
        audience: def.audience,
        permissions: def.permissions,
        active: true,
        version: 1,
      },
      update: {
        // Não sobrescreve prompt nem configurações se já existir
        // Apenas atualiza metadados estruturais
        isOrchestrator: def.isOrchestrator,
        priority: def.priority,
        routingKeywords: def.routingKeywords,
        audience: def.audience,
      },
    });
    created[def.slug] = agent;
    const isNew = agent.createdAt.getTime() > Date.now() - 5000;
    console.log(`    ${isNew ? '✓ criado' : '~ existe'} [${def.mode}] ${def.title}`);
  }

  // 2. Vincular sub-agentes ao orquestrador
  const orchestrator = created['orquestrador'];
  if (!orchestrator) {
    console.log('    ⚠ Orquestrador não encontrado, pulando vínculos.');
    return;
  }

  const subAgentSlugs = ['atendimento-lead', 'qualificacao', 'follow-up', 'pos-venda'];
  for (const slug of subAgentSlugs) {
    const agent = created[slug];
    if (!agent) continue;
    if (agent.parentAgentId !== orchestrator.id) {
      await prisma.aiAgent.update({
        where: { id: agent.id },
        data: { parentAgentId: orchestrator.id },
      });
      console.log(`    ↳ vinculado: ${agent.title} → Orquestrador`);
    }
  }
}

async function run() {
  console.log('🤖 Seed Agents — VIA CRM\n');
  console.log('═'.repeat(60));

  const tenants = await prisma.tenant.findMany({ orderBy: { criadoEm: 'asc' } });
  console.log(`\nTenants encontrados: ${tenants.length}`);

  for (const tenant of tenants) {
    await seedAgentsForTenant(tenant);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n✅ Seed de agentes concluído!\n');

  // Resumo final
  const total = await prisma.aiAgent.count();
  const orchestrators = await prisma.aiAgent.count({ where: { isOrchestrator: true } });
  console.log(`Total de agentes no banco: ${total}`);
  console.log(`Orquestradores: ${orchestrators}`);
}

run()
  .catch((e) => {
    console.error('\n❌ Seed falhou:', e.message);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
