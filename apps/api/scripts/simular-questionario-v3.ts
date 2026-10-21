// Bateria de simulações do Questionário V3 (só leitura do banco do .env, nada é gravado). Uso: npx ts-node scripts/simular-questionario-v3.ts
// Percorre o fluxo como a tela da família faz, para vários perfis, e gera um relatório em markdown.
import 'dotenv/config';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { montarPassos, opcoesDinamicas, opcoesDe, cfgPergunta, RespostaFluxo, PerguntaFluxo } from '../src/pre-ocupacao/questionario-fluxo';
import { validarValor, preencherTexto, respostaParaTexto } from '../src/pre-ocupacao/questionario-pergunta.util';

type Resp = { valor?: unknown; extras?: unknown } | null;
type Gerador = (inst: number, ops: string[]) => Resp;

interface Cenario {
  nome: string;
  descricao: string;
  respostas: Record<string, Gerador>;
  /** idades por morador (instância), usadas nas checagens de coerência */
  idades: number[];
  esperado: { aparece?: string[]; naoAparece?: string[]; repeticoes?: Record<string, number> };
}

const R = (valor: unknown, extras?: unknown): Gerador => () => ({ valor, extras });

// ─── Cenários ────────────────────────────────────────────────────────────
const cenarios: Cenario[] = [
  {
    nome: '1. Idosa que mora sozinha',
    descricao: 'Titular de 72 anos, aposentada, mora sozinha, sem deficiência, sem crianças, usa UBS, tem hipertensão.',
    idades: [72],
    respostas: {
      qtd_pessoas: R('1 pessoa (moro sozinho/a)'),
      m_idade: R(72),
      m_vinculo: R('Aposentado ou Pensionista do INSS'),
      m_renda: R('1.518,00'),
      beneficios: R(['Ninguém da família recebe benefício']),
      pcd: R('Não'),
      escola_tem: R('Não'),
      saude_cronica: R('Sim'),
      saude_cronica_quem: (_i, o) => ({ valor: [o[0]] }),
      saude_cronica_quais: R(['Hipertensão (pressão alta) ou problemas cardíacos']),
      saude_medicamentos: R('Sim'),
      saude_medicamentos_quais: R(['Losartana ou Enalapril / Captopril (pressão alta)']),
      mob_gratuidade: R('Sim'),
      mob_gratuidade_quem: (_i, o) => ({ valor: [o[0]] }),
      mob_gratuidade_tipo: R(['Bilhete Único Especial Pessoa Idosa']),
      apoio: R('Não, a família não tem rede de apoio no momento.'),
    },
    esperado: {
      naoAparece: ['m_nome', 'qtd_total', 'pcd_quem', 'pcd_categoria', 'est_quem', 'escola_frequentam', 'est_etapa', 'apoio_quem', 'apoio_local'],
      aparece: ['saude_cronica_quais', 'saude_medicamentos_quais', 'mob_gratuidade_tipo', 'apoio_cuidados', 'beneficios'],
      repeticoes: { m_idade: 1, saude_cronica_quais: 1, mob_gratuidade_tipo: 1 },
    },
  },
  {
    nome: '2. Casal com filha pequena e cônjuge com deficiência',
    descricao: 'Titular 45 anos (CLT), cônjuge 50 anos cadeirante, filha 9 anos na escola. Pede atendimento reservado.',
    idades: [45, 50, 9],
    respostas: {
      qtd_pessoas: R('3 pessoas'),
      m_nome: (i) => ({ valor: ['', 'João Pereira', 'Ana Pereira'][i] }),
      m_parentesco: (i) => ({ valor: i === 1 ? 'Cônjuge / Companheiro(a)' : 'Filho(a)' }),
      m_idade: (i) => ({ valor: [45, 50, 9][i] }),
      m_vinculo: (i) => ({ valor: ['Carteira assinada (CLT)', 'Não trabalha / Desempregado', 'Não trabalha / Desempregado'][i] }),
      m_renda: R('2.200,00'),
      m_escolaridade: (i) => ({ valor: i === 2 ? 'Ensino Fundamental I (1º ao 5º ano)' : 'Ensino Médio (1º ao 3º ano)' }),
      beneficios: R(['Bolsa Família'], { 'Bolsa Família': '600,00' }),
      pcd: R('Sim'),
      pcd_quem: (_i, o) => ({ valor: [o[1]] }),
      pcd_assistiva: R('Sim'),
      pcd_assistiva_itens: R(['Cadeira de rodas manual ou motorizada']),
      pcd_tratamento: R('Sim', { Sim: 'CER Itaquera' }),
      pcd_tratamento_freq: R(2),
      escola_tem: R('Sim'),
      est_quem: (_i, o) => ({ valor: [o[2]] }),
      escola_frequentam: R(1),
      est_etapa: R('Ensino Fundamental I'),
      est_vaga: R('Sim'),
      saude_cronica: R('Não'),
      saude_medicamentos: R('Não'),
      mob_gratuidade: R('Sim'),
      mob_gratuidade_quem: (_i, o) => ({ valor: [o[1]] }),
      mob_gratuidade_tipo: R(['Bilhete Único Especial Pessoa com Deficiência']),
      rede_sigilo: (_i, o) => ({ valor: o[2] }),
    },
    esperado: {
      aparece: ['m_nome', 'pcd_quem', 'pcd_categoria', 'pcd_assistiva_itens', 'pcd_tratamento_freq', 'est_quem', 'escola_frequentam', 'est_escola', 'apoio_cuidados'],
      naoAparece: ['qtd_total', 'saude_cronica_quem', 'saude_medicamentos_quais'],
      repeticoes: { m_idade: 3, m_nome: 2, m_vinculo: 2, m_estado_civil: 1, pcd_categoria: 1, est_etapa: 1, mob_gratuidade_tipo: 1, beneficios: 1 },
    },
  },
  {
    nome: '3. Família grande (7 pessoas, "5 ou mais")',
    descricao: 'Titular 38 anos autônoma, mãe idosa com deficiência visual, 5 filhos de 1 a 16 anos; 4 em idade escolar.',
    idades: [38, 70, 16, 12, 8, 4, 1],
    respostas: {
      qtd_pessoas: R('5 ou mais pessoas'),
      qtd_total: R(7),
      m_nome: (i) => ({ valor: ['', 'Dona Rosa', 'Lucas', 'Bia', 'Caio', 'Duda', 'Enzo'][i] }),
      m_parentesco: (i) => ({ valor: i === 1 ? 'Pai / Mãe' : 'Filho(a)' }),
      m_idade: (i) => ({ valor: [38, 70, 16, 12, 8, 4, 1][i] }),
      m_vinculo: (i) => ({ valor: i === 0 ? 'Autônomo (trabalha por conta própria)' : i === 1 ? 'Aposentado ou Pensionista do INSS' : 'Não trabalha / Desempregado' }),
      beneficios: R(['BPC (Idoso ou PcD)'], { 'BPC (Idoso ou PcD)': '1.518,00' }),
      pcd: R('Sim'),
      pcd_quem: (_i, o) => ({ valor: [o[1]] }),
      pcd_categoria: R(['Visual (ex: cegueira, baixa visão)']),
      escola_tem: R('Sim'),
      est_quem: (_i, o) => ({ valor: [o[2], o[3], o[4], o[5]] }),
      escola_frequentam: R(4),
      est_etapa: (i) => ({ valor: ['Ensino Médio', 'Ensino Fundamental II', 'Ensino Fundamental I', 'Ainda não está matriculado(a)'][i] }),
      saude_cronica: R('Sim'),
      saude_cronica_quem: (_i, o) => ({ valor: [o[1], o[6]] }),
      saude_cronica_quais: (i) => ({ valor: [i === 0 ? 'Diabetes' : 'Doença respiratória crônica (asma, bronquite, DPOC)'] }),
    },
    esperado: {
      aparece: ['qtd_total', 'est_quem', 'apoio_cuidados'],
      repeticoes: { m_idade: 7, m_nome: 6, m_vinculo: 3, m_estado_civil: 2, m_escolaridade: 6, est_etapa: 4, est_escola: 3, pcd_categoria: 1, saude_cronica_quais: 2, beneficios: 1 },
    },
  },
  {
    nome: '4. Família de outra cidade, sem rede de apoio, recusa SUS',
    descricao: 'Mora em Guarulhos, casal sem filhos, tem convênio (não usa SUS), não vai usar a rede da região.',
    idades: [30, 31],
    respostas: {
      qtd_pessoas: R('2 pessoas'),
      m_nome: R('Carlos'),
      m_idade: (i) => ({ valor: [30, 31][i] }),
      pcd: R('Não'),
      escola_tem: R('Não'),
      saude_usa: R('Não, a família não utiliza a rede pública', { 'Não, a família não utiliza a rede pública': 'Temos convênio' }),
      saude_cronica: R('Não'),
      saude_medicamentos: R('Não'),
      saude_regiao: R('Não'),
      mob_gratuidade: R('Não'),
      apoio: R('Não, a família não tem rede de apoio no momento.'),
      origem_municipio: R('Outra cidade', { 'Outra cidade': 'Guarulhos' }),
    },
    esperado: {
      naoAparece: ['saude_servicos', 'saude_regiao_servicos', 'origem_zona', 'mob_gratuidade_quem', 'apoio_quem', 'est_quem', 'apoio_cuidados'],
      repeticoes: { m_idade: 2 },
    },
  },
];

// ─── Resposta padrão por tipo (quando o cenário não define) ───────────────
function padrao(p: PerguntaFluxo & { tipo: string; config: any; escalaMin: number | null }, ops: string[]): Resp {
  const cfg = cfgPergunta(p);
  const op0 = opcoesDe({ opcoes: p.opcoes }).find((o) => !o.exclusiva) ?? opcoesDe({ opcoes: p.opcoes })[0];
  const comp = (label: string) => {
    const o = opcoesDe({ opcoes: p.opcoes }).find((x) => x.label === label);
    if (!o?.complemento) return undefined;
    return { [label]: o.complemento === 'VALOR' ? '100,00' : 'teste' };
  };
  switch (p.tipo) {
    case 'ACEITE':
      return { valor: ops };
    case 'ESCOLHA_UNICA':
      return { valor: ops[0], extras: comp(ops[0]) };
    case 'ESCOLHA_MULTIPLA':
      return op0 ? { valor: [op0.label], extras: comp(op0.label) } : { valor: [ops[0]] };
    case 'CONTADOR':
      return { valor: cfg.min ?? 1 };
    case 'ESCALA':
      return { valor: 3 };
    case 'MOEDA':
      return { valor: '1.000,00' };
    case 'TELEFONE':
      return { valor: '11988887777' };
    case 'CAMPOS':
      return { extras: Object.fromEntries((cfg.campos ?? []).map((c: any) => [c.chave, c.tipo === 'CONTADOR' ? 0 : 'x'])) };
    case 'TEXTO_LONGO':
      return p.obrigatoria ? { valor: 'texto de teste' } : null;
    default:
      return { valor: 'Teste da Silva' };
  }
}

(async () => {
  const prisma = new PrismaClient();
  const q = await prisma.preOcupacaoQuestionario.findFirst({
    where: { titulo: { startsWith: 'Acompanhamento Psicossocial' } },
    include: { perguntas: { orderBy: { ordem: 'asc' } } },
  });
  if (!q) throw new Error('Questionário V3 não encontrado no banco dev');
  const perguntas = q.perguntas as any[];
  const porChave = new Map(perguntas.map((p) => [p.chave, p]));
  const porId = new Map(perguntas.map((p) => [p.id, p]));
  const md: string[] = [`# Questionário V3: bateria de simulações`, '', `Gerado em ${new Date().toLocaleString('pt-BR')} · ${perguntas.length} perguntas cadastradas.`, ''];
  const achados: string[] = [];

  // ─── Checagens estruturais ─────────────────────────────────────────────
  const grupos = ((q.config as any)?.grupos ?? {}) as Record<string, any>;
  for (const p of perguntas) {
    const cfg = cfgPergunta(p);
    for (const c of cfg.mostrarSe ?? []) {
      if ('chave' in c && !porChave.has(c.chave)) achados.push(`ESTRUTURA: "${p.chave}" depende de "${c.chave}", que não existe.`);
      if ('em' in c) {
        const ref = porChave.get(c.chave);
        const labels = opcoesDe(ref ?? { opcoes: [] }).map((o) => o.label);
        for (const v of c.em) if (ref && labels.length && !labels.includes(v)) achados.push(`ESTRUTURA: "${p.chave}" espera a opção "${v}" em "${c.chave}", que não existe.`);
      }
    }
    if (/\{\{pessoa\}\}/.test(p.enunciado) && !cfg.grupo) achados.push(`ESTRUTURA: "${p.chave}" usa {{pessoa}} fora de grupo de pessoas.`);
    if (cfg.opcoesDinamicas && !grupos[cfg.opcoesDinamicas.grupo]) achados.push(`ESTRUTURA: "${p.chave}" usa nomes do grupo "${cfg.opcoesDinamicas.grupo}", que não existe.`);
  }
  for (const [nome, g] of Object.entries(grupos)) for (const ch of g.contagem.de) if (!porChave.has(ch)) achados.push(`ESTRUTURA: grupo "${nome}" conta por "${ch}", que não existe.`);

  // ─── Simulações ────────────────────────────────────────────────────────
  for (const cen of cenarios) {
    const respostas: RespostaFluxo[] = [];
    const feitas = new Set<string>();
    const linhas: string[] = [];
    const vistos = new Map<string, number>();
    const problemas: string[] = [];
    let telas = 0;

    for (let guard = 0; guard < 800; guard++) {
      const passos = montarPassos(perguntas, q.config, respostas);
      const prox = passos.find((s) => !feitas.has(`${s.perguntaId}#${s.instancia}`));
      if (!prox) break;
      feitas.add(`${prox.perguntaId}#${prox.instancia}`);
      telas++;
      const p = porId.get(prox.perguntaId);
      const cfg = cfgPergunta(p);
      vistos.set(p.chave, (vistos.get(p.chave) ?? 0) + 1);
      const texto = preencherTexto(p.enunciado, { pessoa: prox.pessoa, instancia: prox.instancia, nome: 'Titular', telefone: '5511000000001' });
      if (/\{\{|\[pessoa\]|\[nº\]/.test(texto)) problemas.push(`Texto sem nome preenchido: "${texto}"`);
      const selo = cfg.tempo === 'HOJE' ? ' 📍HOJE' : cfg.tempo === 'FUTURO' ? ' 🏠JB' : '';
      if (p.tipo === 'INFO') {
        linhas.push(`\n**${texto}**`);
        continue;
      }
      const ops = opcoesDinamicas(p, perguntas, q.config, respostas).map((o) => o.label);
      if (p.tipo === 'CPF') {
        linhas.push(`- ${texto} → *(CPF conferido)*`);
        respostas.push({ perguntaId: p.id, instancia: 0, valorNumero: null, valorOpcoes: [], valorTexto: '12345678900' });
        continue;
      }
      // Coerência por idade (grupo dos moradores)
      const idade = cfg.grupo === 'morador' ? cen.idades[prox.instancia] : undefined;
      if (idade !== undefined && idade < 14 && ['m_vinculo', 'm_profissao', 'm_renda'].includes(p.chave))
        problemas.push(`Pergunta sobre trabalho/renda para criança de ${idade} anos (${prox.rotuloGrupo}): "${texto}"`);
      if (idade !== undefined && idade < 14 && p.chave === 'm_estado_civil')
        problemas.push(`Estado civil perguntado para criança de ${idade} anos (${prox.rotuloGrupo})`);
      if (idade !== undefined && idade < 3 && p.chave === 'm_escolaridade')
        problemas.push(`Escolaridade perguntada para bebê de ${idade} ano(s) (${prox.rotuloGrupo}) — só a opção "Ainda não estuda" faz sentido`);

      const gerador = cen.respostas[p.chave];
      const resp = gerador ? gerador(prox.instancia, ops) : padrao(p, ops);
      const rotulo = prox.rotuloGrupo ? `[${prox.rotuloGrupo}] ` : '';
      if (!resp) {
        linhas.push(`- ${rotulo}${texto}${selo} → *(em branco, opcional)*`);
        continue;
      }
      try {
        const norm = validarValor({ ...p, opcoes: cfg.opcoesDinamicas ? ops.map((label) => ({ label })) : p.opcoes }, resp.valor, resp.extras, p.ordem);
        if (!norm) {
          if (p.obrigatoria) problemas.push(`Obrigatória ficou em branco: ${p.chave}`);
          continue;
        }
        respostas.push({ perguntaId: p.id, instancia: prox.instancia, valorNumero: norm.valorNumero, valorOpcoes: norm.valorOpcoes, valorTexto: norm.valorTexto, extras: norm.extras });
        linhas.push(`- ${rotulo}${texto}${selo} → **${respostaParaTexto(p, norm)}**`);
      } catch (e: any) {
        problemas.push(`Resposta recusada em ${p.chave}: ${e.message}`);
      }
    }

    // Expectativas do cenário
    for (const c of cen.esperado.aparece ?? []) if (!vistos.has(c)) problemas.push(`Deveria aparecer e NÃO apareceu: ${c} ("${porChave.get(c)?.enunciado}")`);
    for (const c of cen.esperado.naoAparece ?? []) if (vistos.has(c)) problemas.push(`NÃO deveria aparecer e apareceu: ${c} ("${porChave.get(c)?.enunciado}")`);
    for (const [c, n] of Object.entries(cen.esperado.repeticoes ?? {}))
      if ((vistos.get(c) ?? 0) !== n) problemas.push(`"${c}" apareceu ${vistos.get(c) ?? 0}x, esperado ${n}x`);

    // Escola × idades
    const menores = cen.idades.filter((i) => i >= 0 && i < 18).length;
    const totalEscola = respostas.find((r) => r.perguntaId === porChave.get('est_quem')?.id)?.valorOpcoes.length ?? 0;
    const idadeEscolar = cen.idades.filter((i) => i >= 4 && i <= 17).length;
    const resumoEscola = `${totalEscola} marcados em idade escolar · ${idadeEscolar} moradores de 4 a 17 anos · ${menores} menores de 18`;

    md.push(`## ${cen.nome}`, '', cen.descricao, '', `**${telas} telas** · ${resumoEscola}`, '');
    md.push(problemas.length ? `### ⚠ Pontos encontrados (${problemas.length})\n${problemas.map((x) => `- ${x}`).join('\n')}` : '### ✓ Nenhum problema encontrado', '');
    md.push('<details><summary>Sequência completa de perguntas e respostas</summary>', '', ...linhas, '', '</details>', '');
    console.log(`${cen.nome}: ${telas} telas, ${problemas.length} ponto(s)`);
    for (const x of problemas) console.log('   -', x);
  }

  md.splice(3, 0, achados.length ? `## Checagem da estrutura\n${achados.map((x) => `- ${x}`).join('\n')}\n` : '## Checagem da estrutura\n✓ Todas as condições e grupos apontam para perguntas que existem.\n');
  console.log('estrutura:', achados.length ? achados : 'ok');
  fs.writeFileSync('../QUESTIONARIO V3 - simulacoes.md', md.join('\n'), 'utf-8');
  await prisma.$disconnect();
})();
