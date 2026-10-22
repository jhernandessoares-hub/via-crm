/**
 * Cadastra o "Questionário V3 — Acompanhamento Psicossocial" (Word da equipe
 * TTS) como questionário da Pré-Ocupação, em RASCUNHO.
 *
 * Idempotente: se já existir um questionário com o mesmo título em RASCUNHO no
 * tenant, substitui as perguntas; se já foi publicado, não mexe (cria nada).
 *
 *   npx ts-node scripts/seed-questionario-v3-sp9.ts <tenantId>
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PerguntaInput, normalizarPerguntas } from '../src/pre-ocupacao/questionario-pergunta.util';
import { Condicao, OpcaoConfig, PerguntaConfig, QuestionarioConfig } from '../src/pre-ocupacao/questionario-fluxo';

const TITULO = 'Acompanhamento Psicossocial · Condomínio José Bonifácio';
const TOTAL_BLOCOS = 11;

type Op = string | OpcaoConfig;
const qual = (label: string, rotulo = 'Qual?'): OpcaoConfig => ({ label, complemento: 'TEXTO', rotuloComplemento: rotulo });
const valor = (label: string): OpcaoConfig => ({ label, complemento: 'VALOR', rotuloComplemento: 'Quanto recebe por mês (R$)' });
const nenhuma = (label: string): OpcaoConfig => ({ label, exclusiva: true });
const se = (chave: string, ...em: string[]): Condicao => ({ chave, em });
const HOJE = { tempo: 'HOJE' as const };
const FUTURO = { tempo: 'FUTURO' as const };

let secaoAtual = '';
const perguntas: PerguntaInput[] = [];
function add(chave: string, tipo: PerguntaInput['tipo'], enunciado: string, extra: Partial<PerguntaInput> & { cfg?: PerguntaConfig; opcoes?: Op[] } = {}) {
  const { cfg, ...resto } = extra;
  perguntas.push({
    chave,
    tipo,
    enunciado,
    obrigatoria: true,
    ...resto,
    opcoes: resto.opcoes as any,
    config: { secao: secaoAtual, ...(cfg ?? {}) },
  });
}
const secao = (s: string) => (secaoAtual = s);

/** Tela de transição: "Agora começa o Bloco 3 de 11". */
function bloco(n: number, titulo: string, descricao: string) {
  secao(`Bloco ${n} · ${titulo}`);
  add(`bloco_${n}`, 'INFO', `Agora começa o Bloco ${n} de ${TOTAL_BLOCOS}: ${titulo}`, { cfg: { ajuda: descricao } });
}

const SEXO: Op[] = ['Feminino', 'Masculino', 'Não binário', 'Prefiro não informar', qual('Outro')];
const ESTADO_CIVIL: Op[] = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a) / Separado(a)', 'Viúvo(a)', qual('Outro')];
const PARENTESCO: Op[] = ['Cônjuge / Companheiro(a)', 'Filho(a)', 'Enteado(a)', 'Pai / Mãe', 'Neto(a)', 'Irmão / Irmã', qual('Outro')];
const ETAPA = ['Creche', 'Pré-Escola', 'Ensino Fundamental I', 'Ensino Fundamental II', 'Ensino Médio'];
const SERVICOS_SAUDE = [
  'UBS / Posto de Saúde (consultas de rotina, vacinas, pré-natal, acompanhamentos)',
  'AMA / UPA / Pronto-Socorro (urgência, febre alta ou emergências)',
  'CAPS (saúde mental, psicólogo, psiquiatra, dependência química)',
  'CER (Centro Especializado em Reabilitação / Fisioterapia)',
];
const TRANSPORTES = [
  'Ônibus Municipal',
  'Trem (CPTM) / Metrô',
  'Lotação / Van / Transporte Complementar',
  'Transporte por Aplicativo (Uber/99) ou Táxi',
  'Veículo Próprio (Carro / Moto)',
  'A pé ou Bicicleta',
];
const MORADORES = { opcoesDinamicas: { grupo: 'morador' } };

// ─── Abertura ────────────────────────────────────────────────────────────
secao('Boas-vindas');
add('abertura', 'INFO', 'Olá! Seja muito bem-vindo(a)', {
  cfg: {
    ajuda:
      'Este é o formulário de acompanhamento do Trabalho Técnico Social do seu novo condomínio.\n\n' +
      'Ele foi preparado pela equipe do Trabalho Técnico Social e tem como único objetivo conhecer a realidade, as necessidades e as expectativas da sua família. ' +
      'Com essas informações, vamos planejar ações de apoio, oficinas e ajudar na integração de vocês com os serviços públicos da região (como postos de saúde, escolas e transporte).\n\n' +
      'Sua privacidade é nossa prioridade (LGPD):\n' +
      '• Confidencialidade: todas as suas respostas são estritamente confidenciais e protegidas por sigilo profissional. Elas não serão compartilhadas com outros moradores ou pessoas de fora da equipe.\n' +
      '• Segurança dos dados: suas informações serão usadas exclusivamente para o planejamento social do Condomínio José Bonifácio e para a garantia dos seus direitos sociais.\n\n' +
      'Responder a este questionário é um ato de parceria para construirmos uma comunidade melhor. Você pode optar por conversar sobre assuntos mais delicados diretamente com a nossa equipe, em um atendimento privado.\n\n' +
      'Algumas perguntas são sobre como a família vive HOJE e outras sobre quando forem morar no José Bonifácio. Elas aparecem marcadas na tela.\n\n' +
      'Você pode parar quando quiser e continuar depois pelo mesmo link. Suas respostas ficam salvas.',
  },
});
add('lgpd', 'ACEITE', 'Antes de começar, precisamos da sua concordância', {
  opcoes: [
    'Declaro que li e compreendi as informações sobre este questionário e aceito participar, respondendo às perguntas.',
    'Autorizo o uso das minhas informações para articulação e encaminhamento junto à rede pública de serviços de educação, transporte, saúde e assistência social do município de São Paulo.',
  ],
  cfg: { ajuda: 'Leia as duas declarações e toque em "Eu concordo" em cada uma.' },
});

secao('Confirmação do cadastro');
add('cpf', 'CPF', 'Digite o CPF do titular do cadastro', {
  cfg: { ajuda: 'Usamos o CPF só para confirmar que este questionário é da sua família.' },
});

// ─── Bloco 1 ─────────────────────────────────────────────────────────────
bloco(1, 'Identificação básica', 'Primeiro, algumas informações sobre você, titular do cadastro.');
add('nome', 'TEXTO_CURTO', 'Nome completo do beneficiário titular', { cfg: { prefill: 'NOME', ajuda: 'Confira se o nome está certo. Se precisar, corrija.' } });
add('sexo', 'ESCOLHA_UNICA', 'Sexo', { opcoes: SEXO });
add('estado_civil', 'ESCOLHA_UNICA', 'Estado civil', { opcoes: ESTADO_CIVIL });
add('telefone_confirma', 'ESCOLHA_UNICA', 'O número {{telefone}} é o seu telefone principal para contato?', {
  opcoes: ['Sim, este é o meu telefone principal', 'Sim, e quero adicionar outro número', 'Não, meu telefone principal é outro'],
});
add('telefone_outro', 'TELEFONE', 'Qual é o outro número? (com DDD)', {
  cfg: { mostrarSe: [se('telefone_confirma', 'Sim, e quero adicionar outro número', 'Não, meu telefone principal é outro')] },
});
add('qtd_pessoas', 'ESCOLHA_UNICA', 'Quantas pessoas vão morar no apartamento, contando com você?', {
  opcoes: [
    { label: '1 pessoa (moro sozinho/a)', numero: 1 },
    { label: '2 pessoas', numero: 2 },
    { label: '3 pessoas', numero: 3 },
    { label: '4 pessoas', numero: 4 },
    { label: '5 ou mais pessoas' },
  ],
  cfg: FUTURO,
});
add('qtd_total', 'CONTADOR', 'Você marcou 5 ou mais pessoas. Quantas pessoas vão morar no total, contando com você?', {
  cfg: { ...FUTURO, min: 5, max: 15, unidade: 'pessoas', mostrarSe: [se('qtd_pessoas', '5 ou mais pessoas')] },
});

// ─── Bloco 2: cada morador ───────────────────────────────────────────────
bloco(2, 'Trabalho, renda e escolaridade', 'Agora vamos falar de cada pessoa que vai morar com você, uma de cada vez, começando por você.');
const M = (c: PerguntaConfig = {}): PerguntaConfig => ({ grupo: 'morador', ...c });
const naoTitular: Condicao = { instanciaMaiorQue: 0 };
// Perguntas que não fazem sentido para crianças: dependem da idade informada da pessoa
const aPartirDe = (anos: number): Condicao => ({ chave: 'm_idade', maiorQue: anos - 1 });
add('m_nome', 'TEXTO_CURTO', 'Qual é o nome completo da {{ordem}} pessoa que vai morar com você?', {
  cfg: M({ ajuda: 'Pode ser cônjuge, filho(a), parente ou outra pessoa que vai morar no apartamento.', mostrarSe: [naoTitular] }),
});
add('m_parentesco', 'ESCOLHA_UNICA', 'Parentesco com o titular', { opcoes: PARENTESCO, cfg: M({ mostrarSe: [naoTitular] }) });
add('m_idade', 'CONTADOR', 'Idade', { cfg: M({ min: 0, max: 120, unidade: 'anos' }) });
// Sexo e estado civil do titular já foram perguntados no Bloco 1
add('m_sexo', 'ESCOLHA_UNICA', 'Sexo', { opcoes: SEXO, cfg: M({ mostrarSe: [naoTitular] }) });
add('m_estado_civil', 'ESCOLHA_UNICA', 'Estado civil', { opcoes: ESTADO_CIVIL, cfg: M({ mostrarSe: [naoTitular, aPartirDe(16)] }) });
add('m_escolaridade', 'ESCOLHA_UNICA', 'Escolaridade', {
  opcoes: [
    'Ensino Fundamental I (1º ao 5º ano)',
    'Ensino Fundamental II (6º ao 9º ano)',
    'Ensino Médio (1º ao 3º ano)',
    qual('Ensino Técnico', 'Qual curso?'),
    'Ensino Superior',
    'EJA (Educação de Jovens e Adultos)',
    'Não alfabetizado(a)',
    'Ainda não estuda (criança pequena)',
  ],
  cfg: M({ mostrarSe: [aPartirDe(4)] }),
});
add('m_vinculo', 'ESCOLHA_UNICA', 'Qual é a situação de trabalho HOJE?', {
  opcoes: [
    'Carteira assinada (CLT)',
    'Autônomo (trabalha por conta própria)',
    'Bico / Trabalho informal / Temporário',
    'Aposentado ou Pensionista do INSS',
    'Não trabalha / Desempregado',
  ],
  cfg: M({ mostrarSe: [aPartirDe(14)] }),
});
add('m_profissao', 'TEXTO_CURTO', 'Profissão / Ocupação atual', {
  obrigatoria: false,
  cfg: M({ mostrarSe: [aPartirDe(14), { chave: 'm_vinculo', naoEm: ['Não trabalha / Desempregado'] }] }),
});
add('m_renda', 'MOEDA', 'Quanto {{pessoa}} ganha HOJE, por mês, com trabalho ou aposentadoria?', {
  cfg: M({
    ajuda: 'Se não souber o valor exato, coloque um valor aproximado.',
    mostrarSe: [aPartirDe(14), { chave: 'm_vinculo', naoEm: ['Não trabalha / Desempregado'] }],
  }),
});
add('beneficios', 'ESCOLHA_MULTIPLA', 'Alguém da família recebe HOJE algum benefício social do governo?', {
  opcoes: [
    valor('Bolsa Família'),
    valor('BPC (Idoso ou PcD)'),
    valor('Auxílio-Gás'),
    valor('Seguro-Desemprego'),
    qual('Outro benefício', 'Qual benefício e qual valor?'),
    nenhuma('Ninguém da família recebe benefício'),
  ],
  cfg: { ajuda: 'Pense na família toda. Toque em cada benefício que a família recebe e informe o valor por mês.' },
});

// ─── Bloco 3: PCD ────────────────────────────────────────────────────────
bloco(3, 'Acessibilidade e pessoa com deficiência (PCD)', 'Perguntas sobre moradores com deficiência ou com dificuldade de locomoção.');
add('pcd', 'ESCOLHA_UNICA', 'Algum morador da casa possui alguma deficiência (PCD) ou dificuldade de locomoção?', { opcoes: ['Não', 'Sim'] });
add('pcd_quem', 'ESCOLHA_MULTIPLA', 'Quais moradores têm deficiência ou dificuldade de locomoção?', {
  cfg: { ...MORADORES, ajuda: 'Toque no nome de cada um. Depois vamos perguntar sobre cada pessoa.', mostrarSe: [se('pcd', 'Sim')] },
});
const D = (c: PerguntaConfig = {}): PerguntaConfig => ({ grupo: 'pcd', ...c });
add('pcd_categoria', 'ESCOLHA_MULTIPLA', 'Qual o tipo de deficiência de {{pessoa}}?', {
  opcoes: [
    'Física / Motora (ex: cadeirante, amputado, paralisia, mobilidade reduzida)',
    'Visual (ex: cegueira, baixa visão)',
    'Auditiva (ex: surdez total, perda parcial)',
    'Intelectual / Mental (ex: Síndrome de Down, Deficiência Intelectual)',
    'Transtorno do Espectro Autista (TEA) ou Deficiência Psicossocial',
    'Múltipla (duas ou mais deficiências)',
    qual('Outra'),
  ],
  cfg: D({ ajuda: 'Toque em todas que se aplicam.' }),
});
add('pcd_laudo', 'ESCOLHA_UNICA', '{{pessoa}} tem laudo médico recente?', { opcoes: ['Não', qual('Sim', 'Qual laudo médico?')], cfg: D() });
add('pcd_autonomia', 'ESCOLHA_UNICA', 'Nas atividades básicas (banho, alimentação, banheiro, andar dentro de casa), como está {{pessoa}}?', {
  opcoes: [
    'Totalmente independente: faz tudo sem ajuda.',
    'Dependência parcial: precisa de apoio ou supervisão para algumas tarefas.',
    'Totalmente dependente: precisa de um cuidador o tempo todo.',
  ],
  cfg: D(),
});
add('pcd_desloca', 'ESCOLHA_UNICA', '{{pessoa}} consegue se deslocar sozinho(a) pelo bairro ou cidade para usar serviços públicos?', {
  opcoes: ['Sim', 'Não, precisa de acompanhante', 'Não consegue se deslocar'],
  cfg: D(),
});
add('pcd_assistiva', 'ESCOLHA_UNICA', '{{pessoa}} usa regularmente algum equipamento ou tecnologia assistiva?', {
  opcoes: ['Não', 'Sim'],
  cfg: D({ ajuda: 'Por exemplo: cadeira de rodas, muleta, bengala, andador, prótese, órtese ou aparelho auditivo.' }),
});
add('pcd_assistiva_itens', 'ESCOLHA_MULTIPLA', 'Quais equipamentos {{pessoa}} usa?', {
  opcoes: [
    'Cadeira de rodas manual ou motorizada',
    'Muletas, bengala ou andador',
    'Prótese ou órtese',
    'Aparelho auditivo',
    'Recursos de comunicação alternativa',
    qual('Outros'),
  ],
  cfg: D({ mostrarSe: [se('pcd_assistiva', 'Sim')] }),
});
add('pcd_adaptacoes', 'ESCOLHA_MULTIPLA', 'Quais adaptações o apartamento novo precisa ter para {{pessoa}}?', {
  opcoes: [
    'Portas mais largas para cadeira de rodas',
    'Banheiro acessível (barras de apoio, box plano, assento elevado, torneira de alavanca)',
    'Rampas de acesso ou ausência de degraus',
    'Sinalização visual/luminosa ou em Braille',
    nenhuma('Nenhuma adaptação é necessária'),
  ],
  cfg: D({ ...FUTURO, ajuda: 'Pode marcar mais de uma.' }),
});
add('pcd_tratamento', 'ESCOLHA_UNICA', '{{pessoa}} faz algum tratamento contínuo de saúde ou reabilitação fora de casa?', {
  opcoes: ['Não', qual('Sim', 'Onde faz o tratamento? (ex: CAPS, CER, UBS, APAE)')],
  cfg: D({ ajuda: 'Por exemplo: fisioterapia, fonoaudiologia, terapia ocupacional, hemodiálise, quimioterapia ou acompanhamento no CAPS, CER ou APAE.' }),
});
add('pcd_tratamento_freq', 'CONTADOR', 'Quantas vezes por semana?', {
  cfg: D({ min: 1, max: 7, unidade: 'vezes por semana', mostrarSe: [se('pcd_tratamento', 'Sim')] }),
});

// ─── Bloco 4: Escola ─────────────────────────────────────────────────────
bloco(4, 'Escola', 'Perguntas sobre as crianças e os jovens da casa que estão em idade escolar.');
add('escola_tem', 'ESCOLHA_UNICA', 'Algum morador está em idade escolar (da creche até o ensino médio)?', { opcoes: ['Não', 'Sim'] });
const temEstudante: Condicao = se('escola_tem', 'Sim');
add('est_quem', 'ESCOLHA_MULTIPLA', 'Quais moradores estão em idade escolar?', {
  cfg: { ...MORADORES, ajuda: 'Toque no nome de cada criança ou jovem. Depois vamos perguntar sobre cada um.', mostrarSe: [temEstudante] },
});
add('escola_frequentam', 'CONTADOR', 'Quantos deles estudam HOJE em escola ou creche perto de onde moram agora?', {
  cfg: { min: 0, max: 15, unidade: 'estudantes', mostrarSe: [temEstudante] },
});
const E = (c: PerguntaConfig = {}): PerguntaConfig => ({ grupo: 'estudante', ...c });
const NAO_MATRICULADO = 'Ainda não está matriculado(a)';
add('est_etapa', 'ESCOLHA_UNICA', 'Em qual etapa {{pessoa}} está?', { opcoes: [...ETAPA, NAO_MATRICULADO], cfg: E() });
const matriculado: Condicao = { chave: 'est_etapa', naoEm: [NAO_MATRICULADO] };
add('est_escola', 'TEXTO_CURTO', 'Nome da escola ou creche onde {{pessoa}} estuda HOJE', { obrigatoria: false, cfg: E({ mostrarSe: [matriculado] }) });
add('est_bairro', 'TEXTO_CURTO', 'Bairro / região dessa escola', { obrigatoria: false, cfg: E({ mostrarSe: [matriculado] }) });
add('est_vaga', 'ESCOLHA_UNICA', '{{pessoa}} vai precisar de vaga ou transferência para uma escola perto do Condomínio José Bonifácio?', {
  opcoes: ['Sim', qual('Não', 'Por qual motivo?')],
  cfg: E(FUTURO),
});
add('escola_dificuldade', 'ESCOLHA_UNICA', 'HOJE a família tem dificuldade para acessar o serviço escolar?', {
  opcoes: ['Não', qual('Sim')],
  cfg: { mostrarSe: [temEstudante] },
});
add('escola_transporte', 'ESCOLHA_MULTIPLA', 'Como os estudantes vão para a escola HOJE?', {
  opcoes: ['A pé', 'Ônibus / Trem / Metrô', 'TEG (Transporte Escolar Gratuito)', 'Transporte particular / Perua', 'Carro / Moto'],
  cfg: { mostrarSe: [temEstudante] },
});
add('escola_tempo', 'CONTADOR', 'HOJE, quanto tempo leva, em média, para chegar na escola (só a ida)?', {
  cfg: { min: 0, max: 300, unidade: 'minutos', mostrarSe: [temEstudante] },
});

// ─── Bloco 5: Saúde ──────────────────────────────────────────────────────
bloco(5, 'Saúde (SUS)', 'Perguntas sobre o uso dos serviços de saúde e a saúde de cada morador.');
add('saude_usa', 'ESCOLHA_UNICA', 'HOJE a sua família costuma usar os serviços públicos de saúde?', {
  opcoes: ['Sim', qual('Não, a família não utiliza a rede pública', 'Por qual motivo? (ex: tem convênio)')],
  cfg: HOJE,
});
add('saude_servicos', 'ESCOLHA_MULTIPLA', 'Quais serviços de saúde vocês mais usam HOJE?', {
  opcoes: SERVICOS_SAUDE,
  cfg: { ...HOJE, mostrarSe: [se('saude_usa', 'Sim')] },
});
add('saude_cronica', 'ESCOLHA_UNICA', 'Alguém da casa tem doença crônica, transtorno mental ou outra condição de saúde que exija tratamento permanente?', {
  opcoes: ['Não', 'Sim'],
  cfg: { ajuda: 'Por exemplo: diabetes, pressão alta, asma, câncer, depressão. Deficiência e dificuldade de locomoção já foram perguntadas no Bloco 3.' },
});
add('saude_cronica_quem', 'ESCOLHA_MULTIPLA', 'Quais moradores têm alguma dessas condições?', {
  cfg: { ...MORADORES, ajuda: 'Toque no nome de cada um, inclusive crianças. Depois vamos perguntar sobre cada pessoa.', mostrarSe: [se('saude_cronica', 'Sim')] },
});
add('saude_cronica_quais', 'ESCOLHA_MULTIPLA', 'Quais condições de saúde {{pessoa}} tem?', {
  opcoes: [
    'Diabetes',
    'Hipertensão (pressão alta) ou problemas cardíacos',
    'Doença respiratória crônica (asma, bronquite, DPOC)',
    'Câncer ou tratamento oncológico atual',
    'Transtorno mental grave ou persistente (ansiedade severa, depressão, esquizofrenia)',
    qual('Outra condição de saúde de longo prazo'),
  ],
  cfg: { grupo: 'cronico', ajuda: 'Toque em todas que se aplicam.' },
});
add('saude_medicamentos', 'ESCOLHA_UNICA', 'Alguém da família usa todo dia remédio de uso contínuo fornecido pelo SUS?', {
  opcoes: ['Não', 'Sim'],
});
add('saude_medicamentos_quais', 'ESCOLHA_MULTIPLA', 'Quais remédios de uso contínuo são usados?', {
  opcoes: [
    'Losartana ou Enalapril / Captopril (pressão alta)',
    'Hidroclorotiazida ou Furosemida (pressão alta / inchaço)',
    'Anlodipino (pressão alta)',
    'Metformina ou Glibenclamida (diabetes)',
    'Insulina (diabetes)',
    'Sinvastatina (colesterol)',
    'AAS (coração / circulação)',
    'Levotiroxina (tireoide)',
    'Omeprazol (estômago)',
    'Fluoxetina, Sertralina ou Amitriptilina (depressão / ansiedade)',
    'Bombinha (asma / bronquite)',
    qual('Outro remédio', 'Qual remédio e para que serve?'),
  ],
  cfg: {
    ajuda: 'Toque em todos que alguém da família usa. Se o remédio não estiver na lista, toque em "Outro remédio" e escreva.',
    mostrarSe: [se('saude_medicamentos', 'Sim')],
  },
});
add('saude_cuidados', 'ESCOLHA_UNICA', 'Algum morador precisa de procedimentos regulares ou insumos específicos de saúde?', { opcoes: ['Não', 'Sim'] });
add('saude_cuidados_quais', 'ESCOLHA_MULTIPLA', 'Quais recursos são necessários no dia a dia?', {
  opcoes: [
    'Hemodiálise ou diálise peritoneal',
    'Fisioterapia ou reabilitação motora frequente',
    'Oxigênio em casa (oxigenoterapia ou CPAP)',
    'Insumos do SUS (fraldas geriátricas, sondas, bolsas de colostomia etc.)',
  ],
  cfg: { mostrarSe: [se('saude_cuidados', 'Sim')] },
});
add('saude_dificuldade', 'ESCOLHA_UNICA', 'HOJE a família tem dificuldade para acessar o serviço de saúde?', { opcoes: ['Não', qual('Sim')], cfg: HOJE });
add('saude_regiao', 'ESCOLHA_UNICA', 'Morando no José Bonifácio, a família vai usar a rede pública de saúde da região?', { opcoes: ['Sim', 'Não'], cfg: FUTURO });
add('saude_regiao_servicos', 'ESCOLHA_MULTIPLA', 'Quais serviços pretendem usar na região?', {
  opcoes: [...SERVICOS_SAUDE, qual('Outros', 'Quais?')],
  cfg: { ...FUTURO, mostrarSe: [se('saude_regiao', 'Sim')] },
});

// ─── Bloco 6: Mobilidade ─────────────────────────────────────────────────
bloco(6, 'Mobilidade', 'Como a família se desloca no dia a dia: hoje e depois da mudança.');
add('mob_transporte', 'ESCOLHA_MULTIPLA', 'Qual transporte os moradores mais usam HOJE no dia a dia (trabalho, estudo, serviços)?', {
  opcoes: TRANSPORTES,
  cfg: { ...HOJE, ajuda: 'Pode marcar mais de uma.' },
});
add('mob_gasto', 'MOEDA', 'Quanto a família gasta HOJE, por mês, com transporte público ou combustível?', {
  cfg: { ...HOJE, ajuda: 'Pode ser um valor aproximado.' },
});
add('mob_gratuidade', 'ESCOLHA_UNICA', 'Alguém da família tem gratuidade no transporte (Bilhete Único Especial Idoso, PCD, Estudante ou Vale-Transporte)?', {
  opcoes: ['Não', 'Sim'],
});
add('mob_gratuidade_quem', 'ESCOLHA_MULTIPLA', 'Quais moradores têm gratuidade no transporte?', {
  cfg: { ...MORADORES, ajuda: 'Toque no nome de cada um.', mostrarSe: [se('mob_gratuidade', 'Sim')] },
});
add('mob_gratuidade_tipo', 'ESCOLHA_MULTIPLA', 'Qual gratuidade {{pessoa}} tem?', {
  opcoes: [
    'Bilhete Único Especial Pessoa Idosa',
    'Bilhete Único Especial Pessoa com Deficiência',
    'Bilhete Único Estudante',
    'Vale-Transporte da empresa',
    qual('Outra'),
  ],
  cfg: { grupo: 'gratuidade' },
});
add('mob_dificuldades', 'ESCOLHA_MULTIPLA', 'HOJE a família tem dificuldade para usar o transporte público ou se deslocar no dia a dia?', {
  opcoes: [
    nenhuma('Não enfrenta dificuldades'),
    'Sim, distância (pontos de ônibus ou estações muito longe de casa)',
    'Sim, dinheiro (o valor das passagens pesa no orçamento)',
    'Sim, demora (os ônibus demoram ou passam em horários ruins)',
    'Sim, falta de acessibilidade (calçadas ruins, falta de rampas, ônibus não adaptados)',
    'Sim, segurança no trajeto (falta de iluminação ou caminhos desertos)',
    qual('Outra dificuldade'),
  ],
  cfg: HOJE,
});
add('mob_transporte_futuro', 'ESCOLHA_MULTIPLA', 'Morando no Condomínio José Bonifácio, qual transporte a família vai usar?', {
  opcoes: TRANSPORTES,
  cfg: { ...FUTURO, ajuda: 'Pode marcar mais de uma.' },
});

// ─── Bloco 7: Rede de proteção ───────────────────────────────────────────
bloco(7, 'Rede de proteção e suporte social', 'Perguntas sobre os serviços de assistência social e sobre a segurança da família.');
add('rede_servicos', 'ESCOLHA_MULTIPLA', 'Na região onde moram HOJE, vocês usam ou são atendidos por algum destes serviços?', {
  opcoes: [
    'CRAS (Cadastro Único, Bolsa Família, cesta básica ou atividades comunitárias)',
    'CREAS ou serviços de orientação familiar especializados',
    nenhuma('Não usamos esses serviços no momento'),
  ],
  cfg: HOJE,
});
add('rede_sigilo', 'ESCOLHA_UNICA', 'Existe alguma situação delicada na rotina ou na segurança da família que precise de um cuidado especial ou que você precise relatar em sigilo?', {
  opcoes: [
    'Não, nossa rotina está tranquila e segura no momento.',
    { label: 'Sim, preciso que o meu novo endereço seja mantido em sigilo por motivos de segurança pessoal.', alerta: 'Pediu sigilo do endereço' },
    { label: 'Prefiro conversar sobre nossa situação em um atendimento individual e reservado com a equipe.', alerta: 'Pediu atendimento reservado' },
  ],
  cfg: { ajuda: 'Se marcar sigilo ou atendimento reservado, alguém da equipe vai procurar você com cuidado e discrição.' },
});
add('rede_dificuldades', 'ESCOLHA_MULTIPLA', 'Nos últimos meses, a família passou por alguma destas dificuldades?', {
  opcoes: [
    'Dificuldade para comprar alimentos básicos ou gás de cozinha',
    'Crianças ou adolescentes precisaram ajudar na renda em vez de focar nos estudos',
    'Falta de remédios de uso contínuo por falta de dinheiro',
    nenhuma('Nenhuma dessas'),
  ],
  cfg: HOJE,
});
add('rede_acesso', 'ESCOLHA_UNICA', 'HOJE a família tem alguma dificuldade para conseguir atendimento médico, matricular as crianças na escola ou acessar benefícios do governo?', {
  opcoes: ['Não, conseguimos acessar o que precisamos.', qual('Sim', 'Qual serviço ou dificuldade?')],
  cfg: HOJE,
});

// ─── Bloco 8: Rede de apoio ──────────────────────────────────────────────
bloco(8, 'Rede de apoio', 'Perguntas sobre as pessoas com quem a família pode contar.');
add('apoio', 'ESCOLHA_UNICA', 'Numa urgência, imprevisto ou necessidade do dia a dia (cuidar das crianças, ajuda com dinheiro, doença, apoio emocional), a família tem com quem contar?', {
  opcoes: ['Não, a família não tem rede de apoio no momento.', 'Sim'],
  cfg: HOJE,
});
add('apoio_quem', 'ESCOLHA_MULTIPLA', 'Com quem a família pode contar?', {
  opcoes: [
    'Familiares (que não moram na mesma casa, mas ajudam sempre)',
    'Vizinhos ou amigos próximos',
    'Igreja / comunidade religiosa',
    'Lideranças comunitárias, projetos sociais ou ONGs',
    qual('Outros', 'Quem?'),
  ],
  cfg: { ...HOJE, mostrarSe: [se('apoio', 'Sim')] },
});
add('apoio_local', 'ESCOLHA_UNICA', 'Onde moram as pessoas que ajudam a sua família hoje?', {
  opcoes: [
    'Muito perto de onde moramos hoje (a mudança vai nos afastar deles)',
    'Espalhadas por outros bairros ou cidades (a mudança não muda nada)',
    'Já moram na região de Itaquera / José Bonifácio (a mudança vai nos aproximar)',
  ],
  cfg: { mostrarSe: [se('apoio', 'Sim')] },
});
add('apoio_cuidados', 'ESCOLHA_UNICA', 'Alguma criança, idoso ou pessoa com deficiência da casa depende da ajuda de parentes ou vizinhos que não vão morar no condomínio?', {
  opcoes: ['Não', qual('Sim', 'Como a mudança vai afetar esses cuidados?')],
  cfg: {
    ...FUTURO,
    mostrarSe: [
      {
        qualquer: [
          { chave: 'm_idade', algumaPessoa: { menorQue: 18 } },
          { chave: 'm_idade', algumaPessoa: { maiorQue: 59 } },
          se('pcd', 'Sim'),
        ],
      },
    ],
  },
});

// ─── Bloco 9: Moradia de origem ──────────────────────────────────────────
bloco(9, 'Moradia atual', 'Perguntas sobre onde a família mora HOJE, antes da mudança.');
add('origem_municipio', 'ESCOLHA_UNICA', 'Em qual cidade a família mora HOJE?', { opcoes: ['São Paulo', qual('Outra cidade', 'Qual?')], cfg: HOJE });
add('origem_bairro', 'TEXTO_CURTO', 'Bairro onde mora HOJE', { cfg: HOJE });
add('origem_zona', 'ESCOLHA_UNICA', 'Zona', { opcoes: ['Norte', 'Sul', 'Leste', 'Oeste', 'Centro'], cfg: { ...HOJE, mostrarSe: [se('origem_municipio', 'São Paulo')] } });
add('origem_tempo', 'CONTADOR', 'Há quanto tempo a família mora na moradia atual?', {
  cfg: { ...HOJE, min: 0, max: 100, unidade: 'anos', rotuloZero: 'Menos de 1 ano', ajuda: 'Se mora lá há menos de 1 ano, deixe em 0.' },
});
add('origem_motivos', 'ESCOLHA_MULTIPLA', 'Alguma destas situações descreve a moradia de HOJE?', {
  obrigatoria: false,
  opcoes: [
    'Fica em local com perigo de alagamento/enchente (beira de córrego) ou deslizamento (encosta/morro)',
    'Tem rachaduras graves ou perigo real de desabamento',
    'A família precisa sair por causa de obra pública, desapropriação ou ação de órgão público',
    'O aluguel pesa muito e falta dinheiro para outras necessidades básicas',
    'A família mora em local cedido',
    'Divide a casa com parentes ou conhecidos por não ter como pagar moradia própria',
    'Sem moradia fixa, em situação de rua ou em abrigo/instituição',
  ],
  cfg: { ...HOJE, ajuda: 'Pode marcar mais de uma. Se nenhuma se aplica, toque em Próximo.' },
});

// ─── Bloco 10: Situação habitacional ─────────────────────────────────────
bloco(10, 'Como é a moradia atual', 'Perguntas sobre como é a casa onde a família mora HOJE.');
add('casa_tipo', 'ESCOLHA_UNICA', 'Tipo da moradia de HOJE', {
  opcoes: ['Casa (independente)', 'Apartamento', 'Casa de fundos / Porão', 'Cômodo', 'Ocupação organizada / Prédio ocupado', 'Barraco', qual('Outro')],
  cfg: HOJE,
});
add('casa_paredes', 'ESCOLHA_UNICA', 'As paredes de fora da casa de HOJE são principalmente de:', {
  opcoes: ['Tijolo/bloco com reboco', 'Tijolo/bloco sem reboco', 'Madeira (tábua)', 'Madeira reaproveitada / Madeirite / Zinco'],
  cfg: HOJE,
});
add('casa_teto', 'ESCOLHA_UNICA', 'O teto/cobertura da casa de HOJE é principalmente de:', {
  opcoes: ['Laje de concreto', 'Telha de fibrocimento (amianto) / Zinco', 'Telha de barro (cerâmica)', 'Lona / Madeira / Materiais improvisados'],
  cfg: HOJE,
});
add('casa_comodos', 'CAMPOS', 'Quantos cômodos tem a moradia de HOJE?', {
  cfg: {
    ...HOJE,
    ajuda: 'Não conte corredor. Se não tem banheiro dentro de casa, deixe o banheiro em 0.',
    campos: [
      { chave: 'comodos', label: 'Cômodos no total (sem contar banheiro)', tipo: 'CONTADOR' },
      { chave: 'quartos', label: 'Usados como quarto', tipo: 'CONTADOR' },
      { chave: 'banheiros', label: 'Banheiros (0 = não tem banheiro)', tipo: 'CONTADOR' },
    ],
  },
});
add('casa_agua', 'ESCOLHA_UNICA', 'Água na casa de HOJE', {
  opcoes: ['Rede pública, com relógio/medidor só da casa', 'Rede pública com encanamento dividido ou rede comunitária'],
  cfg: HOJE,
});
add('casa_esgoto', 'ESCOLHA_UNICA', 'Esgoto na casa de HOJE', { opcoes: ['Rede pública (coleta oficial)', 'Fossa séptica', 'Fossa rudimentar', 'Direto em córrego/valas'], cfg: HOJE });
add('casa_energia', 'ESCOLHA_UNICA', 'Energia elétrica na casa de HOJE', {
  opcoes: [
    'Rede pública, com relógio só da casa (conta de luz no nome de alguém da família)',
    'Rede pública, com relógio dividido com outra casa',
    'Ligação sem relógio ou provisória (sem conta de luz própria)',
    'Não tem energia elétrica',
  ],
  cfg: HOJE,
});
add('casa_lixo', 'ESCOLHA_UNICA', 'Lixo da casa de HOJE', {
  opcoes: ['Coletado na porta por caminhão', 'Depositado em caçamba comunitária', 'Queimado / Enterrado', 'Descartado em terreno/córrego'],
  cfg: HOJE,
});
add('casa_condicoes', 'ESCOLHA_MULTIPLA', 'Quais destas situações acontecem com frequência na moradia de HOJE?', {
  opcoes: [
    'Muita infiltração, mofo ou umidade nas paredes/teto',
    'Cômodos (principalmente quartos) sem janela ou com pouca ventilação',
    'Casa muito escura de dia, precisa de luz acesa quase sempre',
    'Goteiras frequentes quando chove',
    'Risco de fiação exposta ou curto-circuito',
    'Pragas frequentes (ratos, baratas, escorpiões)',
    nenhuma('Nenhuma dessas (a casa tem boa ventilação, iluminação e conservação)'),
  ],
  cfg: HOJE,
});

// ─── Bloco 11: Adaptação ─────────────────────────────────────────────────
bloco(11, 'Mudança para o condomínio', 'Para terminar, perguntas sobre a mudança e a vida no novo condomínio.');
add('adapt_emocional', 'ESCALA', 'De 1 a 5, o quanto você e sua família se sentem preparados emocionalmente para a mudança?', {
  escalaMin: 1,
  escalaMax: 5,
  cfg: { ...FUTURO, escalaLegenda: { min: 'Muito inseguro', max: 'Muito seguro' } },
});
add('adapt_sentimentos', 'ESCOLHA_MULTIPLA', 'Quais são seus principais sentimentos, expectativas ou preocupações com a mudança?', {
  opcoes: [
    'Alívio e felicidade por ter a casa própria',
    'Preocupação com a adaptação ao novo bairro (escolas, transporte, saúde etc.)',
    'Ansiedade ou medo da convivência em condomínio (regras, barulho, vizinhos)',
    'Preocupação com o aumento das despesas da casa',
  ],
  cfg: { ...FUTURO, ajuda: 'Pode marcar mais de uma.' },
});
add('adapt_sentimentos_texto', 'TEXTO_LONGO', 'Se quiser, conte um pouco mais sobre o que você espera, deseja ou o que mais preocupa nessa mudança', {
  obrigatoria: false,
  cfg: FUTURO,
});
add('adapt_condominio', 'ESCOLHA_UNICA', 'Você já morou em condomínio de prédios antes?', {
  opcoes: ['Sim, já conheço a rotina e as regras.', 'Não, será a minha primeira vez.'],
});
add('adapt_financas', 'ESCOLHA_UNICA', 'O condomínio tem despesas mensais fixas (taxa de condomínio). Você se sente orientado(a) para organizar as finanças da casa?', {
  opcoes: ['Sim, estou bem orientado(a).', 'Parcialmente, ainda tenho dúvidas.', 'Não, preciso de ajuda e orientação sobre organização financeira.'],
  cfg: FUTURO,
});
add('adapt_sindico', 'ESCOLHA_UNICA', 'Você teria interesse em se candidatar a síndico(a), subsíndico(a) ou conselheiro(a) do prédio?', {
  opcoes: ['Sim, tenho interesse.', 'Não tenho interesse.', 'Gostaria de entender melhor o que um síndico faz antes de decidir.'],
  cfg: FUTURO,
});

// ─── Encerramento ────────────────────────────────────────────────────────
secao('Espaço de escuta');
add('comentario_final', 'TEXTO_LONGO', 'Quer deixar alguma dúvida, desabafo ou comentário para a equipe do Trabalho Técnico Social?', {
  obrigatoria: false,
  cfg: { ajuda: 'Esta pergunta é opcional.' },
});

const config: QuestionarioConfig = {
  grupos: {
    morador: {
      rotulo: 'Morador',
      rotuloPrimeiro: 'Morador 1 (você, titular)',
      contagem: { de: ['qtd_total', 'qtd_pessoas'], modo: 'primeiro' },
      nomeDe: { primeiro: 'nome', demais: 'm_nome' },
    },
    pcd: { rotulo: 'Pessoa com deficiência', contagem: { de: ['pcd_quem'], modo: 'selecao' } },
    estudante: { rotulo: 'Estudante', contagem: { de: ['est_quem'], modo: 'selecao' } },
    cronico: { rotulo: 'Saúde', contagem: { de: ['saude_cronica_quem'], modo: 'selecao' } },
    gratuidade: { rotulo: 'Gratuidade', contagem: { de: ['mob_gratuidade_quem'], modo: 'selecao' } },
  },
  textoFinal:
    'Agradecemos por responder! Seus dados foram salvos com segurança. Desejamos uma excelente mudança e uma nova fase maravilhosa para você e sua família no Condomínio José Bonifácio. Nossa equipe entrará em contato em breve, se for necessário.\n\nEquipe do Trabalho Técnico Social',
};

const MENSAGEM =
  'Olá, {{nome}}! A equipe do Trabalho Técnico Social do Condomínio José Bonifácio preparou um questionário para conhecer melhor a sua família. ' +
  'Você pode responder pelo celular, com calma, e continuar depois se precisar. Toque no link para começar: {{link}}';

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) throw new Error('Uso: npx ts-node scripts/seed-questionario-v3-sp9.ts <tenantId>');
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nome: true } as any });
    if (!tenant) throw new Error(`Tenant ${tenantId} não encontrado`);
    const normalizadas = normalizarPerguntas(perguntas);

    const existente = await prisma.preOcupacaoQuestionario.findFirst({ where: { tenantId, titulo: TITULO }, orderBy: { criadoEm: 'desc' } });
    // Publicado só é alterado com --atualizar-publicado (ambiente de teste); em produção use "Duplicar".
    if (existente && existente.status !== 'RASCUNHO' && !process.argv.includes('--atualizar-publicado')) {
      console.log(`Já existe publicado/encerrado (${existente.id}, ${existente.status}). Nada feito. Use "Duplicar" na tela se precisar de nova versão.`);
      return;
    }
    const q = existente
      ? await prisma.preOcupacaoQuestionario.update({
          where: { id: existente.id },
          // Perguntas podem ter mudado: o teste aprovado deixa de valer
          data: { config: config as any, mensagemEnvio: MENSAGEM, validadeDias: 7, testeAprovadoEm: null, testeAprovadoPor: null },
        })
      : await prisma.preOcupacaoQuestionario.create({
          data: {
            tenantId,
            titulo: TITULO,
            descricao: 'Questionário de acompanhamento do Trabalho Técnico Social para conhecer a realidade, as necessidades e as expectativas da sua família.',
            mensagemEnvio: MENSAGEM,
            validadeDias: 7,
            config: config as any,
            criadoPor: 'Carga do Questionário V3',
          },
        });
    // Atualiza pela chave: pergunta que continua mantém o id (e as respostas já dadas);
    // pergunta que saiu é apagada; pergunta nova é criada.
    const atuais = await prisma.preOcupacaoQuestionarioPergunta.findMany({ where: { questionarioId: q.id }, select: { id: true, chave: true } });
    const porChave = new Map(atuais.filter((a) => a.chave).map((a) => [a.chave as string, a.id]));
    const novasChaves = new Set(normalizadas.map((p) => p.chave));
    await prisma.$transaction([
      prisma.preOcupacaoQuestionarioPergunta.deleteMany({
        where: { questionarioId: q.id, OR: [{ chave: null }, { chave: { notIn: [...novasChaves].filter(Boolean) as string[] } }] },
      }),
      ...normalizadas.map((p) => {
        const dados = { ...p, opcoes: (p.opcoes ?? null) as any, config: (p.config ?? null) as any };
        const id = p.chave ? porChave.get(p.chave) : undefined;
        return id
          ? prisma.preOcupacaoQuestionarioPergunta.update({ where: { id }, data: dados })
          : prisma.preOcupacaoQuestionarioPergunta.create({ data: { ...dados, questionarioId: q.id } });
      }),
    ]);
    console.log(`${existente ? 'Atualizado' : 'Criado'}: ${q.id} · ${normalizadas.length} telas · tenant ${(tenant as any).nome ?? tenantId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
