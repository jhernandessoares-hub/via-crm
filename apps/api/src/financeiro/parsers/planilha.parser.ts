import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ParsedTransaction } from './parser.types';

// CSV/Excel de extrato: exige colunas Data, Valor e ao menos uma coluna de texto
// (Histórico e/ou Descrição — a tela de upload documenta o layout e oferece modelo).
// Cabeçalho localizado por nome normalizado, em qualquer ordem; linhas acima do
// cabeçalho (título do banco etc.) são ignoradas.

// Assinaturas binárias: ZIP (xlsx) e OLE/CFB (xls legado). Qualquer outra coisa é
// tratada como texto (CSV) — precisa de decodificação explícita, ver isBinarySpreadsheet.
function isBinarySpreadsheet(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true; // "PK" — zip/xlsx
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf) return true; // OLE/CFB — xls
  return false;
}

// CSV de extrato BR normalmente é UTF-8, mas alguns bancos exportam em Latin-1/CP1252.
// Passar o Buffer bruto pra XLSX.read (type:'buffer') faz a lib decodificar como binário/
// latin1 por padrão (sem BOM não há como adivinhar) — corrompe acentos ("Período" vira
// "PerÃ­odo"). Decodificar explicitamente aqui e usar type:'string' evita isso.
function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  return utf8.includes('�') ? buffer.toString('latin1') : utf8;
}

function normalizeHeader(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// "Histórico" costuma ser o tipo genérico do movimento ("Pix enviado", "Transferência
// recebida") e "Descrição" costuma trazer quem pagou/recebeu — quando o extrato tem as
// duas, combinar as duas é bem mais útil pra identificar o lançamento do que usar só uma.
function buildDescricao(historico: unknown, descricao: unknown): string {
  const h = String(historico ?? '').trim();
  const d = String(descricao ?? '').trim();
  if (h && d && h.toLowerCase() !== d.toLowerCase()) return `${h} — ${d}`;
  return d || h || 'Sem descrição';
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

// raw:true evita que o parser de CSV da lib auto-converta células numéricas via
// fuzzynum() (que assume vírgula = milhar, formato EN-US) — sem isso, "1.900,00"
// vira 1.9 antes mesmo de chegar em parseMoneyCell(). Mantendo string crua, nossa
// lógica BR-aware abaixo processa o valor corretamente. Não afeta .xls/.xlsx
// binários genuínos, cujas células numéricas já vêm tipadas pelo próprio formato.
function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  try {
    return isBinarySpreadsheet(buffer)
      ? XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true })
      : XLSX.read(decodeCsvBuffer(buffer), { type: 'string', cellDates: true, raw: true });
  } catch {
    throw new BadRequestException('Não foi possível ler a planilha — envie CSV, XLS ou XLSX válido');
  }
}

function readRows(buffer: Buffer): unknown[][] {
  const wb = readWorkbook(buffer);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new BadRequestException('Planilha vazia');
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

/**
 * Número da conta declarado nas linhas antes do cabeçalho (ex: "Conta ;185460160" do
 * Inter) — usado só pra alertar se não bater com a conta selecionada na tela, nunca
 * bloqueia nem decide nada sozinho. `null` quando não acha esse rótulo (nem todo banco
 * declara a conta no extrato, ou usa um rótulo diferente).
 */
export function detectarContaPlanilha(buffer: Buffer): string | null {
  let rows: unknown[][];
  try {
    rows = readRows(buffer);
  } catch {
    return null;
  }
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    for (let c = 0; c < row.length - 1; c++) {
      const label = normalizeHeader(row[c]);
      if (label === 'conta' || label === 'conta corrente' || label === 'numero da conta') {
        const value = String(row[c + 1] ?? '').trim();
        if (value) return value;
      }
    }
  }
  return null;
}

export function parsePlanilha(buffer: Buffer): ParsedTransaction[] {
  const rows = readRows(buffer);

  // Localiza a linha de cabeçalho (Data / Histórico / Descrição / Valor) — Histórico e
  // Descrição são detectados em colunas separadas (ver buildDescricao) porque muitos
  // extratos têm as duas, e cada uma carrega uma informação diferente.
  let headerRow = -1;
  let colData = -1;
  let colHistorico = -1;
  let colDescricao = -1;
  let colValor = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map(normalizeHeader);
    const iData = cells.findIndex((c) => c === 'data' || c.startsWith('data '));
    const iHistorico = cells.findIndex((c) => c === 'historico' || c === 'lancamento');
    const iDescricao = cells.findIndex((c) => c.startsWith('descri'));
    const iValor = cells.findIndex((c) => c === 'valor' || c.startsWith('valor '));
    if (iData >= 0 && (iHistorico >= 0 || iDescricao >= 0) && iValor >= 0) {
      headerRow = i;
      colData = iData;
      colHistorico = iHistorico;
      colDescricao = iDescricao;
      colValor = iValor;
      break;
    }
  }
  if (headerRow < 0) {
    throw new BadRequestException(
      'Cabeçalho não encontrado — a planilha precisa das colunas "Data", "Descrição" (ou "Histórico") e "Valor"',
    );
  }

  const out: ParsedTransaction[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const data = parseDateCell(row[colData]);
    const valor = parseMoneyCell(row[colValor]);
    if (!data || valor === null) continue; // linha de saldo/rodapé/vazia
    const descricao = buildDescricao(colHistorico >= 0 ? row[colHistorico] : '', colDescricao >= 0 ? row[colDescricao] : '');
    out.push({ data, valor, descricao });
  }

  if (out.length === 0) {
    throw new BadRequestException('Nenhuma transação válida encontrada na planilha');
  }
  return out;
}
