import { mensagemCobranca, podeCobrar } from './questionario-cobranca.util';

describe('cobrar resposta', () => {
  it('texto muda conforme a situação, não leva link e manda usar o link anterior', () => {
    expect(mensagemCobranca('MARIA', 'Q', 'RESPONDENDO')).toContain('ainda não finalizou o preenchimento');
    expect(mensagemCobranca('MARIA', 'Q', 'RESPONDENDO')).toContain('continuar de onde parou');
    expect(mensagemCobranca('MARIA', 'Q', 'ABRIU')).toContain('ainda não começou a responder');
    expect(mensagemCobranca('MARIA', 'Q', 'RECEBEU')).toContain('Ainda não recebemos suas respostas');
    for (const s of ['RESPONDENDO', 'ABRIU', 'RECEBEU'] as const) {
      const t = mensagemCobranca('MARIA', 'Q', s);
      expect(t).toContain('link da mensagem anterior');
      expect(t).toContain('responda aqui que mandamos outro');
      expect(t).not.toMatch(/https?:\/\//);
    }
  });

  it('libera na primeira vez e depois de 24h; bloqueia antes, dizendo quanto falta', () => {
    const agora = new Date('2026-10-27T15:00:00Z');
    expect(podeCobrar(null, agora).pode).toBe(true);
    const ha3h = podeCobrar(new Date('2026-10-27T12:00:00Z'), agora);
    expect(ha3h).toEqual({ pode: false, faltamHoras: 21, haHoras: 3 });
    expect(podeCobrar(new Date('2026-10-26T15:00:00Z'), agora).pode).toBe(true);
  });
});
