import { parsePlanilha } from './planilha.parser';

// CSV real de extrato bancário BR fornecido pelo usuário que reproduziu o bug:
// valores como "1.520,89" chegavam salvos como 1.52 (perda de ordem de grandeza)
// porque a lib xlsx auto-convertia a célula via fuzzynum() antes do nosso parser
// BR-aware rodar. Ver raw:true em planilha.parser.ts.
const EXTRATO_REAL_CSV = [
  ' Extrato Conta Corrente ',
  'Conta ;185460160',
  'Período ;01/07/2026 a 27/07/2026',
  'Saldo ;1.004,31',
  '',
  'Data Lançamento;Histórico;Descrição;Valor;Saldo',
  '23/07/2026;Transferência recebida;Sp9 Incorporacao E Construcao  Spe ;1.520,89;1.004,31',
  '23/07/2026;Pix enviado ;Dlg Servicos De Apoio Administrativos Ltda;-1.520,89;-516,58',
  '01/07/2026;Transferência recebida;Sp9 Incorporacao E Construcao  Spe ;3.886,72;1.004,31',
  '01/07/2026;Pix enviado ;Dlg Servicos De Apoio Administrativos Ltda;-3.886,72;-2.882,41',
  '',
].join('\n');

describe('parsePlanilha', () => {
  it('parseia corretamente valores BR (milhar "." + decimal ",") de um extrato CSV real', () => {
    const out = parsePlanilha(Buffer.from(EXTRATO_REAL_CSV, 'utf8'));

    expect(out).toEqual([
      { data: '2026-07-23', valor: 1520.89, descricao: 'Transferência recebida — Sp9 Incorporacao E Construcao  Spe' },
      { data: '2026-07-23', valor: -1520.89, descricao: 'Pix enviado — Dlg Servicos De Apoio Administrativos Ltda' },
      { data: '2026-07-01', valor: 3886.72, descricao: 'Transferência recebida — Sp9 Incorporacao E Construcao  Spe' },
      { data: '2026-07-01', valor: -3886.72, descricao: 'Pix enviado — Dlg Servicos De Apoio Administrativos Ltda' },
    ]);
  });

  it('combina Histórico + Descrição quando o extrato tem as duas colunas (identifica a contraparte, não só o tipo do movimento)', () => {
    const csv = [
      'Data;Histórico;Descrição;Valor',
      '10/01/2026;Pix enviado;Fulano de Tal;100,00',
    ].join('\n');

    const out = parsePlanilha(Buffer.from(csv, 'utf8'));

    expect(out).toEqual([{ data: '2026-01-10', valor: 100, descricao: 'Pix enviado — Fulano de Tal' }]);
  });

  it('usa só Histórico quando o extrato não tem coluna Descrição', () => {
    const csv = ['Data;Histórico;Valor', '10/01/2026;Pix enviado;100,00'].join('\n');

    const out = parsePlanilha(Buffer.from(csv, 'utf8'));

    expect(out).toEqual([{ data: '2026-01-10', valor: 100, descricao: 'Pix enviado' }]);
  });

  it('parseia "1.900,00" (exemplo original do bug) sem perder os zeros de milhar', () => {
    const csv = ['Data;Descrição;Valor', '10/01/2026;Depósito;1.900,00'].join('\n');

    const out = parsePlanilha(Buffer.from(csv, 'utf8'));

    expect(out).toEqual([{ data: '2026-01-10', valor: 1900, descricao: 'Depósito' }]);
  });

  it('não corrompe acentos de um CSV UTF-8 sem BOM (ex: "Transferência" virando "TransferÃªncia")', () => {
    const csv = ['Data;Descrição;Valor', '10/01/2026;Transferência recebida;100,00'].join('\n');

    const out = parsePlanilha(Buffer.from(csv, 'utf8'));

    expect(out).toEqual([{ data: '2026-01-10', valor: 100, descricao: 'Transferência recebida' }]);
  });
});
