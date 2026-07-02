/**
 * Cria um cenário completo de teste local pro módulo Pré-Ocupação:
 * empreendimento + torre + unidade vendida + lead com contrato assinado.
 * Roda só contra o banco local (dotenv .env, não mexe em DATABASE_URL).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import { PrismaClient } from '@prisma/client';
import { getNextLeadNumber } from '../src/leads/lead-numbering.helper';

const prisma = new PrismaClient();
const TENANT_ID = '24e9713d-a990-4b29-b86a-902f8df21911';
const PIPELINE_ID = 'c547f132-78f8-4ac3-b8d3-7d95e830b654';
const STAGE_ASSINATURA_ID = '801e0fa4-4d61-496a-b69e-413bb634e7dd';
const BRANCH_ID = 'b4f37511-4360-44d3-986f-fddcd211365a';

async function main() {
  const development = await prisma.development.create({
    data: {
      tenantId: TENANT_ID,
      nome: 'Residencial Teste Pré-Ocupação',
      tipo: 'VERTICAL',
      subtipo: 'APARTAMENTO',
      status: 'EM_OBRA',
      cidade: 'José Bonifácio',
      estado: 'SP',
      publishedAt: new Date(),
    },
  });

  const tower = await prisma.tower.create({
    data: {
      developmentId: development.id,
      tenantId: TENANT_ID,
      nome: 'Torre A',
      floors: 1,
      unitsPerFloor: 1,
    },
  });

  const numero = await prisma.$transaction((tx) => getNextLeadNumber(tx, TENANT_ID));

  const lead = await prisma.lead.create({
    data: {
      tenantId: TENANT_ID,
      numero,
      nome: 'Maria da Silva (Família Teste)',
      telefone: '5511999998888',
      telefoneKey: '999998888',
      cpf: '12345678900',
      origem: 'MANUAL',
      pipelineId: PIPELINE_ID,
      stageId: STAGE_ASSINATURA_ID,
      branchId: BRANCH_ID,
      status: 'QUALIFICADO' as any,
      empreendimentoInteresseId: development.id,
    },
  });

  const unit = await prisma.developmentUnit.create({
    data: {
      towerId: tower.id,
      developmentId: development.id,
      tenantId: TENANT_ID,
      nome: '101',
      andar: 1,
      posicao: 1,
      status: 'VENDIDO',
      comprador: lead.nome,
      leadId: lead.id,
      soldAt: new Date(),
      finalPrice: 250000,
    },
  });

  console.log('Development:', development.id, development.nome);
  console.log('Tower:', tower.id);
  console.log('Unit:', unit.id, unit.nome, unit.status);
  console.log('Lead:', lead.id, `#${lead.numero}`, lead.nome, '- stage: Assinatura de Contrato');
  console.log(`\nAbrir em: http://localhost:3001/leads/${lead.id}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
