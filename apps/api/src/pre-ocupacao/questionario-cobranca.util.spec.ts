import { mensagemCobranca, podeCobrar } from './questionario-cobranca.util';

describe('cobrar resposta', () => {
  const link = 'https://x/portal/questionario/abc';

  it('texto muda conforme a situação e sempre leva o link', () => {
    expect(mensagemCobranca('MARIA', 'Q', 'RESPONDENDO', link)).toContain('ainda não finalizou o preenchimento');
    expect(mensagemCobranca('MARIA', 'Q', 'RESPONDENDO', link)).toContain('continuar de onde parou');
    expect(mensagemCobranca('MARIA', 'Q', 'ABRIU', link)).toContain('ainda não começou a responder');
    expect(mensagemCobranca('MARIA', 'Q', 'RECEBEU', link)).toContain('Ainda não recebemos suas respostas');
    for (const s of ['RESPONDENDO', 'ABRIU', 'RECEBEU'] as const) expect(mensagemCobranca('MARIA', 'Q', s, link)).toContain(link);
  });

  it('libera na primeira vez e depois de 24h; bloqueia antes, dizendo quanto falta', () => {
    const agora = new Date('2026-10-27T15:00:00Z');
    expect(podeCobrar(null, agora).pode).toBe(true);
    const ha3h = podeCobrar(new Date('2026-10-27T12:00:00Z'), agora);
    expect(ha3h).toEqual({ pode: false, faltamHoras: 21, haHoras: 3 });
    expect(podeCobrar(new Date('2026-10-26T15:00:00Z'), agora).pode).toBe(true);
  });
});
