import { chaveAcessoQuestionarioValida, gerarChaveAcessoQuestionario } from './pre-ocupacao-convite-token.util';

describe('chave de acesso do questionário', () => {
  const antes = process.env.WEBHOOK_HMAC_SECRET;
  beforeAll(() => {
    process.env.WEBHOOK_HMAC_SECRET = 'segredo-de-teste';
  });
  afterAll(() => {
    process.env.WEBHOOK_HMAC_SECRET = antes;
  });

  const amanha = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

  it('aceita a chave do mesmo envio e token', () => {
    const c = gerarChaveAcessoQuestionario('envio-1', 'hash-1', amanha());
    expect(chaveAcessoQuestionarioValida(c, 'envio-1', 'hash-1')).toBe(true);
  });

  it('recusa chave de outro envio ou de token antigo (link reenviado/cancelado)', () => {
    const c = gerarChaveAcessoQuestionario('envio-1', 'hash-1', amanha());
    expect(chaveAcessoQuestionarioValida(c, 'envio-2', 'hash-1')).toBe(false);
    expect(chaveAcessoQuestionarioValida(c, 'envio-1', 'hash-2')).toBe(false);
  });

  it('recusa chave vencida', () => {
    const c = gerarChaveAcessoQuestionario('envio-1', 'hash-1', new Date(Date.now() - 1000));
    expect(chaveAcessoQuestionarioValida(c, 'envio-1', 'hash-1')).toBe(false);
  });

  it('recusa validade adulterada e lixo', () => {
    const c = gerarChaveAcessoQuestionario('envio-1', 'hash-1', amanha());
    const [, assinatura] = c.split('.');
    const adulterada = `${Date.now() + 99 * 24 * 60 * 60 * 1000}.${assinatura}`;
    expect(chaveAcessoQuestionarioValida(adulterada, 'envio-1', 'hash-1')).toBe(false);
    for (const x of [undefined, '', 'abc', '1.2', `${Date.now() + 9e6}.${'z'.repeat(64)}`]) {
      expect(chaveAcessoQuestionarioValida(x, 'envio-1', 'hash-1')).toBe(false);
    }
  });
});
