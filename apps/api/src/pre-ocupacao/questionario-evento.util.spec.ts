import { montarHistorico } from './questionario-evento.util';

describe('histórico do envio', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 9, 22, 13, min));
  const base = {
    criadoEm: t(0),
    enviadoPor: 'Ana',
    agendadoPara: null,
    enviadoEm: t(1),
    enviosCount: 1,
    linkAbertoEm: t(10),
    iniciadoEm: t(12),
    respondidoEm: null,
  };

  it('envio antigo (sem eventos): monta as etapas pelos campos do envio, em ordem', () => {
    const h = montarHistorico(base, []);
    expect(h.map((e) => e.tipo)).toEqual(['SELECIONADO', 'ENVIADO', 'ABRIU', 'COMECOU']);
    expect(h[0].por).toBe('Ana');
  });

  it('com eventos gravados não repete a etapa e mantém todas as ocorrências', () => {
    const eventos = [
      { tipo: 'ENVIADO', em: t(1), detalhe: '1º envio', por: null },
      { tipo: 'ABRIU', em: t(10), detalhe: null, por: null },
      { tipo: 'ABRIU', em: t(50), detalhe: 'Abriu de novo', por: null },
      { tipo: 'ENVIADO', em: t(40), detalhe: '2º envio', por: 'Ana' },
    ];
    const h = montarHistorico({ ...base, iniciadoEm: null }, eventos);
    expect(h.map((e) => `${e.tipo}@${e.em.getUTCMinutes()}`)).toEqual([
      'SELECIONADO@0',
      'ENVIADO@1',
      'ABRIU@10',
      'ENVIADO@40',
      'ABRIU@50',
    ]);
    expect(h[3].titulo).toBe('Mensagem enviada pelo WhatsApp');
  });

  it('agendado mostra para quando', () => {
    const h = montarHistorico({ ...base, agendadoPara: t(30), enviadoEm: null, linkAbertoEm: null, iniciadoEm: null }, []);
    expect(h).toHaveLength(1);
    expect(h[0].tipo).toBe('AGENDADO');
    expect(h[0].detalhe).toMatch(/^Para 22\/10\/2026/);
  });
});
