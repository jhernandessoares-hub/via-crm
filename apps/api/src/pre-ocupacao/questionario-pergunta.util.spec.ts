import { BadRequestException } from '@nestjs/common';
import {
  PerguntaDef,
  cpfValido,
  normalizarPerguntas,
  preencherTexto,
  respostaParaTexto,
  situacaoEnvio,
  validarValor,
} from './questionario-pergunta.util';
import { PerguntaFluxo, RespostaFluxo, montarPassos, opcoesDinamicas, respostaPreenchida } from './questionario-fluxo';

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

  it('mantém opções ricas, chave e config; INFO nunca é obrigatória', () => {
    const r = normalizarPerguntas([
      { enunciado: 'Benefícios', tipo: 'ESCOLHA_MULTIPLA', chave: 'b', opcoes: [{ label: 'Bolsa', complemento: 'VALOR' }, 'Nenhum'], config: { grupo: 'morador' } },
      { enunciado: 'Boas-vindas', tipo: 'INFO' },
    ]);
    expect(r[0].opcoes).toEqual([{ label: 'Bolsa', complemento: 'VALOR' }, { label: 'Nenhum' }]);
    expect(r[0]).toMatchObject({ chave: 'b', config: { grupo: 'morador' } });
    expect(r[1].obrigatoria).toBe(false);
  });

  it('rejeita escolha com menos de 2 opções, enunciado vazio, escala invertida e chave repetida', () => {
    expect(() => normalizarPerguntas([{ enunciado: 'X', tipo: 'ESCOLHA_MULTIPLA', opcoes: ['A'] }])).toThrow(BadRequestException);
    expect(() => normalizarPerguntas([{ enunciado: '  ', tipo: 'TEXTO_CURTO' }])).toThrow(BadRequestException);
    expect(() => normalizarPerguntas([{ enunciado: 'X', tipo: 'ESCALA', escalaMin: 5, escalaMax: 1 }])).toThrow(BadRequestException);
    expect(() =>
      normalizarPerguntas([
        { enunciado: 'X', tipo: 'TEXTO_CURTO', chave: 'a' },
        { enunciado: 'Y', tipo: 'TEXTO_CURTO', chave: 'a' },
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('validarValor', () => {
  it('em branco retorna null (obrigatoriedade só na conclusão)', () => {
    expect(validarValor(def({}), '', null, 1)).toBeNull();
    expect(validarValor(def({ tipo: 'ESCOLHA_MULTIPLA', opcoes: ['A', 'B'] }), [], null, 1)).toBeNull();
  });

  it('escolha única/múltipla só aceita opções existentes', () => {
    const unica = def({ tipo: 'ESCOLHA_UNICA', opcoes: ['Sim', 'Não'] });
    expect(validarValor(unica, 'Sim', null, 1)?.valorOpcoes).toEqual(['Sim']);
    expect(() => validarValor(unica, 'Talvez', null, 1)).toThrow(BadRequestException);
    const multi = def({ tipo: 'ESCOLHA_MULTIPLA', opcoes: ['A', 'B', 'C'] });
    expect(validarValor(multi, ['A', 'C', 'A'], null, 1)?.valorOpcoes).toEqual(['A', 'C']);
    expect(() => validarValor(multi, ['A', 'Z'], null, 1)).toThrow(BadRequestException);
  });

  it('opção exclusiva ("Nenhuma") desmarca as outras', () => {
    const p = def({ tipo: 'ESCOLHA_MULTIPLA', opcoes: [{ label: 'Fome' }, { label: 'Remédio' }, { label: 'Nenhuma', exclusiva: true }] });
    expect(validarValor(p, ['Fome', 'Nenhuma'], null, 1)?.valorOpcoes).toEqual(['Nenhuma']);
  });

  it('guarda complemento só das opções marcadas; valor em R$ aceita formato brasileiro', () => {
    const p = def({
      tipo: 'ESCOLHA_MULTIPLA',
      opcoes: [{ label: 'Bolsa Família', complemento: 'VALOR' }, { label: 'Outro', complemento: 'TEXTO' }, { label: 'BPC', complemento: 'VALOR' }],
    });
    const r = validarValor(p, ['Bolsa Família', 'Outro'], { 'Bolsa Família': '1.234,50', Outro: ' Vale ', BPC: '999' }, 1);
    expect(r?.extras).toEqual({ 'Bolsa Família': 1234.5, Outro: 'Vale' });
    // marcou a opção e não informou o valor: não deixa avançar
    expect(() => validarValor(p, ['Bolsa Família'], {}, 1)).toThrow('Informe o valor de "Bolsa Família".');
    const opcional = def({ tipo: 'ESCOLHA_UNICA', opcoes: [{ label: 'Sim', complemento: 'TEXTO', complementoOpcional: true }, 'Não'] });
    expect(validarValor(opcional, 'Sim', {}, 1)?.valorOpcoes).toEqual(['Sim']);
  });

  it('contador respeita min/max; moeda; telefone', () => {
    expect(validarValor(def({ tipo: 'CONTADOR', config: { min: 1, max: 15 } }), 3, null, 1)?.valorNumero).toBe(3);
    expect(() => validarValor(def({ tipo: 'CONTADOR', config: { min: 1, max: 15 } }), 0, null, 1)).toThrow(BadRequestException);
    expect(validarValor(def({ tipo: 'MOEDA' }), '350,00', null, 1)?.valorNumero).toBe(350);
    expect(validarValor(def({ tipo: 'TELEFONE' }), '(11) 99999-0000', null, 1)?.valorTexto).toBe('11999990000');
    expect(() => validarValor(def({ tipo: 'TELEFONE' }), '123', null, 1)).toThrow(BadRequestException);
  });

  it('sub-campos guardam só os preenchidos; escala e data', () => {
    const campos = def({ tipo: 'CAMPOS', config: { campos: [{ chave: 'bloco', label: 'Bloco', tipo: 'TEXTO' }, { chave: 'creche', label: 'Creche', tipo: 'CONTADOR' }] } });
    expect(validarValor(campos, null, { bloco: ' 3 ', creche: '2' }, 1)?.extras).toEqual({ bloco: '3', creche: 2 });
    expect(validarValor(campos, null, { bloco: '' }, 1)).toBeNull();
    expect(() => validarValor(def({ tipo: 'ESCALA', escalaMin: 1, escalaMax: 5 }), 6, null, 1)).toThrow(BadRequestException);
    expect(() => validarValor(def({ tipo: 'DATA' }), '2026-02-30', null, 1)).toThrow(BadRequestException);
  });
});

describe('preencherTexto / unidades', () => {
  it('troca {{pessoa}}, {{ordem}} e {{telefone}} e põe inicial maiúscula', () => {
    expect(preencherTexto('{{pessoa}} recebe benefício?', { pessoa: 'você' })).toBe('Você recebe benefício?');
    expect(preencherTexto('Nome da {{ordem}} pessoa', { instancia: 1 })).toBe('Nome da 2ª pessoa');
    expect(preencherTexto('O número {{telefone}} é seu?', { telefone: '5511999998888' })).toBe('O número (11) 99999-8888 é seu?');
    expect(preencherTexto('Qual a idade de {{pessoa}}?')).toBe('Qual a idade de [pessoa]?');
  });
  it('unidade no singular quando o valor é 1', () => {
    const vazio = { valorTexto: null, valorData: null, valorOpcoes: [] as string[], extras: null };
    expect(respostaParaTexto({ tipo: 'CONTADOR', config: { unidade: 'anos' } }, { ...vazio, valorNumero: 1 })).toBe('1 ano');
    expect(respostaParaTexto({ tipo: 'CONTADOR', config: { unidade: 'anos' } }, { ...vazio, valorNumero: 9 })).toBe('9 anos');
  });
});

describe('CPF', () => {
  it('aceita CPF com dígitos verificadores corretos e recusa os demais', () => {
    expect(cpfValido('111.444.777-35')).toBe(true);
    expect(cpfValido('11144477736')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('123')).toBe(false);
    expect(validarValor(def({ tipo: 'CPF' }), '111.444.777-35', null, 1)?.valorTexto).toBe('11144477735');
    expect(() => validarValor(def({ tipo: 'CPF' }), '111.444.777', null, 1)).toThrow(BadRequestException);
  });
});

describe('montarPassos (fluxo)', () => {
  const P = (id: string, tipo: string, over: Partial<PerguntaFluxo> = {}): PerguntaFluxo => ({
    id,
    chave: id,
    tipo,
    opcoes: null,
    obrigatoria: true,
    config: null,
    ...over,
  });
  const R = (perguntaId: string, over: Partial<RespostaFluxo> = {}): RespostaFluxo => ({
    perguntaId,
    instancia: 0,
    valorNumero: null,
    valorOpcoes: [],
    ...over,
  });

  const perguntas: PerguntaFluxo[] = [
    P('qtd', 'ESCOLHA_UNICA', { opcoes: [{ label: '1 pessoa', numero: 1 }, { label: '3 pessoas', numero: 3 }, { label: '5 ou mais' }] }),
    P('qtdTotal', 'CONTADOR', { config: { mostrarSe: [{ chave: 'qtd', em: ['5 ou mais'] }] } }),
    P('parentesco', 'ESCOLHA_UNICA', { opcoes: ['Filho', 'Outro'], config: { grupo: 'morador', mostrarSe: [{ instanciaMaiorQue: 0 }] } }),
    P('trabalho', 'ESCOLHA_UNICA', { opcoes: ['CLT', 'Não trabalha'], config: { grupo: 'morador' } }),
    P('renda', 'MOEDA', { config: { grupo: 'morador', mostrarSe: [{ chave: 'trabalho', naoEm: ['Não trabalha'] }] } }),
    P('fim', 'TEXTO_LONGO', { obrigatoria: false }),
  ];
  const config = {
    grupos: { morador: { rotulo: 'Morador', rotuloPrimeiro: 'Morador 1 (titular)', contagem: { de: ['qtdTotal', 'qtd'], modo: 'primeiro' } } },
  };

  it('sem resposta de quantidade, o grupo não aparece', () => {
    expect(montarPassos(perguntas, config, []).map((s) => s.perguntaId)).toEqual(['qtd', 'fim']);
  });

  it('repete o grupo por pessoa, pula parentesco do titular e renda de quem não trabalha', () => {
    const passos = montarPassos(perguntas, config, [
      R('qtd', { valorOpcoes: ['3 pessoas'] }),
      R('trabalho', { instancia: 0, valorOpcoes: ['CLT'] }),
      R('trabalho', { instancia: 1, valorOpcoes: ['Não trabalha'] }),
    ]);
    expect(passos.map((s) => `${s.perguntaId}#${s.instancia}`)).toEqual([
      'qtd#0',
      'trabalho#0',
      'renda#0',
      'parentesco#1',
      'trabalho#1',
      'parentesco#2',
      'trabalho#2',
      'fim#0',
    ]);
    expect(passos[1].rotuloGrupo).toBe('Morador 1 (titular)');
    expect(passos[3].rotuloGrupo).toBe('Morador 2 de 3');
  });

  it('"5 ou mais" usa o contador que aparece em seguida', () => {
    const passos = montarPassos(perguntas, config, [R('qtd', { valorOpcoes: ['5 ou mais'] }), R('qtdTotal', { valorNumero: 6 })]);
    expect(passos.filter((s) => s.perguntaId === 'trabalho')).toHaveLength(6);
  });

  it('soma de sub-campos libera bloco condicional', () => {
    const ps = [
      P('escola', 'CAMPOS', { config: { campos: [{ chave: 'a', label: 'A', tipo: 'CONTADOR' }, { chave: 'b', label: 'B', tipo: 'CONTADOR' }] } }),
      P('transf', 'ESCOLHA_UNICA', { opcoes: ['Sim', 'Não'], config: { mostrarSe: [{ chave: 'escola', maiorQue: 0 }] } }),
    ];
    expect(montarPassos(ps, {}, [R('escola', { extras: { a: 0, b: 0 } })]).map((s) => s.perguntaId)).toEqual(['escola']);
    expect(montarPassos(ps, {}, [R('escola', { extras: { a: 1, b: 2 } })]).map((s) => s.perguntaId)).toEqual(['escola', 'transf']);
  });

  it('"quais moradores": opções com nomes e repetição só para os escolhidos, com o nome na pergunta', () => {
    const ps = [
      P('nome', 'TEXTO_CURTO'),
      P('qtd', 'CONTADOR'),
      P('m_nome', 'TEXTO_CURTO', { config: { grupo: 'morador', mostrarSe: [{ instanciaMaiorQue: 0 }] } }),
      P('pcd_quem', 'ESCOLHA_MULTIPLA', { config: { opcoesDinamicas: { grupo: 'morador' } } }),
      P('pcd_tipo', 'ESCOLHA_MULTIPLA', { opcoes: ['Física', 'Visual'], config: { grupo: 'pcd' } }),
    ];
    const cfg = {
      grupos: {
        morador: { rotulo: 'Morador', rotuloPrimeiro: 'Morador 1 (titular)', contagem: { de: ['qtd'], modo: 'primeiro' }, nomeDe: { primeiro: 'nome', demais: 'm_nome' } },
        pcd: { rotulo: 'Pessoa com deficiência', contagem: { de: ['pcd_quem'], modo: 'selecao' } },
      },
    };
    const resp = [
      R('nome', { valorTexto: 'Maria' }),
      R('qtd', { valorNumero: 3 }),
      R('m_nome', { instancia: 1, valorTexto: 'João' }),
      R('m_nome', { instancia: 2, valorTexto: 'Ana' }),
    ];
    expect(opcoesDinamicas(ps[3], ps, cfg, resp).map((o) => o.label)).toEqual(['Maria (você)', 'João', 'Ana']);
    const passos = montarPassos(ps, cfg, [...resp, R('pcd_quem', { valorOpcoes: ['Maria (você)', 'Ana'] })]);
    const pcd = passos.filter((s) => s.perguntaId === 'pcd_tipo');
    expect(pcd.map((s) => [s.rotuloGrupo, s.pessoa])).toEqual([
      ['Pessoa com deficiência 1 de 2 · Maria', 'Maria'],
      ['Pessoa com deficiência 2 de 2 · Ana', 'Ana'],
    ]);
    // No grupo dos moradores, o titular vira "você"
    expect(passos.find((s) => s.perguntaId === 'm_nome' && s.instancia === 1)?.rotuloGrupo).toBe('Morador 2 de 3 · João');
  });

  it('aceite só conta como respondido com todas as frases marcadas', () => {
    const p = P('lgpd', 'ACEITE', { opcoes: ['Concordo', 'Autorizo'] });
    expect(respostaPreenchida(p, R('lgpd', { valorOpcoes: ['Concordo'] }))).toBe(false);
    expect(respostaPreenchida(p, R('lgpd', { valorOpcoes: ['Concordo', 'Autorizo'] }))).toBe(true);
  });
});

describe('situacaoEnvio / respostaParaTexto', () => {
  it('prioriza respondido > falha > agendado/fila > respondendo > abriu > recebeu', () => {
    const base = { statusEnvio: 'ENVIADO', linkAbertoEm: null, respondidoEm: null };
    expect(situacaoEnvio({ ...base, respondidoEm: new Date() })).toBe('RESPONDEU');
    expect(situacaoEnvio({ ...base, statusEnvio: 'FALHA' })).toBe('FALHA');
    expect(situacaoEnvio({ ...base, statusEnvio: 'PENDENTE' })).toBe('AGUARDANDO_ENVIO');
    expect(situacaoEnvio({ ...base, statusEnvio: 'PENDENTE', agendadoPara: new Date(Date.now() + 86_400_000) })).toBe('AGENDADO');
    expect(situacaoEnvio({ ...base, linkAbertoEm: new Date(), iniciadoEm: new Date() })).toBe('RESPONDENDO');
    expect(situacaoEnvio({ ...base, linkAbertoEm: new Date() })).toBe('ABRIU');
    expect(situacaoEnvio(base)).toBe('RECEBEU');
  });

  it('formata data, moeda, complementos e sub-campos', () => {
    const vazio = { valorTexto: null, valorNumero: null, valorData: null, valorOpcoes: [] as string[], extras: null };
    expect(respostaParaTexto({ tipo: 'DATA' }, { ...vazio, valorData: new Date('2026-03-05T12:00:00Z') })).toBe('05/03/2026');
    expect(respostaParaTexto({ tipo: 'MOEDA' }, { ...vazio, valorNumero: 1234.5 })).toBe('R$ 1.234,50');
    expect(
      respostaParaTexto({ tipo: 'ESCOLHA_MULTIPLA' }, { ...vazio, valorOpcoes: ['Bolsa', 'Gás'], extras: { Bolsa: 600 } }),
    ).toBe('Bolsa (R$ 600,00), Gás');
    expect(
      respostaParaTexto(
        { tipo: 'CAMPOS', config: { campos: [{ chave: 'b', label: 'Bloco', tipo: 'TEXTO' }, { chave: 'a', label: 'Apto', tipo: 'TEXTO' }] } },
        { ...vazio, extras: { b: '3', a: '12' } },
      ),
    ).toBe('Bloco: 3 · Apto: 12');
  });
});
