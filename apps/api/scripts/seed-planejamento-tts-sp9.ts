/**
 * Seed do módulo Planejamento TTS para o tenant SP9.
 *
 * Fonte dos dados: planejamento contratual do TTS Pré-Ocupação José Bonifácio
 * (contrato SP9 × Valure assinado 21/07/2026, vigência 24/06/2026–28/02/2027;
 * âncora de prazos: entrega das unidades em dez/2026, definida pelo contratante).
 *
 * Idempotente: upsert pelas chaves naturais (tenantId+ordem / tenantId+numero).
 * O bloco `update` NUNCA toca campos operacionais editáveis pela equipe
 * (status, observacoes, entregaveisStatus, nfStatus, pagamentoStatus, situacao,
 * evidencias) — re-rodar o seed corrige dados contratuais sem apagar progresso.
 *
 * Uso:
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/seed-planejamento-tts-sp9.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import {
  PrismaClient,
  PlanejamentoTtsAtividadeStatus as AtvStatus,
  PlanejamentoTtsIndicadorSituacao as IndSituacao,
} from '@prisma/client';

const prisma = new PrismaClient();

// Em dev, sobrescreva com TENANT_ID=<uuid do tenant de teste> (o SP9 real só existe em produção).
const TENANT_SP9 = process.env.TENANT_ID || '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type AtividadeSeed = {
  ordem: number;
  titulo: string;
  eixo: string;
  indicadorQid?: string;
  prazoLimite: string;
  responsavel: string;
  statusInicial: AtvStatus;
  obsInicial?: string;
};

const ATIVIDADES: AtividadeSeed[] = [
  { ordem: 1, titulo: 'Elaboração e entrega do Plano TTS de Pré-Ocupação', eixo: 'Planejamento', indicadorQid: '1', prazoLimite: '2026-06-24', responsavel: 'José Hernandes', statusInicial: 'CONCLUIDO', obsInicial: 'Plano Global competência junho/2026 entregue no início da prestação' },
  { ordem: 2, titulo: 'Documentação comprobatória do perfil socioeconômico (Cláusula 2ª §2º)', eixo: 'Diagnósticos', indicadorQid: '5', prazoLimite: '2026-08-05', responsavel: 'Equipe técnica', statusInicial: 'EM_ANDAMENTO', obsInicial: 'PRAZO CONTRATUAL: 15 dias da assinatura (21/07). Não perder!' },
  { ordem: 3, titulo: 'Diagnóstico do perfil socioeconômico e territorial das famílias', eixo: 'Diagnósticos', indicadorQid: '5', prazoLimite: '2026-08-05', responsavel: 'Tatiane (Assistente Social)', statusInicial: 'EM_ANDAMENTO', obsInicial: 'Edital: até 6 meses antes da entrega — janela já aberta, priorizar' },
  { ordem: 4, titulo: 'Análise e avaliação do perfil psicossocial das famílias', eixo: 'Diagnósticos', indicadorQid: '6', prazoLimite: '2026-08-05', responsavel: 'Tatiane (Assistente Social)', statusInicial: 'EM_ANDAMENTO', obsInicial: 'Edital: até 6 meses antes da entrega' },
  { ordem: 5, titulo: 'Diagnóstico do histórico de moradia atual das famílias', eixo: 'Diagnósticos', indicadorQid: '7', prazoLimite: '2026-08-05', responsavel: 'Tatiane (Assistente Social)', statusInicial: 'EM_ANDAMENTO', obsInicial: 'Meta 50% — mesmo assim documentar' },
  { ordem: 6, titulo: 'Análise do entorno — 100% dos equipamentos em raio de 600m', eixo: 'Diagnósticos', indicadorQid: '8', prazoLimite: '2026-08-05', responsavel: 'Equipe técnica', statusInicial: 'EM_ANDAMENTO', obsInicial: 'Levantamento inicial já consta no Plano TTS; formalizar relatório' },
  { ordem: 7, titulo: 'Diagnóstico inicial consolidado das famílias (Cláusula 5ª §2º)', eixo: 'Diagnósticos', indicadorQid: '5-8', prazoLimite: '2026-08-31', responsavel: 'José Hernandes', statusInicial: 'PENDENTE', obsInicial: 'Entregável específico do contrato — consolida os 4 diagnósticos' },
  { ordem: 8, titulo: 'Acompanhamento psicossocial contínuo das famílias', eixo: 'Acompanhamento', indicadorQid: '2', prazoLimite: '2026-11-30', responsavel: 'Tatiane (Assistente Social)', statusInicial: 'EM_ANDAMENTO', obsInicial: 'Contínuo até a entrega; registrar atendimentos na plataforma' },
  { ordem: 9, titulo: 'Relatório consolidado do acompanhamento psicossocial', eixo: 'Acompanhamento', indicadorQid: '2', prazoLimite: '2026-11-30', responsavel: 'Tatiane (Assistente Social)', statusInicial: 'PENDENTE', obsInicial: 'Até 1 mês antes da entrega (dez/2026)' },
  { ordem: 10, titulo: 'Encontro trimestral com equipes técnicas — 3º trim/2026', eixo: 'Articulação territorial', indicadorQid: '3', prazoLimite: '2026-09-30', responsavel: 'José Hernandes', statusInicial: 'PENDENTE', obsInicial: 'Equipamentos e articulações em raio de 1 km' },
  { ordem: 11, titulo: 'Encontro trimestral com equipes técnicas — 4º trim/2026', eixo: 'Articulação territorial', indicadorQid: '3', prazoLimite: '2026-12-15', responsavel: 'José Hernandes', statusInicial: 'PENDENTE' },
  { ordem: 12, titulo: 'Encontro trimestral com equipes técnicas — 1º trim/2027', eixo: 'Articulação territorial', indicadorQid: '3', prazoLimite: '2027-02-20', responsavel: 'José Hernandes', statusInicial: 'PENDENTE', obsInicial: 'Último encontro antes do fim da vigência' },
  { ordem: 13, titulo: 'Oficina Eixo I — Organização Condominial, Governança e Sust. Financeira', eixo: 'Eixo I (socioeducativa 1/4)', indicadorQid: '11', prazoLimite: '2026-08-31', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Inclui Oficina de Orçamento Familiar e Educação Financeira' },
  { ordem: 14, titulo: 'Distribuição digital da Convenção e Regimento em Linguagem Cidadã', eixo: 'Eixo I', indicadorQid: '11', prazoLimite: '2026-08-31', responsavel: 'Camila (Pedagoga)', statusInicial: 'PENDENTE', obsInicial: 'Via plataforma VIA CRM / WhatsApp' },
  { ordem: 15, titulo: 'Atividade informativa 1/2 — ações TTS, empreendimento e financiamento', eixo: 'Informação às famílias', indicadorQid: '10', prazoLimite: '2026-08-31', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Mínimo 2 nos 6 meses antes da entrega' },
  { ordem: 16, titulo: 'Oficina Eixo II — Educação Ambiental, Patrimonial e Prevenção de Riscos', eixo: 'Eixo II (socioeducativa 2/4)', indicadorQid: '11', prazoLimite: '2026-09-30', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Alvenaria estrutural com técnicos do empreendimento' },
  { ordem: 17, titulo: 'Circuito de Manutenção Preventiva e Consumo Consciente', eixo: 'Eixo II', indicadorQid: '11', prazoLimite: '2026-09-30', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Hidráulica, gás, prevenção de incêndio' },
  { ordem: 18, titulo: 'Oficina Eixo III — Convivência Comunitária (Pactuação dos 3 Ps)', eixo: 'Eixo III (socioeducativa 3/4)', indicadorQid: '11', prazoLimite: '2026-10-31', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Pets, Propaganda (barulho) e Parking' },
  { ordem: 19, titulo: 'Atividade informativa 2/2 — ações TTS, empreendimento e financiamento', eixo: 'Informação às famílias', indicadorQid: '10', prazoLimite: '2026-10-31', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Fecha a meta do indicador 10' },
  { ordem: 20, titulo: 'Reunião de mudança 1/2 + Formação da Comissão de Mudança', eixo: 'Mudança', indicadorQid: '4', prazoLimite: '2026-10-31', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Mínimo 2 reuniões nos 6 meses antes da entrega' },
  { ordem: 21, titulo: 'Formação do Comitê de Conciliação Interna (CNV)', eixo: 'Eixo III', indicadorQid: '11', prazoLimite: '2026-10-31', responsavel: 'Camila (Pedagoga)', statusInicial: 'PENDENTE', obsInicial: 'Capacitação de lideranças em mediação' },
  { ordem: 22, titulo: 'Oficina Eixo IV — Geração de Renda e Inclusão Produtiva', eixo: 'Eixo IV (socioeducativa 4/4)', indicadorQid: '11', prazoLimite: '2026-11-30', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Fecha a meta de 4 atividades socioeducativas' },
  { ordem: 23, titulo: 'Diagnóstico de habilidades + Catálogo Digital de Empreendedores', eixo: 'Eixo IV', indicadorQid: '11', prazoLimite: '2026-11-30', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Articulação com Sistema S conforme perfil da pesquisa' },
  { ordem: 24, titulo: 'Ação de mobilização e fortalecimento social', eixo: 'Mobilização', indicadorQid: '9', prazoLimite: '2026-11-30', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Janela do edital: 3 meses que antecedem a entrega (out–dez)' },
  { ordem: 25, titulo: 'Reunião de mudança 2/2 + Matriz de Mudanças Escalonadas', eixo: 'Mudança', indicadorQid: '4', prazoLimite: '2026-11-30', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Blocos, pavimentos e faixas horárias pactuados' },
  { ordem: 26, titulo: 'AGI Simulada do Condomínio José Bonifácio', eixo: 'Marco', prazoLimite: '2026-12-15', responsavel: 'Equipe completa', statusInicial: 'PENDENTE', obsInicial: 'Atividade prática final antes da AGI real' },
  { ordem: 27, titulo: 'Avaliação semestral das ações (matriz de indicadores)', eixo: 'Monitoramento', prazoLimite: '2026-12-23', responsavel: 'José Hernandes', statusInicial: 'PENDENTE', obsInicial: 'Contrato: avaliação a cada 6 meses no máximo (início 24/06)' },
  { ordem: 28, titulo: 'ENTREGA DAS UNIDADES / mudanças escalonadas', eixo: 'Marco', prazoLimite: '2026-12-31', responsavel: 'SP9 / Equipe', statusInicial: 'PENDENTE', obsInicial: 'Data âncora dos prazos do edital — CONFIRMAR com a SP9' },
  { ordem: 29, titulo: 'Pesquisa de satisfação com os adquirentes', eixo: 'Pesquisa', indicadorQid: '12', prazoLimite: '2027-01-31', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Mínimo 1 por empreendimento — aplicar na entrega/mudança' },
  { ordem: 30, titulo: 'Apoio à adaptação inicial pós-mudança', eixo: 'Acompanhamento', prazoLimite: '2027-02-26', responsavel: 'Equipe técnica', statusInicial: 'PENDENTE', obsInicial: 'Edital: TTS pré se estende 2 meses após o Habite-se' },
  { ordem: 31, titulo: 'Avaliação final das ações + relatório de encerramento', eixo: 'Monitoramento', prazoLimite: '2027-02-26', responsavel: 'José Hernandes', statusInicial: 'PENDENTE', obsInicial: 'Inclui relatório consolidado final da vigência' },
  { ordem: 32, titulo: 'LGPD — devolução/eliminação comprovada dos dados das famílias', eixo: 'Encerramento', prazoLimite: '2027-02-28', responsavel: 'José Hernandes', statusInicial: 'PENDENTE', obsInicial: 'Cláusula 9ª §2º item iv' },
  { ordem: 33, titulo: 'Se necessário: aditivo de prorrogação (30 dias de antecedência)', eixo: 'Contratual', prazoLimite: '2027-01-29', responsavel: 'José Hernandes', statusInicial: 'PENDENTE', obsInicial: 'Decidir até esta data se a entrega atrasar' },
];

type ParcelaSeed = {
  numero: number;
  competencia: string;
  entregaveisAte: string;
  aceiteAte: string;
  nfEm: string;
  receberAte: string;
  obsInicial?: string;
};

const VALOR_PARCELA = '15788.00';

const PARCELAS: ParcelaSeed[] = [
  { numero: 1, competencia: '2026-07', entregaveisAte: '2026-07-24', aceiteAte: '2026-07-31', nfEm: '2026-07-31', receberAte: '2026-08-20', obsInicial: 'Cobre 24/06 a 31/07 (convalidação Cláusula 2ª §1º)' },
  { numero: 2, competencia: '2026-08', entregaveisAte: '2026-08-24', aceiteAte: '2026-08-31', nfEm: '2026-08-31', receberAte: '2026-09-21', obsInicial: 'Anexar: diagnósticos consolidados + oficina Eixo I' },
  { numero: 3, competencia: '2026-09', entregaveisAte: '2026-09-23', aceiteAte: '2026-09-30', nfEm: '2026-09-30', receberAte: '2026-10-20', obsInicial: 'Anexar: oficina Eixo II + encontro trimestral' },
  { numero: 4, competencia: '2026-10', entregaveisAte: '2026-10-23', aceiteAte: '2026-10-30', nfEm: '2026-10-30', receberAte: '2026-11-19', obsInicial: 'Anexar: oficina Eixo III + reunião mudança 1 + informativa 2' },
  { numero: 5, competencia: '2026-11', entregaveisAte: '2026-11-23', aceiteAte: '2026-11-30', nfEm: '2026-11-30', receberAte: '2026-12-21', obsInicial: 'Anexar: oficina Eixo IV + relatório psicossocial + matriz mudanças' },
  { numero: 6, competencia: '2026-12', entregaveisAte: '2026-12-18', aceiteAte: '2026-12-28', nfEm: '2026-12-30', receberAte: '2027-01-19', obsInicial: 'Anexar: AGI Simulada + avaliação semestral. Antecipado por festas' },
  { numero: 7, competencia: '2027-01', entregaveisAte: '2027-01-22', aceiteAte: '2027-01-29', nfEm: '2027-01-29', receberAte: '2027-02-18', obsInicial: 'Anexar: pesquisa de satisfação + apoio pós-mudança' },
  { numero: 8, competencia: '2027-02', entregaveisAte: '2027-02-19', aceiteAte: '2027-02-26', nfEm: '2027-02-26', receberAte: '2027-03-18', obsInicial: 'Última parcela: relatório final consolidado + encerramento' },
];

type IndicadorSeed = {
  numero: number;
  atividade: string;
  meta: string;
  metaPercentual: string;
  pesoPercentual: string;
  situacaoInicial: IndSituacao;
  evidenciasIniciais?: string;
};

const INDICADORES: IndicadorSeed[] = [
  { numero: 1, atividade: 'Elaboração do Plano TTS de Pré-Ocupação', meta: '01 Plano Global entregue até o início da prestação', metaPercentual: '100.00', pesoPercentual: '10.00', situacaoInicial: 'ATINGIDO', evidenciasIniciais: 'Plano competência jun/2026' },
  { numero: 2, atividade: 'Acompanhamento psicossocial das famílias', meta: '01 relatório até 1 mês antes da entrega', metaPercentual: '90.00', pesoPercentual: '5.00', situacaoInicial: 'EM_ANDAMENTO' },
  { numero: 3, atividade: 'Encontros trimestrais com equipes técnicas (raio 1 km)', meta: '01 encontro por trimestre', metaPercentual: '100.00', pesoPercentual: '5.00', situacaoInicial: 'NAO_INICIADO' },
  { numero: 4, atividade: 'Orientação e apoio ao planejamento da mudança', meta: '02 reuniões nos 6 meses antes da entrega', metaPercentual: '90.00', pesoPercentual: '10.00', situacaoInicial: 'NAO_INICIADO' },
  { numero: 5, atividade: 'Diagnóstico do perfil socioeconômico e territorial', meta: '01 relatório até 6 meses antes da entrega', metaPercentual: '90.00', pesoPercentual: '10.00', situacaoInicial: 'EM_ANDAMENTO' },
  { numero: 6, atividade: 'Análise e avaliação do perfil psicossocial', meta: '01 relatório até 6 meses antes da entrega', metaPercentual: '90.00', pesoPercentual: '5.00', situacaoInicial: 'EM_ANDAMENTO' },
  { numero: 7, atividade: 'Diagnóstico do histórico de moradia', meta: '01 relatório até 6 meses antes da entrega', metaPercentual: '50.00', pesoPercentual: '5.00', situacaoInicial: 'EM_ANDAMENTO' },
  { numero: 8, atividade: 'Análise do entorno (equipamentos comunitários)', meta: '01 relatório com 100% dos equipamentos, 6 meses antes', metaPercentual: '90.00', pesoPercentual: '5.00', situacaoInicial: 'EM_ANDAMENTO' },
  { numero: 9, atividade: 'Ações de mobilização e fortalecimento social', meta: '01 atividade nos 3 meses antes da entrega', metaPercentual: '90.00', pesoPercentual: '10.00', situacaoInicial: 'NAO_INICIADO' },
  { numero: 10, atividade: 'Informação às famílias (ações TTS, empreendimento, financiamento)', meta: '02 atividades nos 6 meses antes da entrega', metaPercentual: '90.00', pesoPercentual: '10.00', situacaoInicial: 'NAO_INICIADO' },
  { numero: 11, atividade: 'Atividades socioeducativas durante as obras', meta: '04 atividades até a entrega', metaPercentual: '90.00', pesoPercentual: '15.00', situacaoInicial: 'NAO_INICIADO', evidenciasIniciais: 'Oficinas Eixos I–IV (ago–nov)' },
  { numero: 12, atividade: 'Pesquisa de satisfação com adquirentes', meta: '01 pesquisa por empreendimento', metaPercentual: '90.00', pesoPercentual: '10.00', situacaoInicial: 'NAO_INICIADO' },
];

async function main() {
  console.log(`Conectando em: ${(process.env.DATABASE_URL || '').split('@')[1] ?? '(sem DATABASE_URL)'}`);

  if (ATIVIDADES.length !== 33) throw new Error(`Esperadas 33 atividades, recebidas ${ATIVIDADES.length}`);
  if (PARCELAS.length !== 8) throw new Error(`Esperadas 8 parcelas, recebidas ${PARCELAS.length}`);
  if (INDICADORES.length !== 12) throw new Error(`Esperados 12 indicadores, recebidos ${INDICADORES.length}`);

  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_SP9 } });
  if (!tenant) throw new Error(`Tenant SP9 (${TENANT_SP9}) não encontrado no banco.`);
  console.log(`Tenant: ${tenant.nome ?? TENANT_SP9}`);

  for (const a of ATIVIDADES) {
    await prisma.planejamentoTtsAtividade.upsert({
      where: { tenantId_ordem: { tenantId: TENANT_SP9, ordem: a.ordem } },
      create: {
        tenantId: TENANT_SP9,
        ordem: a.ordem,
        titulo: a.titulo,
        eixo: a.eixo,
        indicadorQid: a.indicadorQid ?? null,
        prazoLimite: d(a.prazoLimite),
        responsavel: a.responsavel,
        status: a.statusInicial,
        observacoes: a.obsInicial ?? null,
      },
      // Campos operacionais (status, observacoes) NÃO entram no update — progresso preservado.
      update: {
        titulo: a.titulo,
        eixo: a.eixo,
        indicadorQid: a.indicadorQid ?? null,
        prazoLimite: d(a.prazoLimite),
        responsavel: a.responsavel,
      },
    });
  }
  console.log(`Atividades: ${ATIVIDADES.length} upserts OK`);

  for (const p of PARCELAS) {
    await prisma.planejamentoTtsParcela.upsert({
      where: { tenantId_numero: { tenantId: TENANT_SP9, numero: p.numero } },
      create: {
        tenantId: TENANT_SP9,
        numero: p.numero,
        competencia: p.competencia,
        entregaveisAte: d(p.entregaveisAte),
        aceiteAte: d(p.aceiteAte),
        nfEm: d(p.nfEm),
        receberAte: d(p.receberAte),
        valor: VALOR_PARCELA,
        observacoes: p.obsInicial ?? null,
      },
      update: {
        competencia: p.competencia,
        entregaveisAte: d(p.entregaveisAte),
        aceiteAte: d(p.aceiteAte),
        nfEm: d(p.nfEm),
        receberAte: d(p.receberAte),
        valor: VALOR_PARCELA,
      },
    });
  }
  console.log(`Parcelas: ${PARCELAS.length} upserts OK`);

  for (const i of INDICADORES) {
    await prisma.planejamentoTtsIndicador.upsert({
      where: { tenantId_numero: { tenantId: TENANT_SP9, numero: i.numero } },
      create: {
        tenantId: TENANT_SP9,
        numero: i.numero,
        atividade: i.atividade,
        meta: i.meta,
        metaPercentual: i.metaPercentual,
        pesoPercentual: i.pesoPercentual,
        situacao: i.situacaoInicial,
        evidencias: i.evidenciasIniciais ?? null,
      },
      update: {
        atividade: i.atividade,
        meta: i.meta,
        metaPercentual: i.metaPercentual,
        pesoPercentual: i.pesoPercentual,
      },
    });
  }
  console.log(`Indicadores: ${INDICADORES.length} upserts OK`);

  const [na, np, ni] = await Promise.all([
    prisma.planejamentoTtsAtividade.count({ where: { tenantId: TENANT_SP9 } }),
    prisma.planejamentoTtsParcela.count({ where: { tenantId: TENANT_SP9 } }),
    prisma.planejamentoTtsIndicador.count({ where: { tenantId: TENANT_SP9 } }),
  ]);
  console.log(`Totais no banco (SP9): atividades=${na} parcelas=${np} indicadores=${ni}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
