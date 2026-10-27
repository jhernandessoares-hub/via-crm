import { alertasNovos, copiaDasRespostas, mensagemCorrecao, mensagemObrigado } from './questionario-correcao.util';

describe('reenviar para corrigir', () => {
  it('mensagem avisa que é a 2ª resposta, que substitui a anterior e que vem preenchida', () => {
    const m = mensagemCorrecao('MARIA', 'Acompanhamento', 2, 'https://x/portal/questionario/abc');
    expect(m).toContain('2ª resposta');
    expect(m).toContain('substituir');
    expect(m).toContain('já vêm preenchidas');
    expect(m).toContain('https://x/portal/questionario/abc');
  });

  it('agradecimento muda só na correção', () => {
    expect(mensagemObrigado('MARIA', 'Q', 1)).toBe('Obrigado, MARIA! Recebemos suas respostas do questionário "Q".');
    expect(mensagemObrigado('MARIA', 'Q', 2)).toContain('foram atualizadas e substituem as anteriores');
  });

  it('só abre demanda para alerta que não estava marcado antes', () => {
    expect(alertasNovos(['Sigilo', 'Atendimento reservado'], ['Sigilo'])).toEqual(['Atendimento reservado']);
    expect(alertasNovos(['Sigilo'], ['Sigilo'])).toEqual([]);
    expect(alertasNovos(['Sigilo'], [])).toEqual(['Sigilo']);
  });

  it('cópia para o histórico guarda os valores e a data em texto', () => {
    const [c] = copiaDasRespostas([
      { perguntaId: 'p1', instancia: 0, valorTexto: null, valorNumero: null, valorData: new Date('2026-10-01T12:00:00Z'), valorOpcoes: ['A'], extras: { A: 'x' } },
    ]);
    expect(c).toEqual({ perguntaId: 'p1', instancia: 0, valorTexto: null, valorNumero: null, valorData: '2026-10-01T12:00:00.000Z', valorOpcoes: ['A'], extras: { A: 'x' } });
  });
});
