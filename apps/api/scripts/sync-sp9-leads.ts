/**
 * Script de sincronização dos leads SP9 a partir da planilha.
 *
 * O que faz:
 *   1. Lê o CSV e determina o stage final de cada lead (última coluna não-vazia da sequência)
 *   2. Atualiza stageId + pipelineId dos leads existentes (APENAS esses dois campos)
 *   3. Cria LeadTransitionLog para cada etapa da sequência histórica (para o dashboard)
 *   Nunca deleta nem altera outros campos dos leads.
 *
 * Rodar em produção:
 *   DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/sync-sp9-leads.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TENANT_ID = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const CSV_PATH = path.resolve(__dirname, '../../ATUALIZAÇÃO relatorio-leads-2026-05-26.csv');

// ── Mapeamento: posição da coluna de sequência → grupo SP9 ────────────────────
// Cols 17-29 do CSV (índices 0 do array seq = col17, índice 12 = col29)
const SEQ_COL_GROUP = [
  'PRE_ATENDIMENTO',  // col 17
  'PRE_ATENDIMENTO',  // col 18
  'PRE_ATENDIMENTO',  // col 19
  'DOCUMENTACAO',     // col 20
  'DOCUMENTACAO',     // col 21
  'DOCUMENTACAO',     // col 22
  'ESCOLHA_UNIDADE',  // col 23
  'ESCOLHA_UNIDADE',  // col 24
  'CONTRATO',         // col 25
  'CONTRATO',         // col 26
  'CONTRATO',         // col 27
  'REGISTRO',         // col 28
  'REGISTRO',         // col 29
];

// ── Mapeamento: label CSV → chave SP9 por grupo ───────────────────────────────
const LABEL_TO_KEY: Record<string, Record<string, string>> = {
  PRE_ATENDIMENTO: {
    'NOVO LEAD':                  'SP9_NOVO_LEAD',
    'EM CONTATO':                 'SP9_EM_CONTATO',
    'REATIVAÇÃO DO INSCRITO':     'SP9_REATIVACAO_INSCRITO',
    'REATIVACAO DO INSCRITO':     'SP9_REATIVACAO_INSCRITO',
    'LEAD APTO':                  'SP9_LEAD_APTO',
    'LEAD NÃO APTO':              'SP9_LEAD_NAO_APTO',
    'LEAD NAO APTO':              'SP9_LEAD_NAO_APTO',
    'PAROU DE RESPONDER':         'SP9_PAROU_RESPONDER',
    'SUSPENSÃO':                  'SP9_SUSPENSAO_PRE',
    'SUSPENSAO':                  'SP9_SUSPENSAO_PRE',
    'EXCLUSÃO DO INSCRITO':       'SP9_EXCLUSAO_PRE',
    'EXCLUSAO DO INSCRITO':       'SP9_EXCLUSAO_PRE',
    'DESISTÊNCIA DO INSCRITO':    'SP9_DESISTENCIA_PRE',
    'DESISTENCIA DO INSCRITO':    'SP9_DESISTENCIA_PRE',
    'DESISTENCIA':                'SP9_DESISTENCIA_PRE',
  },
  DOCUMENTACAO: {
    'DOCS PENDENTE':              'SP9_DOCS_PENDENTE',
    'DOCS EM ANALISE CDHU':       'SP9_DOCS_ANALISE_CDHU',
    'DOCS EM ANÁLISE CDHU':       'SP9_DOCS_ANALISE_CDHU',
    'DOCS APROVADOS':             'SP9_DOCS_APROVADOS',
    'DOCs APROVADOS':             'SP9_DOCS_APROVADOS',
    'DOCS REPROVADO':             'SP9_DOCS_REPROVADO',
    'DOCs REPROVADO':             'SP9_DOCS_REPROVADO',
    'REPROVADO':                  'SP9_DOCS_REPROVADO',
    'SUSPENSÃO':                  'SP9_SUSPENSAO_DOC',
    'SUSPENSAO':                  'SP9_SUSPENSAO_DOC',
    'EXCLUSÃO DO INSCRITO':       'SP9_EXCLUSAO_DOC',
    'EXCLUSAO DO INSCRITO':       'SP9_EXCLUSAO_DOC',
    'DESISTÊNCIA DO INSCRITO':    'SP9_DESISTENCIA_DOC',
    'DESISTENCIA DO INSCRITO':    'SP9_DESISTENCIA_DOC',
    'DESISTENCIA':                'SP9_DESISTENCIA_DOC',
  },
  ESCOLHA_UNIDADE: {
    'AGUAR. UNIDADE':             'SP9_AGUARD_UNIDADE',
    'AGUARD. UNIDADE':            'SP9_AGUARD_UNIDADE',
    'UNIDADE VINCULADA':          'SP9_UNIDADE_VINCULADA',
    'SUSPENSÃO':                  'SP9_SUSPENSAO_UNIDADE',
    'SUSPENSAO':                  'SP9_SUSPENSAO_UNIDADE',
    'EXCLUSÃO DO INSCRITO':       'SP9_EXCLUSAO_UNIDADE',
    'EXCLUSAO DO INSCRITO':       'SP9_EXCLUSAO_UNIDADE',
    'DESISTÊNCIA DO INSCRITO':    'SP9_DESISTENCIA_UNIDADE',
    'DESISTENCIA DO INSCRITO':    'SP9_DESISTENCIA_UNIDADE',
    'DESISTENCIA':                'SP9_DESISTENCIA_UNIDADE',
  },
  CONTRATO: {
    'AGUARD. EMISSÃO DE CONTRATO':    'SP9_AGUARD_EMISSAO',
    'AGUARD. EMISSAO DE CONTRATO':    'SP9_AGUARD_EMISSAO',
    'AGUARD. ASSINATURA DE CONTRATO': 'SP9_AGUARD_ASSINATURA',
    'CONTRATO ASSINADO':              'SP9_CONTRATO_ASSINADO',
    'SUSPENSÃO':                      'SP9_SUSPENSAO_CONT',
    'SUSPENSAO':                      'SP9_SUSPENSAO_CONT',
    'EXCLUSÃO DO INSCRITO':           'SP9_EXCLUSAO_CONT',
    'EXCLUSAO DO INSCRITO':           'SP9_EXCLUSAO_CONT',
    'DESISTÊNCIA DO INSCRITO':        'SP9_DESISTENCIA_CONT',
    'DESISTENCIA DO INSCRITO':        'SP9_DESISTENCIA_CONT',
    'DESISTENCIA':                    'SP9_DESISTENCIA_CONT',
  },
  REGISTRO: {
    'EM REGISTRO':  'SP9_EM_REGISTRO',
    'REGISTRADO':   'SP9_REGISTRADO',
  },
};

function normLabel(s: string): string {
  return s.trim().toUpperCase()
    .replace(/Ç/g, 'C').replace(/ç/g, 'C')  // Ç/ç
    .replace(/Õ/g, 'O').replace(/õ/g, 'O')  // Õ/õ
    .replace(/Ã/g, 'A').replace(/ã/g, 'A')  // Ã/ã
    .replace(/Ê/g, 'E').replace(/ê/g, 'E')  // Ê/ê
    .replace(/é/g, 'E').replace(/É/g, 'E')  // É/é
    .replace(/â/g, 'A').replace(/Â/g, 'A')  // Â/â
    .trim();
}

function resolveKey(label: string, group: string): string | null {
  const map = LABEL_TO_KEY[group];
  if (!map) return null;
  const upper = label.trim().toUpperCase();
  // try exact match first
  if (map[upper]) return map[upper];
  // try normalized match
  const norm = normLabel(upper);
  for (const [k, v] of Object.entries(map)) {
    if (normLabel(k) === norm) return v;
  }
  return null;
}

async function main() {
  console.log('🚀 Sincronizando leads SP9 a partir da planilha...\n');

  // ── 1. Carregar todas as stages ativas do SP9 ─────────────────────────────
  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true },
  });
  if (!pipeline) throw new Error('Pipeline SP9 não encontrado');

  const sp9Stages = await prisma.pipelineStage.findMany({
    where: { tenantId: TENANT_ID, pipelineId: pipeline.id, isActive: true },
    select: { id: true, key: true, name: true, group: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });

  const stageByKey = new Map(sp9Stages.map(s => [s.key, s]));

  console.log(`✅ ${sp9Stages.length} stages SP9 carregadas.\n`);

  // ── 2. Ler e parsear o CSV ────────────────────────────────────────────────
  const raw = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^﻿/, ''); // remove BOM
  const lines = raw.split('\n').filter(l => l.trim());
  const dataRows = lines.slice(2); // skip 2 header rows

  console.log(`📄 ${dataRows.length} linhas de dados no CSV.\n`);

  // ── 3. Processar cada linha ───────────────────────────────────────────────
  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let logsCreated = 0;
  let unmapped: string[] = [];

  for (const line of dataRows) {
    const cols = line.split(';');
    const rawNum = cols[0]?.trim();
    if (!rawNum) continue;

    const numero = parseInt(rawNum);
    if (isNaN(numero) || numero <= 0) continue;

    // Sequência: cols 17-29 (índices 16-28)
    const seq = cols.slice(16, 29).map(s => s.trim());

    // Mapeia cada célula da sequência para um stageKey SP9
    const stageSequence: Array<{ key: string; stage: typeof sp9Stages[0] }> = [];
    for (let i = 0; i < seq.length; i++) {
      const label = seq[i];
      if (!label) continue;
      const group = SEQ_COL_GROUP[i];
      const key = resolveKey(label, group);
      if (!key) {
        unmapped.push(`[${group}] "${label}"`);
        continue;
      }
      const stage = stageByKey.get(key);
      if (!stage) {
        unmapped.push(`key não encontrada no DB: ${key}`);
        continue;
      }
      stageSequence.push({ key, stage });
    }

    if (stageSequence.length === 0) continue;

    // Stage final = último da sequência
    const finalEntry = stageSequence[stageSequence.length - 1];
    const finalStage = finalEntry.stage;

    // Buscar lead no DB
    const lead = await prisma.lead.findFirst({
      where: { tenantId: TENANT_ID, numero, deletedAt: null },
      select: { id: true, stageId: true, pipelineId: true },
    });

    if (!lead) {
      console.warn(`  ⚠️  Lead #${numero} não encontrado no banco`);
      notFound++;
      continue;
    }

    // ── Atualizar stageId se necessário ────────────────────────────────────
    if (lead.stageId !== finalStage.id || lead.pipelineId !== pipeline.id) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { stageId: finalStage.id, pipelineId: pipeline.id },
      });
      updated++;
    } else {
      skipped++;
    }

    // ── Criar LeadTransitionLog para cada etapa da sequência ───────────────
    // Verifica se já existe log para este lead
    const existingLogs = await prisma.leadTransitionLog.findMany({
      where: { tenantId: TENANT_ID, leadId: lead.id },
      select: { toStage: true },
    });
    const existingToStages = new Set(existingLogs.map(l => l.toStage.toLowerCase()));

    // Data base: usar criadoEm do lead ou a data do CSV
    const csvDateStr = cols[8]?.trim(); // col 9 = Data de Criação (DD/MM/YYYY)
    let baseDate = new Date();
    if (csvDateStr) {
      const [d, m, y] = csvDateStr.split('/');
      if (d && m && y) baseDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 8, 0, 0);
    }

    let minuteOffset = 0;
    for (const entry of stageSequence) {
      const stageName = entry.stage.name;
      if (existingToStages.has(stageName.toLowerCase())) continue; // já existe

      const logDate = new Date(baseDate.getTime() + minuteOffset * 60_000);
      await prisma.leadTransitionLog.create({
        data: {
          tenantId: TENANT_ID,
          leadId: lead.id,
          fromStage: minuteOffset === 0 ? null : (stageSequence[stageSequence.indexOf(entry) - 1]?.stage.name ?? null),
          toStage: stageName,
          changedBy: 'IMPORTACAO_SP9',
          createdAt: logDate,
        },
      });
      logsCreated++;
      minuteOffset += 30; // 30 min entre cada etapa histórica
    }
  }

  // ── 4. Resumo ─────────────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('📊 RESUMO');
  console.log('═'.repeat(60));
  console.log(`  Leads atualizados (stageId):  ${updated}`);
  console.log(`  Leads já corretos (skip):      ${skipped}`);
  console.log(`  Leads não encontrados no DB:   ${notFound}`);
  console.log(`  LeadTransitionLog criados:     ${logsCreated}`);

  if (unmapped.length > 0) {
    const unique = [...new Set(unmapped)];
    console.log(`\n⚠️  Labels sem mapeamento (${unique.length}):`);
    unique.forEach(u => console.log(`   - ${u}`));
  }

  console.log('═'.repeat(60));
  console.log('\n✅ Sincronização concluída!');
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
