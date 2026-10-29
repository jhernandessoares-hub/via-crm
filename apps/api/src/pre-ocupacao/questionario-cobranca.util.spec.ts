import { linkVencido, mensagemCobranca, mensagemRenovacao, podeCobrar } from './questionario-cobranca.util';

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

describe('reenviar com link vencido', () => {
  it('vencido só quando a validade já passou', () => {
    const agora = new Date('2026-10-29T21:30:00Z');
    expect(linkVencido(new Date('2026-10-29T21:27:00Z'), agora)).toBe(true);
    expect(linkVencido(new Date('2026-10-30T21:27:00Z'), agora)).toBe(false);
    expect(linkVencido(null, agora)).toBe(false);
  });

  it('diz até quando vale (horário de São Paulo), traz o link e muda para quem já começou', () => {
    const expira = new Date('2026-10-30T21:31:00Z'); // 30/10 18:31 em SP
    const comecou = mensagemRenovacao('VALDIRENE', 'Q', true, 'https://x/portal/questionario/abc', expira);
    expect(comecou).toContain('venceu, então mandamos um novo');
    expect(comecou).toContain('continuar de onde parou');
    expect(comecou).toContain('vale até 30/10 às 18:31');
    expect(comecou).toContain('https://x/portal/questionario/abc');
    const nao = mensagemRenovacao('VALDIRENE', 'Q', false, 'https://x/l', expira);
    expect(nao).not.toContain('de onde parou');
    expect(nao).toContain('Leva poucos minutos');
  });
});
