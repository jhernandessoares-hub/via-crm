import { BadRequestException } from '@nestjs/common';
import { ParsedTransaction } from './parser.types';

// Bancos brasileiros exportam OFX 1.x (SGML, sem fechamento nos elementos folha),
// o que quebra parsers XML — por isso o parser é próprio, via regex sobre os
// blocos <STMTTRN>...</STMTTRN> (agregados têm fechamento no SGML do OFX).

function decodeBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  // Header OFX 1.x costuma declarar CHARSET:1252; se o utf8 gerou replacement
  // chars ou o header pede 1252, relê como latin1.
  if (utf8.includes('�') || /CHARSET:\s*1252/i.test(utf8)) {
    return buffer.toString('latin1');
  }
  return utf8;
}

function extractTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  const v = m?.[1]?.trim();
  return v ? v : undefined;
}

/** DTPOSTED: "20260115120000[-3:BRT]" ou "20260115" → "2026-01-15" */
function parseOfxDate(raw: string): string | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

/** TRNAMT: aceita "1234.56", "-1234,56", "1.234,56" */
function parseOfxAmount(raw: string): number | null {
  let s = raw.trim();
  if (s.includes(',') && s.includes('.')) {
    // "1.234,56" — ponto é milhar
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseOfx(buffer: Buffer): ParsedTransaction[] {
  const text = decodeBuffer(buffer);
  if (!/<OFX>/i.test(text)) {
    throw new BadRequestException('Arquivo não parece ser um OFX válido (tag <OFX> ausente)');
  }

  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  const out: ParsedTransaction[] = [];

  for (const block of blocks) {
    const rawDate = extractTag(block, 'DTPOSTED');
    const rawAmount = extractTag(block, 'TRNAMT');
    if (!rawDate || !rawAmount) continue;

    const data = parseOfxDate(rawDate);
    const valor = parseOfxAmount(rawAmount);
    if (!data || valor === null || valor === 0) continue;

    const memo = extractTag(block, 'MEMO');
    const name = extractTag(block, 'NAME');
    out.push({
      data,
      valor,
      descricao: memo || name || 'Sem descrição',
      fitId: extractTag(block, 'FITID'),
    });
  }

  if (out.length === 0) {
    throw new BadRequestException('Nenhuma transação encontrada no OFX (blocos STMTTRN vazios ou ausentes)');
  }
  return out;
}
