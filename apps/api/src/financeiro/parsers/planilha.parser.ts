import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ParsedTransaction } from './parser.types';

// CSV/Excel de extrato: exige colunas Data, Descrição e Valor (a tela de upload
// documenta o layout e oferece modelo). Cabeçalho localizado por nome normalizado,
// em qualquer ordem; linhas acima do cabeçalho (título do banco etc.) são ignoradas.

function normalizeHeader(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** "1.234,56", "-R$ 123,45", "1234.56", número → number com sinal */
function parseMoneyCell(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? '').trim();
  if (!s) return null;
  const negative = /^-/.test(s) || /^\(.*\)$/.test(s) || /D$/i.test(s); // "-", "(123,45)" ou sufixo D = débito
  s = s.replace(/[R$\s()-]/gi, '').replace(/[CD]$/i, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  if (!isFinite(n) || n === 0) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

/** Date | "DD/MM/YYYY" | "YYYY-MM-DD" → "YYYY-MM-DD" */
function parseDateCell(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // cellDates:true retorna Date local — usa componentes locais para não deslocar o dia
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function parsePlanilha(buffer: Buffer): ParsedTransaction[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new BadRequestException('Não foi possível ler a planilha — envie CSV, XLS ou XLSX válido');
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new BadRequestException('Planilha vazia');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Localiza a linha de cabeçalho (Data / Descrição / Valor)
  let headerRow = -1;
  let colData = -1;
  let colDesc = -1;
  let colValor = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map(normalizeHeader);
    const iData = cells.findIndex((c) => c === 'data' || c.startsWith('data '));
    const iDesc = cells.findIndex((c) => c.startsWith('descri') || c === 'historico' || c === 'histórico' || c === 'lancamento');
    const iValor = cells.findIndex((c) => c === 'valor' || c.startsWith('valor '));
    if (iData >= 0 && iDesc >= 0 && iValor >= 0) {
      headerRow = i;
      colData = iData;
      colDesc = iDesc;
      colValor = iValor;
      break;
    }
  }
  if (headerRow < 0) {
    throw new BadRequestException(
      'Cabeçalho não encontrado — a planilha precisa das colunas "Data", "Descrição" e "Valor"',
    );
  }

  const out: ParsedTransaction[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const data = parseDateCell(row[colData]);
    const valor = parseMoneyCell(row[colValor]);
    if (!data || valor === null) continue; // linha de saldo/rodapé/vazia
    const descricao = String(row[colDesc] ?? '').trim() || 'Sem descrição';
    out.push({ data, valor, descricao });
  }

  if (out.length === 0) {
    throw new BadRequestException('Nenhuma transação válida encontrada na planilha');
  }
  return out;
}
