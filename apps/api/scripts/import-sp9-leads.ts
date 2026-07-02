/**
 * Script de importação: leads SP9 (PPP - José Bonifácio)
 * Lê a planilha Excel, cria leads no CRM e vincula às unidades existentes.
 *
 * Configurar as constantes abaixo antes de rodar.
 * Rodar: npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/import-sp9-leads.ts
 */

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────
// Preencher com a DATABASE_PUBLIC_URL de produção (Railway → PostgreSQL → Variables → DATABASE_PUBLIC_URL)
process.env.DATABASE_URL = 'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

const TENANT_ID      = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const DEVELOPMENT_ID = '41da19cb-8450-447b-aa12-50196b5a82b5';
// ─────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXCEL_PATH = path.resolve(__dirname, '../../LISTA DE NOME DA TABELA DE PREÇO.xlsx');
const SHEET_NAME = 'SUBIR NO CRM - SP9';

// Índices das colunas (0-based, linha de dados começa na linha 2 da planilha)
const COL = {
  OCORRENCIA:         2,
  NOME:               3,
  CPF:                4,
  INDICACAO:          5,
  GRUPO:              8,
  FAIXA_RENDA:        9,
  RENDA:              10,
  SITUACAO_CONTRATO:  13,
  ENDERECO_CRM:       14,
  APTO:               15,
};

const STAGE_MAP: Record<string, { key: string; name: string; sortOrder: number }> = {
  EMITIDO:    { key: 'CONTRATO_EMITIDO',    name: 'Contrato Emitido',    sortOrder: 80 },
  REGISTRADO: { key: 'CONTRATO_REGISTRADO', name: 'Contrato Registrado', sortOrder: 85 },
  ASSINADO:   { key: 'CONTRATO_ASSINADO',   name: 'Contrato Assinado',   sortOrder: 90 },
};

// Normaliza CPF: remove pontos, traços e espaços
function normalizeCpf(raw: string): string {
  return raw.replace(/[.\-\s]/g, '').trim();
}

// Extrai a letra identificadora do bloco a partir do nome da torre
// "Torre A (Oeste)" → "A" | "Bloco B" → "B"
function extractBlocoLetra(towerNome: string): string {
  const m = towerNome.match(/\b([A-Z])\b/);
  return m ? m[1] : towerNome.trim().slice(-1).toUpperCase();
}

// Tenta variações de APTO para contornar erros de digitação na planilha
// "1101" → ["1101", "11001"] (pode ser andar 11 pos 01 com pad 2 ou pad 3)
function aptoVariants(apto: string): string[] {
  const variants = [apto];
  // Se 4 dígitos começando com 11, 12, 13 → pode ser andar com 2 dígitos sem pad 3
  if (/^1[123]\d{2}$/.test(apto)) {
    variants.push(`${apto.slice(0, 2)}0${apto.slice(2)}`);
  }
  return variants;
}

async function main() {
  console.log('🚀 Iniciando importação SP9...\n');

  // ── 1. Carregar unidades do empreendimento ────────────────────────────────
  const units = await prisma.developmentUnit.findMany({
    where: { developmentId: DEVELOPMENT_ID, tenantId: TENANT_ID },
    include: { tower: { select: { nome: true } } },
  });

  if (units.length === 0) {
    console.error('❌ Nenhuma unidade encontrada para o empreendimento. Verifique os IDs.');
    process.exit(1);
  }
  console.log(`✅ ${units.length} unidades carregadas do empreendimento.\n`);

  // Mapa principal: "A:7009" → unit
  const unitByBlocoApto = new Map<string, typeof units[0]>();
  // Mapa fallback: "7009" → unit (usado quando planilha não tem bloco)
  const unitByApto = new Map<string, typeof units[0]>();

  for (const unit of units) {
    const blocoLetra = extractBlocoLetra((unit as any).tower.nome);
    // Unidades têm nome no formato "Apto 7009" — strip do prefixo para bater com a planilha
    const nomeKey = unit.nome.replace(/^Apto\s+/i, '').trim();
    unitByBlocoApto.set(`${blocoLetra}:${nomeKey}`, unit);
    // Para fallback, se dois blocos têm o mesmo APTO, o primeiro encontrado vence
    if (!unitByApto.has(nomeKey)) {
      unitByApto.set(nomeKey, unit);
    }
  }

  // ── 2. Pipeline e stages ──────────────────────────────────────────────────
  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: TENANT_ID, isActive: true },
  });
  if (!pipeline) {
    console.error('❌ Nenhum pipeline ativo encontrado para o tenant.');
    process.exit(1);
  }

  const stageIds: Record<string, string> = {};
  for (const [situacao, cfg] of Object.entries(STAGE_MAP)) {
    const existing = await prisma.pipelineStage.findFirst({
      where: { tenantId: TENANT_ID, pipelineId: pipeline.id, key: cfg.key },
    });
    if (existing) {
      stageIds[situacao] = existing.id;
    } else {
      const created = await prisma.pipelineStage.create({
        data: {
          tenantId: TENANT_ID,
          pipelineId: pipeline.id,
          key: cfg.key,
          name: cfg.name,
          sortOrder: cfg.sortOrder,
          isActive: true,
        },
      });
      stageIds[situacao] = created.id;
      console.log(`  ✅ Stage criada: "${cfg.name}"`);
    }
  }

  // ── 3. Branch padrão ─────────────────────────────────────────────────────
  const branch = await prisma.branch.findFirst({ where: { tenantId: TENANT_ID } });
  if (!branch) {
    console.error('❌ Nenhuma branch encontrada para o tenant.');
    process.exit(1);
  }

  // ── 4. Ler planilha ───────────────────────────────────────────────────────
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    console.error(`❌ Aba "${SHEET_NAME}" não encontrada no arquivo.`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  // Linha 0 é cabeçalho, dados começam na linha 1
  const dataRows = rows.slice(1).filter((r: any[]) => r[COL.NOME]?.toString().trim());

  console.log(`📋 ${dataRows.length} linhas com nome encontradas na planilha.\n`);
  console.log('─'.repeat(60));

  // ── 5. Contadores para log final ──────────────────────────────────────────
  let criados = 0;
  let duplicatas = 0;
  let unidadesVinculadas = 0;
  let unidadesNaoEncontradas: string[] = [];
  let semApto = 0;
  let semBloco = 0;

  // ── 6. Loop principal ─────────────────────────────────────────────────────
  for (const row of dataRows as any[][]) {
    const nome         = row[COL.NOME]?.toString().trim() ?? '';
    const cpfRaw       = row[COL.CPF]?.toString().trim() ?? '';
    const cpf          = cpfRaw ? normalizeCpf(cpfRaw) : null;
    const rendaRaw     = row[COL.RENDA]?.toString().replace(',', '.').trim();
    const renda        = rendaRaw ? parseFloat(rendaRaw) : null;
    const ocorrencia   = row[COL.OCORRENCIA]?.toString().trim() || null;
    const indicacao    = row[COL.INDICACAO]?.toString().trim() || null;
    const grupo        = row[COL.GRUPO]?.toString().trim() || null;
    const faixaRenda   = row[COL.FAIXA_RENDA]?.toString().trim() || null;
    const situacao     = row[COL.SITUACAO_CONTRATO]?.toString().trim().toUpperCase() ?? '';
    const enderecoCrm  = row[COL.ENDERECO_CRM]?.toString().trim() ?? '';
    const aptoRaw      = row[COL.APTO]?.toString().trim() ?? '';

    // Stage pelo status do contrato
    const stageId = stageIds[situacao] ?? null;

    // Criar lead ou reusar existente pelo CPF
    let leadId: string;
    try {
      const existingLead = cpf
        ? await prisma.lead.findFirst({ where: { tenantId: TENANT_ID, cpf, deletedAt: null }, select: { id: true } })
        : null;

      if (existingLead) {
        leadId = existingLead.id;
        duplicatas++;
        process.stdout.write(`  ♻️  Já existe: ${nome} — vinculando unidade\n`);
      } else {
        const lead = await prisma.$transaction(async (tx) => {
          const counter = await tx.tenantLeadCounter.upsert({
            where: { tenantId: TENANT_ID },
            create: { tenantId: TENANT_ID, lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
            select: { lastNumber: true },
          });
          return tx.lead.create({
            data: {
              tenantId: TENANT_ID,
              branchId: branch.id,
              pipelineId: pipeline.id,
              stageId,
              numero: counter.lastNumber,
              reentradaCount: 1,
              nome,
              cpf: cpf || undefined,
              rendaBrutaFamiliar: renda || undefined,
              origem: 'IMPORTACAO_SP9',
              status: 'QUALIFICADO',
              cadastroOrigem: {
                codigoOcorrencia: ocorrencia,
                grupoMcmv: grupo,
                faixaRenda: faixaRenda,
                indicacao: indicacao,
              },
            },
            select: { id: true, numero: true },
          });
        });
        leadId = lead.id;
        criados++;
        process.stdout.write(`  ✅ [${String(lead.numero).padStart(5, '0')}] ${nome}\n`);
      }
    } catch (err: any) {
      console.error(`  ❌ Erro ao criar lead "${nome}": ${err.message}`);
      continue;
    }

    // Vincular unidade
    if (!aptoRaw) {
      semApto++;
      continue;
    }

    // Extrair bloco do ENDEREÇO CRM: "B:A AP:7009" → blocoLetra = "A"
    let unit: typeof units[0] | undefined;
    const blocoMatch = enderecoCrm.match(/B:(\w+)/);

    if (blocoMatch) {
      const blocoLetra = blocoMatch[1].toUpperCase();
      // Tentar o APTO diretamente e variantes
      for (const v of aptoVariants(aptoRaw)) {
        unit = unitByBlocoApto.get(`${blocoLetra}:${v}`);
        if (unit) break;
      }
    } else {
      // Sem bloco identificado — buscar pelo APTO em todas as torres
      semBloco++;
      for (const v of aptoVariants(aptoRaw)) {
        unit = unitByApto.get(v);
        if (unit) break;
      }
    }

    if (unit) {
      await prisma.developmentUnit.update({
        where: { id: unit.id },
        data: {
          leadId,
          comprador: nome,
          status: 'VENDIDO',
        },
      });
      unidadesVinculadas++;
    } else {
      unidadesNaoEncontradas.push(`${blocoMatch ? blocoMatch[1] + ':' : '?:'}${aptoRaw} (${nome})`);
    }
  }

  // ── 7. Log final ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESULTADO DA IMPORTAÇÃO');
  console.log('═'.repeat(60));
  console.log(`✅ Leads criados:           ${criados}`);
  console.log(`✅ Unidades vinculadas:      ${unidadesVinculadas}`);
  console.log(`⚠️  Duplicatas (ignoradas):  ${duplicatas}`);
  console.log(`⚠️  Sem APTO:                ${semApto}`);
  console.log(`⚠️  Sem bloco (inferido):    ${semBloco}`);
  if (unidadesNaoEncontradas.length > 0) {
    console.log(`\n❌ Unidades não encontradas (${unidadesNaoEncontradas.length}):`);
    unidadesNaoEncontradas.forEach((u) => console.log(`   • ${u}`));
  }
  console.log('═'.repeat(60));
}

main()
  .catch((e) => { console.error('❌ Erro fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
