import { BadRequestException } from '@nestjs/common';
import {
  PerguntaDef,
  normalizarPerguntas,
  respostaParaTexto,
  situacaoEnvio,
  validarResposta,
} from './questionario-pergunta.util';

const def = (over: Partial<PerguntaDef>): PerguntaDef => ({
  id: 'p1',
  enunciado: 'Pergunta',
  tipo: 'TEXTO_CURTO',
  opcoes: null,
  escalaMin: null,
  escalaMax: null,
  obrigatoria: true,
  ...over,
});

describe('normalizarPerguntas', () => {
  it('numera, limpa opções duplicadas/vazias e aplica escala padrão', () => {
    const r = normalizarPerguntas([
      { enunciado: ' Renda? ', tipo: 'ESCOLHA_UNICA', opcoes: ['A', 'A', ' ', 'B'] },
      { enunciado: 'Nota', tipo: 'ESCALA' },
    ]);
    expect(r[0]).toMatchObject({ ordem: 1, enunciado: 'Renda?', opcoes: ['A', 'B'], obrigatoria: true });
    expect(r[1]).toMatchObject({ ordem: 2, escalaMin: 1, escalaMax: 5 });
  });

  it('rejeita escolha com menos de 2 opções, enunciado vazio e escala invertida', () => {
    expect(() => normalizarPerguntas([{ enunciado: 'X', tipo: 'ESCOLHA_MULTIPLA', opcoes: ['A'] }])).toThrow(BadRequestException);
    expect(() => normalizarPerguntas([{ enunciado: '  ', tipo: 'TEXTO_CURTO' }])).toThrow(BadRequestException);
    expect(() => normalizarPerguntas([{ enunciado: 'X', tipo: 'ESCALA', escalaMin: 5, escalaMax: 1 }])).toThrow(BadRequestException);
  });
});

describe('validarResposta', () => {
  it('obrigatória em branco lança; opcional em branco retorna null', () => {
    expect(() => validarResposta(def({}), '', 1)).toThrow(BadRequestException);
    expect(validarResposta(def({ obrigatoria: false }), undefined, 1)).toBeNull();
  });

  it('escolha única/múltipla só aceita opções existentes', () => {
    const unica = def({ tipo: 'ESCOLHA_UNICA', opcoes: ['Sim', 'Não'] });
    expect(validarResposta(unica, 'Sim', 1)?.valorOpcoes).toEqual(['Sim']);
    expect(() => validarResposta(unica, 'Talvez', 1)).toThrow(BadRequestException);

    const multi = def({ tipo: 'ESCOLHA_MULTIPLA', opcoes: ['A', 'B', 'C'] });
    expect(validarResposta(multi, ['A', 'C', 'A'], 1)?.valorOpcoes).toEqual(['A', 'C']);
    expect(() => validarResposta(multi, ['A', 'Z'], 1)).toThrow(BadRequestException);
  });

  it('escala respeita limites e número aceita vírgula', () => {
    const escala = def({ tipo: 'ESCALA', escalaMin: 1, escalaMax: 5 });
    expect(validarResposta(escala, 4, 1)?.valorNumero).toBe(4);
    expect(() => validarResposta(escala, 6, 1)).toThrow(BadRequestException);
    expect(validarResposta(def({ tipo: 'NUMERO' }), '1,5', 1)?.valorNumero).toBe(1.5);
    expect(() => validarResposta(def({ tipo: 'NUMERO' }), 'abc', 1)).toThrow(BadRequestException);
  });

  it('data exige YYYY-MM-DD válida', () => {
    expect(validarResposta(def({ tipo: 'DATA' }), '2026-02-28', 1)?.valorData?.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(() => validarResposta(def({ tipo: 'DATA' }), '2026-02-30', 1)).toThrow(BadRequestException);
    expect(() => validarResposta(def({ tipo: 'DATA' }), '28/02/2026', 1)).toThrow(BadRequestException);
  });

  it('texto curto tem limite de 500 caracteres', () => {
    expect(() => validarResposta(def({}), 'x'.repeat(501), 1)).toThrow(BadRequestException);
  });
});

describe('situacaoEnvio / respostaParaTexto', () => {
  it('prioriza respondido > falha > fila > abriu > recebeu', () => {
    const base = { statusEnvio: 'ENVIADO', linkAbertoEm: null, respondidoEm: null };
    expect(situacaoEnvio({ ...base, respondidoEm: new Date() })).toBe('RESPONDEU');
    expect(situacaoEnvio({ ...base, statusEnvio: 'FALHA' })).toBe('FALHA');
    expect(situacaoEnvio({ ...base, statusEnvio: 'PENDENTE' })).toBe('AGUARDANDO_ENVIO');
    const amanha = new Date(Date.now() + 86_400_000);
    expect(situacaoEnvio({ ...base, statusEnvio: 'PENDENTE', agendadoPara: amanha })).toBe('AGENDADO');
    // horário do agendamento já passou: está na fila, saindo
    expect(situacaoEnvio({ ...base, statusEnvio: 'PENDENTE', agendadoPara: new Date(Date.now() - 1000) })).toBe('AGUARDANDO_ENVIO');
    expect(situacaoEnvio({ ...base, linkAbertoEm: new Date() })).toBe('ABRIU');
    expect(situacaoEnvio(base)).toBe('RECEBEU');
  });

  it('formata data e número no padrão brasileiro', () => {
    const vazio = { valorTexto: null, valorNumero: null, valorData: null, valorOpcoes: [] as string[] };
    expect(respostaParaTexto('DATA', { ...vazio, valorData: new Date('2026-03-05T12:00:00Z') })).toBe('05/03/2026');
    expect(respostaParaTexto('NUMERO', { ...vazio, valorNumero: 2.5 })).toBe('2,5');
  });
});
