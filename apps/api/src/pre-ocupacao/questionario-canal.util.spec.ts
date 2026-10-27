import { decidirCanalQuestionario, SEM_LIGHT_CONECTADO, telefoneBrValido } from './questionario-canal.util';

describe('canal do envio do questionário', () => {
  const light = { conversaCanal: 'WHATSAPP_LIGHT', conversaSessionId: 'S1' };

  it('lead no Light com sessão: usa o canal do lead', () => {
    expect(decidirCanalQuestionario(light, false, 'S2')).toEqual({ acao: 'USAR_DO_LEAD' });
  });

  it('lead sem canal: sai pelo Light conectado e grava no lead', () => {
    expect(decidirCanalQuestionario({ conversaCanal: null, conversaSessionId: null }, false, 'S2')).toEqual({ acao: 'GRAVAR_LIGHT', sessionId: 'S2' });
  });

  it('Light sem sessão também vai pelo Light conectado', () => {
    expect(decidirCanalQuestionario({ conversaCanal: 'WHATSAPP_LIGHT', conversaSessionId: null }, false, 'S2')).toEqual({ acao: 'GRAVAR_LIGHT', sessionId: 'S2' });
  });

  it('Oficial só vale com número Oficial próprio; sem ele, vai pelo Light', () => {
    const oficial = { conversaCanal: 'WHATSAPP_OFICIAL', conversaSessionId: null };
    expect(decidirCanalQuestionario(oficial, true, 'S2')).toEqual({ acao: 'USAR_DO_LEAD' });
    expect(decidirCanalQuestionario(oficial, false, 'S2')).toEqual({ acao: 'GRAVAR_LIGHT', sessionId: 'S2' });
  });

  it('sem canal útil e sem Light conectado: não envia', () => {
    expect(decidirCanalQuestionario({ conversaCanal: null, conversaSessionId: null }, false, null)).toEqual({ acao: 'ERRO', erro: SEM_LIGHT_CONECTADO });
  });
});

describe('telefone de quem recebe o link', () => {
  it('só aceita 55 + DDD + número', () => {
    expect(telefoneBrValido('5511999998888')).toBe(true);
    expect(telefoneBrValido('551133334444')).toBe(true);
    expect(telefoneBrValido('+55 (11) 99999-8888')).toBe(true);
    // Sem o 55: "11..." viraria código de país 1
    expect(telefoneBrValido('11999998888')).toBe(false);
    expect(telefoneBrValido('999998888')).toBe(false);
    expect(telefoneBrValido(null)).toBe(false);
  });
});
