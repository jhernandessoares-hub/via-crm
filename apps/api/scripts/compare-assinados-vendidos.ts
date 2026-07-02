/**
 * SOMENTE COMPARA (read-only, não grava nada).
 * Planilha "POSIÇÃO VENDAS 11_06.xlsx" (aba ASSINADOS) = todos os assinados.
 * Para cada assinado, procura no sistema entre os leads marcados VENDIDO:
 *   1) por nome do titular;  2) por CPF;  3) por nome do cônjuge.
 * Se não achar de jeito nenhum → reporta na lista final.
 */
process.env.DATABASE_URL =
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';
const XLSX = require('D:/via-crm/apps/api/node_modules/xlsx');

const prisma = new PrismaClient();
const T = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const FILE = 'D:/via-crm/apps/ATUALIZA CRM SP9/POSIÇÃO VENDAS 11_06.xlsx';

const norm = (s: any) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const cpfDigits = (s: any) => String(s || '').replace(/\D/g, '');

async function main() {
  const wb = XLSX.readFile(FILE);

  // ── FONTE: aba PAG DE CUSTAS CRI (titular + cônjuge na mesma linha) ──
  const wsP = wb.Sheets['PAG DE CUSTAS CRI'];
  const rowsP: any[][] = XLSX.utils.sheet_to_json(wsP, { header: 1, defval: '' });
  const headerP = rowsP[0].map((h: any) => norm(h));
  const pNome = headerP.indexOf('NOME');
  const pCpf = headerP.findIndex((h) => h.includes('CPF TITULAR'));
  const pConj = headerP.findIndex((h) => h.includes('CONJU') && !h.includes('CPF'));
  const pApto = headerP.indexOf('APTO');
  const pAss = headerP.findIndex((h) => h.includes('CONTRATO ASSINADO'));

  const dataP = rowsP.slice(1).filter((r) => String(r[pNome]).trim());
  const okP = dataP.filter((r) => norm(r[pAss]) === 'OK');
  const assinados = okP.map((r) => ({
    nome: String(r[pNome]).trim(),
    cpf: cpfDigits(r[pCpf]),
    apto: String(r[pApto]).trim(),
    conjuge: String(r[pConj] || '').trim(),
  }));
  console.log(`PAG DE CUSTAS CRI: ${dataP.length} linhas com nome | CONTRATO ASSINADO=OK: ${okP.length}`);

  // ── Sistema: leads VENDIDO (unidade status=VENDIDO) com cônjuges ──
  const units = await prisma.developmentUnit.findMany({
    where: { tenantId: T, status: 'VENDIDO', leadId: { not: null } },
    select: { lead: { select: { id: true, nome: true, nomeCorreto: true, cpf: true, participantes: { select: { nome: true } } } } },
  });
  const nameSet = new Set<string>();
  const cpfSet = new Set<string>();
  for (const u of units) {
    const l = u.lead!;
    if (l.nome) nameSet.add(norm(l.nome));
    if (l.nomeCorreto) nameSet.add(norm(l.nomeCorreto));
    if (l.cpf) cpfSet.add(cpfDigits(l.cpf));
    for (const part of l.participantes) if (part.nome) nameSet.add(norm(part.nome));
  }
  console.log(`Sistema: ${units.length} unidades VENDIDO com lead | nomes indexados: ${nameSet.size} | CPFs: ${cpfSet.size}\n`);

  // ── Comparação ──
  const naoEncontrados: { nome: string; cpf: string; apto: string; conjuge: string }[] = [];
  const stats = { nome: 0, cpf: 0, conjuge: 0, nao: 0 };
  for (const a of assinados) {
    if (nameSet.has(norm(a.nome))) { stats.nome++; continue; }
    if (a.cpf && a.cpf.length >= 11 && cpfSet.has(a.cpf)) { stats.cpf++; continue; }
    if (a.conjuge && nameSet.has(norm(a.conjuge))) { stats.conjuge++; continue; }
    stats.nao++;
    naoEncontrados.push({ nome: a.nome, cpf: a.cpf, apto: a.apto, conjuge: a.conjuge });
  }

  console.log(`✅ Encontrados — por nome: ${stats.nome} | por CPF: ${stats.cpf} | por cônjuge: ${stats.conjuge}`);
  console.log(`❌ NÃO encontrados como VENDIDO: ${stats.nao}\n`);
  if (naoEncontrados.length) {
    console.log('=== NÃO ENCONTRADOS (assinados na planilha, sem lead VENDIDO no sistema) ===');
    naoEncontrados.forEach((n, i) =>
      console.log(`${String(i + 1).padStart(2)}. ${n.nome}  | CPF ${n.cpf || '—'} | Apto ${n.apto || '—'}${n.conjuge ? ' | cônjuge testado: ' + n.conjuge : ''}`));
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
