/**
 * SOMENTE ANALISA (read-only, não grava nada).
 * Objetivo: ver quais leads VENDIDO do SP9 estão sem CPF (ou CPF inválido) e
 * se dá pra COMPLETAR pegando o CPF da planilha (aba PAG DE CUSTAS CRI) pelo nome.
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
const digits = (s: any) => String(s || '').replace(/\D/g, '');

function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

async function main() {
  const wb = XLSX.readFile(FILE);
  const wsP = wb.Sheets['PAG DE CUSTAS CRI'];
  const rowsP: any[][] = XLSX.utils.sheet_to_json(wsP, { header: 1, defval: '' });
  const headerP = rowsP[0].map((h: any) => norm(h));
  const pNome = headerP.indexOf('NOME');
  const pCpf = headerP.findIndex((h) => h.includes('CPF TITULAR'));

  // mapa nome→cpf da planilha (só CPF válido). Conta também malformados.
  const cpfByName = new Map<string, string>();
  let planilhaInvalidos = 0, planilhaSemCpf = 0;
  for (const r of rowsP.slice(1)) {
    const nome = String(r[pNome]).trim();
    if (!nome) continue;
    const c = digits(r[pCpf]);
    if (!c) { planilhaSemCpf++; continue; }
    if (cpfValido(c)) cpfByName.set(norm(nome), c);
    else planilhaInvalidos++;
  }
  console.log(`Planilha PAG: CPFs válidos mapeados=${cpfByName.size} | inválidos=${planilhaInvalidos} | sem CPF=${planilhaSemCpf}\n`);

  // leads VENDIDO do sistema
  const units = await prisma.developmentUnit.findMany({
    where: { tenantId: T, status: 'VENDIDO', leadId: { not: null } },
    select: { lead: { select: { id: true, nome: true, nomeCorreto: true, cpf: true } } },
  });
  const seen = new Set<string>();
  const leads = units.map((u) => u.lead!).filter((l) => l && !seen.has(l.id) && seen.add(l.id));

  let comCpfValido = 0, comCpfInvalido = 0, semCpf = 0;
  const completaveis: any[] = [];
  const naoCompletaveis: any[] = [];
  const cpfInvalidoNoSistema: any[] = [];

  for (const l of leads) {
    const c = digits(l.cpf);
    if (c && cpfValido(c)) { comCpfValido++; continue; }
    const nm = norm(l.nomeCorreto || l.nome);
    const nm2 = norm(l.nome);
    const fromSheet = cpfByName.get(nm) || cpfByName.get(nm2) || '';
    if (c && !cpfValido(c)) {
      comCpfInvalido++;
      cpfInvalidoNoSistema.push({ nome: l.nomeCorreto || l.nome, cpfAtual: l.cpf, sugestao: fromSheet });
    } else {
      semCpf++;
    }
    if (fromSheet) completaveis.push({ nome: l.nomeCorreto || l.nome, cpfAtual: l.cpf || '—', novo: fromSheet });
    else naoCompletaveis.push({ nome: l.nomeCorreto || l.nome, cpfAtual: l.cpf || '—' });
  }

  console.log(`Leads VENDIDO (distintos): ${leads.length}`);
  console.log(`  ✅ com CPF válido: ${comCpfValido}`);
  console.log(`  ⚠️  com CPF inválido: ${comCpfInvalido}`);
  console.log(`  ❌ sem CPF: ${semCpf}\n`);

  console.log(`▶ Completáveis pela planilha (match por nome, CPF válido): ${completaveis.length}`);
  completaveis.slice(0, 100).forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}. ${c.nome}  | atual: ${c.cpfAtual}  → planilha: ${c.novo}`));

  if (cpfInvalidoNoSistema.length) {
    console.log(`\n⚠️  CPF inválido no sistema (${cpfInvalidoNoSistema.length}):`);
    cpfInvalidoNoSistema.forEach((c, i) => console.log(`   ${i + 1}. ${c.nome} | atual: ${c.cpfAtual} | planilha sugere: ${c.sugestao || '—'}`));
  }

  console.log(`\n✖ Sem CPF e SEM como completar pela planilha: ${naoCompletaveis.length}`);
  naoCompletaveis.slice(0, 100).forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}. ${c.nome} (atual: ${c.cpfAtual})`));

  await prisma.$disconnect();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
