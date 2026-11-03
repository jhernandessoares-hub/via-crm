import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { soDigitos } from './portal/questionario-cpf.util';
import { AssembleiaConvocacaoWorker } from './assembleia-convocacao.worker';
import { AssembleiaConvocacaoService, registrarEventoAssembleia } from './assembleia-convocacao.service';
import { apurarItem, opcoesDoItem, quorumInstalacao, Quorum, TipoItem } from './assembleia-apuracao.util';

const TIPOS: TipoItem[] = ['APROVACAO', 'ELEICAO', 'ESCOLHA'];
const QUORUNS: Quorum[] = ['MAIORIA_PRESENTES', 'MAIORIA_ABSOLUTA', 'DOIS_TERCOS'];

export type PessoaDaUnidade = { nome: string; cpf: string; papel: 'TITULAR' | 'PARTICIPANTE' | 'PROCURADOR' };

/**
 * Quem pode votar pela unidade: o procurador liberado pela equipe, o titular do lead
 * ou um participante do cadastro (cônjuge etc.). Só CPF que já está no cadastro.
 */
export function pessoaDaUnidade(
  unidade: { procuradorNome: string | null; procuradorCpf: string | null },
  lead: { cpf: string | null; nome: string; nomeCorreto: string | null; participantes: { cpf: string | null; nome: string }[] } | null,
  cpfDigitado: string,
): PessoaDaUnidade | null {
  const cpf = soDigitos(cpfDigitado);
  if (cpf.length !== 11) return null;
  if (unidade.procuradorCpf && soDigitos(unidade.procuradorCpf) === cpf) {
    return { nome: unidade.procuradorNome ?? 'Procurador', cpf, papel: 'PROCURADOR' };
  }
  if (!lead) return null;
  if (soDigitos(lead.cpf) === cpf) return { nome: lead.nomeCorreto ?? lead.nome, cpf, papel: 'TITULAR' };
  const p = lead.participantes.find((x) => soDigitos(x.cpf) === cpf);
  return p ? { nome: p.nome, cpf, papel: 'PARTICIPANTE' } : null;
}

function data(v: unknown, campo: string): Date {
  const d = new Date(String(v ?? ''));
  if (isNaN(d.getTime())) throw new BadRequestException(`${campo}: data inválida.`);
  return d;
}

/**
 * Assembleia de Instalação do Condomínio (Pré-Ocupação). 1 voto por unidade.
 * Convocação pelo WhatsApp (`AssembleiaConvocacaoService`), credenciamento por CPF,
 * votação item a item (online pelo link ou presencial pela mesa) e apuração congelada
 * no fechamento de cada item.
 */
@Injectable()
export class AssembleiasService {
  private readonly logger = new Logger('PreOcupacaoAssembleiasService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly convocacao: AssembleiaConvocacaoService,
    private readonly worker: AssembleiaConvocacaoWorker,
  ) {}

  private async carregar(tenantId: string, id: string) {
    const a = await this.prisma.preOcupacaoAssembleia.findFirst({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Assembleia não encontrada.');
    return a;
  }

  /** Reunião não tem votação: só convocação, presença e pauta. */
  private exigirVotacao(a: { tipo: string }) {
    if (a.tipo === 'REUNIAO') throw new BadRequestException('Reunião não tem votação.');
  }

  async listar(tenantId: string) {
    const lista = await this.prisma.preOcupacaoAssembleia.findMany({
      where: { tenantId },
      orderBy: { dataPrimeiraConvocacao: 'desc' },
      include: { _count: { select: { itens: true, unidades: true } } },
    });
    const devs = await this.prisma.development.findMany({
      where: { id: { in: [...new Set(lista.map((a) => a.developmentId))] }, tenantId },
      select: { id: true, nome: true },
    });
    const nomeDev = new Map(devs.map((d) => [d.id, d.nome]));
    return lista.map(({ _count, ...a }) => ({
      ...a,
      empreendimento: nomeDev.get(a.developmentId) ?? null,
      totalItens: _count.itens,
      totalUnidades: _count.unidades,
    }));
  }

  /** Empreendimentos do tenant para escolher na criação. */
  async empreendimentos(tenantId: string) {
    return this.prisma.development.findMany({ where: { tenantId }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } });
  }

  async criar(tenantId: string, por: string, body: any) {
    const developmentId = String(body?.developmentId ?? '');
    const dev = await this.prisma.development.findFirst({ where: { id: developmentId, tenantId }, select: { id: true } });
    if (!dev) throw new BadRequestException('Escolha o empreendimento.');
    const titulo = String(body?.titulo ?? '').trim();
    if (!titulo) throw new BadRequestException('Informe o título.');
    const primeira = data(body?.dataPrimeiraConvocacao, '1ª convocação');
    const segunda = body?.dataSegundaConvocacao ? data(body.dataSegundaConvocacao, '2ª convocação') : new Date(primeira.getTime() + 30 * 60_000);
    if (segunda <= primeira) throw new BadRequestException('A 2ª convocação tem que ser depois da 1ª.');
    const a = await this.prisma.preOcupacaoAssembleia.create({
      data: {
        tenantId,
        developmentId,
        tipo: body?.tipo === 'REUNIAO' ? 'REUNIAO' : 'ASSEMBLEIA',
        titulo,
        edital: String(body?.edital ?? '').trim(),
        linkVideo: String(body?.linkVideo ?? '').trim() || null,
        dataPrimeiraConvocacao: primeira,
        dataSegundaConvocacao: segunda,
        criadoPor: por,
      },
    });
    await registrarEventoAssembleia(this.prisma, a.id, 'CRIADA', titulo, por);
    await this.sincronizarUnidades(tenantId, a.id);
    return a;
  }

  async detalhe(tenantId: string, id: string) {
    const a = await this.prisma.preOcupacaoAssembleia.findFirst({
      where: { id, tenantId },
      include: {
        itens: { orderBy: { ordem: 'asc' }, include: { _count: { select: { votos: true } } } },
        unidades: {
          orderBy: [{ torreNome: 'asc' }, { unidadeNome: 'asc' }],
          include: { _count: { select: { presencas: true } } },
        },
      },
    });
    if (!a) throw new NotFoundException('Assembleia não encontrada.');
    const dev = await this.prisma.development.findFirst({ where: { id: a.developmentId, tenantId }, select: { nome: true } });
    const leadIds = a.unidades.map((u) => u.leadId).filter((x): x is string => !!x);
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, tenantId },
      select: { id: true, nome: true, nomeCorreto: true, telefone: true, cpf: true },
    });
    const leadPor = new Map(leads.map((l) => [l.id, l]));
    return {
      ...a,
      empreendimento: dev?.nome ?? null,
      itens: a.itens.map(({ _count, ...i }) => ({ ...i, opcoes: opcoesDoItem(i.tipo, i.opcoes), totalVotos: _count.votos })),
      unidades: a.unidades.map(({ _count, tokenHash, ...u }) => {
        const l = u.leadId ? leadPor.get(u.leadId) : null;
        return {
          ...u,
          presente: _count.presencas > 0,
          morador: l ? l.nomeCorreto ?? l.nome : null,
          telefone: l?.telefone ?? null,
          temCpf: !!l?.cpf,
        };
      }),
    };
  }

  async atualizar(tenantId: string, id: string, body: any) {
    const a = await this.carregar(tenantId, id);
    if (a.status === 'ENCERRADA') throw new BadRequestException('Assembleia encerrada não pode ser alterada.');
    const d: Prisma.PreOcupacaoAssembleiaUpdateInput = {};
    if (body.titulo !== undefined) d.titulo = String(body.titulo).trim() || a.titulo;
    if (body.edital !== undefined) d.edital = String(body.edital);
    if (body.linkVideo !== undefined) d.linkVideo = String(body.linkVideo).trim() || null;
    if (body.presidenteNome !== undefined) d.presidenteNome = String(body.presidenteNome).trim() || null;
    if (body.secretarioNome !== undefined) d.secretarioNome = String(body.secretarioNome).trim() || null;
    if (body.dataPrimeiraConvocacao !== undefined || body.dataSegundaConvocacao !== undefined) {
      if (a.status === 'EM_ANDAMENTO') throw new BadRequestException('A assembleia já começou: não dá para mudar o horário.');
      const p = body.dataPrimeiraConvocacao !== undefined ? data(body.dataPrimeiraConvocacao, '1ª convocação') : a.dataPrimeiraConvocacao;
      const s = body.dataSegundaConvocacao !== undefined ? data(body.dataSegundaConvocacao, '2ª convocação') : a.dataSegundaConvocacao;
      if (s <= p) throw new BadRequestException('A 2ª convocação tem que ser depois da 1ª.');
      d.dataPrimeiraConvocacao = p;
      d.dataSegundaConvocacao = s;
    }
    return this.prisma.preOcupacaoAssembleia.update({ where: { id }, data: d });
  }

  async excluir(tenantId: string, id: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status !== 'RASCUNHO') throw new BadRequestException('Só dá para excluir assembleia em rascunho (antes da convocação).');
    await this.prisma.preOcupacaoAssembleia.delete({ where: { id } });
    return { ok: true };
  }

  /** Pauta inteira de uma vez. Só antes de qualquer item ser aberto. */
  async salvarItens(tenantId: string, id: string, itens: any[]) {
    const a = await this.carregar(tenantId, id);
    if (a.status === 'ENCERRADA') throw new BadRequestException('Assembleia encerrada.');
    const abertos = await this.prisma.preOcupacaoAssembleiaItem.count({ where: { assembleiaId: id, status: { not: 'PENDENTE' } } });
    if (abertos) throw new BadRequestException('A votação já começou: a pauta não pode mais ser alterada.');
    if (!Array.isArray(itens) || !itens.length) throw new BadRequestException('A pauta precisa de pelo menos um item.');
    const dados = itens.map((i, idx) => {
      const titulo = String(i?.titulo ?? '').trim();
      if (!titulo) throw new BadRequestException(`Item ${idx + 1}: informe o título.`);
      // Reunião: a pauta é só a lista de assuntos (tipo fica APROVACAO, nunca é aberto para voto)
      if (a.tipo === 'REUNIAO') {
        return { assembleiaId: id, ordem: idx + 1, titulo, descricao: String(i?.descricao ?? '').trim() || null, tipo: 'APROVACAO' as TipoItem, quorum: 'MAIORIA_PRESENTES' as Quorum, opcoes: [] as string[] };
      }
      const tipo = TIPOS.includes(i?.tipo) ? (i.tipo as TipoItem) : 'APROVACAO';
      const quorum = QUORUNS.includes(i?.quorum) ? (i.quorum as Quorum) : 'MAIORIA_PRESENTES';
      const opcoes = tipo === 'APROVACAO' ? [] : opcoesDoItem(tipo, i?.opcoes).filter((o) => o !== 'Abstenção');
      // Eleição pode ficar sem candidatos: eles costumam ser definidos na própria assembleia
      if (tipo === 'ESCOLHA' && opcoes.length < 2) throw new BadRequestException(`Item ${idx + 1}: informe pelo menos 2 opções.`);
      return { assembleiaId: id, ordem: idx + 1, titulo, descricao: String(i?.descricao ?? '').trim() || null, tipo, quorum, opcoes };
    });
    await this.prisma.$transaction([
      this.prisma.preOcupacaoAssembleiaItem.deleteMany({ where: { assembleiaId: id } }),
      this.prisma.preOcupacaoAssembleiaItem.createMany({ data: dados }),
    ]);
    return this.detalhe(tenantId, id);
  }

  /**
   * Carrega/atualiza as unidades do empreendimento (todas as ativas: quem não tem
   * morador também é condômino e entra no total). Unidade que já tem presença ou
   * voto nunca é apagada.
   */
  async sincronizarUnidades(tenantId: string, id: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status === 'EM_ANDAMENTO' || a.status === 'ENCERRADA') {
      throw new BadRequestException('A assembleia já começou: a lista de unidades está fechada.');
    }
    const units = await this.prisma.developmentUnit.findMany({
      where: { tenantId, developmentId: a.developmentId, ativo: true },
      select: { id: true, nome: true, leadId: true, tower: { select: { nome: true } } },
    });
    const leadIds = units.map((u) => u.leadId).filter((x): x is string => !!x);
    const [familias, leadsVivos] = await Promise.all([
      this.prisma.preOcupacaoFamilia.findMany({ where: { tenantId, leadId: { in: leadIds } }, select: { id: true, leadId: true } }),
      this.prisma.lead.findMany({ where: { tenantId, id: { in: leadIds }, deletedAt: null }, select: { id: true } }),
    ]);
    const vivos = new Set(leadsVivos.map((l) => l.id));
    const familiaPor = new Map(familias.map((f) => [f.leadId, f.id]));
    for (const u of units) {
      const leadId = u.leadId && vivos.has(u.leadId) ? u.leadId : null;
      await this.prisma.preOcupacaoAssembleiaUnidade.upsert({
        where: { assembleiaId_unitId: { assembleiaId: id, unitId: u.id } },
        create: {
          tenantId,
          assembleiaId: id,
          unitId: u.id,
          unidadeNome: u.nome,
          torreNome: u.tower?.nome ?? null,
          leadId,
          familiaId: leadId ? familiaPor.get(leadId) ?? null : null,
        },
        update: { unidadeNome: u.nome, torreNome: u.tower?.nome ?? null, leadId, familiaId: leadId ? familiaPor.get(leadId) ?? null : null },
      });
    }
    await this.prisma.preOcupacaoAssembleiaUnidade.deleteMany({
      where: { assembleiaId: id, unitId: { notIn: units.map((u) => u.id) }, presencas: { none: {} }, votos: { none: {} } },
    });
    return { total: units.length };
  }

  async definirProcurador(tenantId: string, id: string, unidadeId: string, body: any, por: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status === 'ENCERRADA') throw new BadRequestException('Assembleia encerrada.');
    const u = await this.prisma.preOcupacaoAssembleiaUnidade.findFirst({ where: { id: unidadeId, assembleiaId: id } });
    if (!u) throw new NotFoundException('Unidade não encontrada.');
    const nome = String(body?.nome ?? '').trim();
    const cpf = soDigitos(body?.cpf);
    if (!nome && !cpf) {
      await this.prisma.preOcupacaoAssembleiaUnidade.update({ where: { id: u.id }, data: { procuradorNome: null, procuradorCpf: null } });
      await registrarEventoAssembleia(this.prisma, id, 'PROCURADOR_REMOVIDO', null, por, u.id);
      return { ok: true };
    }
    if (!nome || cpf.length !== 11) throw new BadRequestException('Informe nome e CPF (11 números) do procurador.');
    await this.prisma.preOcupacaoAssembleiaUnidade.update({ where: { id: u.id }, data: { procuradorNome: nome, procuradorCpf: cpf } });
    await registrarEventoAssembleia(this.prisma, id, 'PROCURADOR_DEFINIDO', `${nome} (CPF final ${cpf.slice(-4)})`, por, u.id);
    return { ok: true };
  }

  /**
   * Convoca: põe na fila do WhatsApp as unidades com morador ainda não convocadas
   * (ou só as escolhidas). A pauta tem que existir — o edital informa a ordem do dia.
   */
  async convocar(tenantId: string, id: string, por: string, unidadeIds?: string[]) {
    const a = await this.carregar(tenantId, id);
    if (a.status === 'ENCERRADA') throw new BadRequestException('Assembleia encerrada.');
    if (!a.edital.trim()) throw new BadRequestException('Escreva o texto do edital antes de convocar.');
    const itens = await this.prisma.preOcupacaoAssembleiaItem.count({ where: { assembleiaId: id } });
    if (!itens) throw new BadRequestException('Monte a pauta antes de convocar.');
    const where: Prisma.PreOcupacaoAssembleiaUnidadeWhereInput = { assembleiaId: id, leadId: { not: null } };
    if (unidadeIds?.length) {
      where.id = { in: unidadeIds };
      where.statusEnvio = { not: 'PENDENTE' };
    } else {
      where.statusEnvio = null;
    }
    const r = await this.prisma.preOcupacaoAssembleiaUnidade.updateMany({ where, data: { statusEnvio: 'PENDENTE' } });
    if (a.status === 'RASCUNHO') {
      await this.prisma.preOcupacaoAssembleia.update({ where: { id }, data: { status: 'CONVOCADA' } });
    }
    await registrarEventoAssembleia(this.prisma, id, 'CONVOCACAO_INICIADA', `${r.count} unidade(s) na fila`, por);
    await this.worker.enfileirar();
    return { enfileiradas: r.count };
  }

  async reenviar(tenantId: string, id: string, unidadeId: string, por: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status === 'RASCUNHO' || a.status === 'ENCERRADA') throw new BadRequestException('Só dá para reenviar com a assembleia convocada.');
    const u = await this.prisma.preOcupacaoAssembleiaUnidade.findFirst({ where: { id: unidadeId, assembleiaId: id }, select: { id: true } });
    if (!u) throw new NotFoundException('Unidade não encontrada.');
    return this.convocacao.enviarUm(u.id, por);
  }

  async pausarConvocacao(tenantId: string, id: string, pausar: boolean, por: string) {
    await this.carregar(tenantId, id);
    await this.prisma.preOcupacaoAssembleia.update({
      where: { id },
      data: pausar ? { envioPausadoEm: new Date(), envioPausaMotivo: `Pausado por ${por}` } : { envioPausadoEm: null, envioPausaMotivo: null },
    });
    await registrarEventoAssembleia(this.prisma, id, pausar ? 'CONVOCACAO_PAUSADA' : 'CONVOCACAO_RETOMADA', null, por);
    if (!pausar) await this.worker.enfileirar();
    return { ok: true };
  }

  async iniciar(tenantId: string, id: string, por: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status !== 'CONVOCADA') throw new BadRequestException('Só uma assembleia convocada pode ser iniciada.');
    const mesa = await this.mesa(tenantId, id);
    await this.prisma.preOcupacaoAssembleia.update({ where: { id }, data: { status: 'EM_ANDAMENTO', iniciadaEm: new Date() } });
    await registrarEventoAssembleia(
      this.prisma,
      id,
      'INICIADA',
      a.tipo === 'REUNIAO'
        ? `${mesa.presentes} de ${mesa.totalUnidades} unidades presentes`
        : `${mesa.presentes} de ${mesa.totalUnidades} unidades presentes · ${mesa.instalacao.emSegunda ? '2ª' : '1ª'} convocação`,
      por,
    );
    return { ok: true };
  }

  async abrirItem(tenantId: string, id: string, itemId: string, por: string) {
    const a = await this.carregar(tenantId, id);
    this.exigirVotacao(a);
    if (a.status !== 'EM_ANDAMENTO') throw new BadRequestException('Inicie a assembleia antes de abrir a votação.');
    const aberto = await this.prisma.preOcupacaoAssembleiaItem.findFirst({ where: { assembleiaId: id, status: 'ABERTO' }, select: { titulo: true } });
    if (aberto) throw new BadRequestException(`Feche a votação de "${aberto.titulo}" antes de abrir outra.`);
    const item = await this.prisma.preOcupacaoAssembleiaItem.findFirst({ where: { id: itemId, assembleiaId: id } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.status !== 'PENDENTE') throw new BadRequestException('Este item já foi votado.');
    if (item.tipo !== 'APROVACAO' && opcoesDoItem(item.tipo, item.opcoes).length < 3) {
      throw new BadRequestException('Informe pelo menos 2 candidatos/opções antes de abrir a votação.');
    }
    await this.prisma.preOcupacaoAssembleiaItem.update({ where: { id: itemId }, data: { status: 'ABERTO', abertoEm: new Date() } });
    await registrarEventoAssembleia(this.prisma, id, 'VOTACAO_ABERTA', `${item.ordem}. ${item.titulo}`, por);
    return { ok: true };
  }

  /** Candidatos/opções de um item ainda não votado — pode ser durante a assembleia. */
  async definirOpcoes(tenantId: string, id: string, itemId: string, opcoes: unknown, por: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status === 'ENCERRADA') throw new BadRequestException('Assembleia encerrada.');
    this.exigirVotacao(a);
    const item = await this.prisma.preOcupacaoAssembleiaItem.findFirst({ where: { id: itemId, assembleiaId: id } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.tipo === 'APROVACAO') throw new BadRequestException('Item de aprovação tem opções fixas.');
    if (item.status !== 'PENDENTE') throw new BadRequestException('A votação deste item já foi aberta.');
    const lista = opcoesDoItem(item.tipo, opcoes).filter((o) => o !== 'Abstenção');
    await this.prisma.preOcupacaoAssembleiaItem.update({ where: { id: itemId }, data: { opcoes: lista } });
    await registrarEventoAssembleia(this.prisma, id, 'OPCOES_DEFINIDAS', `${item.ordem}. ${item.titulo}: ${lista.join(', ')}`, por);
    return { opcoes: lista };
  }

  /** Fecha a votação e congela a apuração (não muda mais). */
  async fecharItem(tenantId: string, id: string, itemId: string, por: string) {
    await this.carregar(tenantId, id);
    const item = await this.prisma.preOcupacaoAssembleiaItem.findFirst({
      where: { id: itemId, assembleiaId: id },
      include: { votos: { select: { opcao: true } } },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.status !== 'ABERTO') throw new BadRequestException('Esta votação não está aberta.');
    const [totalUnidades, presentes] = await Promise.all([
      this.prisma.preOcupacaoAssembleiaUnidade.count({ where: { assembleiaId: id } }),
      this.contarPresentes(id),
    ]);
    const resultado = apurarItem(
      { tipo: item.tipo, quorum: item.quorum, opcoes: opcoesDoItem(item.tipo, item.opcoes) },
      item.votos.map((v) => v.opcao),
      totalUnidades,
      presentes,
    );
    // Guarda contra fechamento duplo (dois cliques / duas telas)
    const r = await this.prisma.preOcupacaoAssembleiaItem.updateMany({
      where: { id: itemId, status: 'ABERTO' },
      data: { status: 'FECHADO', fechadoEm: new Date(), resultado: resultado as unknown as Prisma.InputJsonValue },
    });
    if (!r.count) throw new ConflictException('Esta votação já foi fechada.');
    await registrarEventoAssembleia(this.prisma, id, 'VOTACAO_FECHADA', `${item.ordem}. ${item.titulo}: ${resultado.resumo}`, por);
    return resultado;
  }

  async encerrar(tenantId: string, id: string, por: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status !== 'EM_ANDAMENTO') throw new BadRequestException('Só uma assembleia em andamento pode ser encerrada.');
    const aberto = await this.prisma.preOcupacaoAssembleiaItem.count({ where: { assembleiaId: id, status: 'ABERTO' } });
    if (aberto) throw new BadRequestException('Feche a votação aberta antes de encerrar.');
    await this.prisma.preOcupacaoAssembleia.update({ where: { id }, data: { status: 'ENCERRADA', encerradaEm: new Date() } });
    await registrarEventoAssembleia(this.prisma, id, 'ENCERRADA', null, por);
    return { ok: true };
  }

  private async contarPresentes(assembleiaId: string) {
    const g = await this.prisma.preOcupacaoAssembleiaPresenca.groupBy({ by: ['unidadeId'], where: { assembleiaId } });
    return g.length;
  }

  /** Painel ao vivo da mesa: presença, quórum de instalação e a votação aberta. */
  async mesa(tenantId: string, id: string) {
    const a = await this.carregar(tenantId, id);
    const [totalUnidades, presencas, itemAberto, convocadas, entregues] = await Promise.all([
      this.prisma.preOcupacaoAssembleiaUnidade.count({ where: { assembleiaId: id } }),
      this.prisma.preOcupacaoAssembleiaPresenca.findMany({
        where: { assembleiaId: id },
        orderBy: { entrouEm: 'asc' },
        select: { unidadeId: true, nome: true, papel: true, origem: true, entrouEm: true },
      }),
      this.prisma.preOcupacaoAssembleiaItem.findFirst({
        where: { assembleiaId: id, status: 'ABERTO' },
        include: { votos: { select: { opcao: true, unidadeId: true } } },
      }),
      this.prisma.preOcupacaoAssembleiaUnidade.count({ where: { assembleiaId: id, statusEnvio: 'ENVIADO' } }),
      this.prisma.preOcupacaoAssembleiaUnidade.count({ where: { assembleiaId: id, entregueEm: { not: null } } }),
    ]);
    const presentesSet = new Set(presencas.map((p) => p.unidadeId));
    const presentes = presentesSet.size;
    const parcial = itemAberto
      ? apurarItem(
          { tipo: itemAberto.tipo, quorum: itemAberto.quorum, opcoes: opcoesDoItem(itemAberto.tipo, itemAberto.opcoes) },
          itemAberto.votos.map((v) => v.opcao),
          totalUnidades,
          presentes,
        )
      : null;
    const votaram = new Set(itemAberto?.votos.map((v) => v.unidadeId) ?? []);
    return {
      tipo: a.tipo,
      status: a.status,
      totalUnidades,
      presentes,
      online: new Set(presencas.filter((p) => p.origem === 'ONLINE').map((p) => p.unidadeId)).size,
      presencial: new Set(presencas.filter((p) => p.origem === 'PRESENCIAL').map((p) => p.unidadeId)).size,
      convocadas,
      entregues,
      instalacao: quorumInstalacao(totalUnidades, presentes, new Date(), a.dataSegundaConvocacao),
      itemAberto: itemAberto
        ? {
            id: itemAberto.id,
            ordem: itemAberto.ordem,
            titulo: itemAberto.titulo,
            tipo: itemAberto.tipo,
            opcoes: opcoesDoItem(itemAberto.tipo, itemAberto.opcoes),
            abertoEm: itemAberto.abertoEm,
            parcial,
            faltamVotar: [...presentesSet].filter((u) => !votaram.has(u)).length,
          }
        : null,
      unidadesPresentes: [...presentesSet],
      unidadesQueVotaram: [...votaram],
    };
  }

  /** Lead da unidade com CPF dos participantes — para conferir quem vota. */
  async leadParaConferencia(tenantId: string, leadId: string | null) {
    if (!leadId) return null;
    return this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: { cpf: true, nome: true, nomeCorreto: true, participantes: { select: { cpf: true, nome: true } } },
    });
  }

  /** Credencia uma pessoa da unidade (online ou presencial). Repetir o CPF não duplica a presença. */
  async credenciar(
    unidade: { id: string; tenantId: string; assembleiaId: string; leadId: string | null; procuradorNome: string | null; procuradorCpf: string | null },
    cpf: string,
    origem: 'ONLINE' | 'PRESENCIAL',
    extra: { por?: string | null; ip?: string | null; userAgent?: string | null } = {},
  ): Promise<PessoaDaUnidade | null> {
    const lead = await this.leadParaConferencia(unidade.tenantId, unidade.leadId);
    const pessoa = pessoaDaUnidade(unidade, lead, cpf);
    if (!pessoa) return null;
    const ja = await this.prisma.preOcupacaoAssembleiaPresenca.findFirst({ where: { unidadeId: unidade.id, cpf: pessoa.cpf, origem } });
    if (!ja) {
      await this.prisma.preOcupacaoAssembleiaPresenca.create({
        data: {
          assembleiaId: unidade.assembleiaId,
          unidadeId: unidade.id,
          nome: pessoa.nome,
          cpf: pessoa.cpf,
          papel: pessoa.papel,
          origem,
          registradoPor: extra.por ?? null,
          ip: extra.ip?.slice(0, 100) ?? null,
          userAgent: extra.userAgent?.slice(0, 300) ?? null,
        },
      });
      await registrarEventoAssembleia(
        this.prisma,
        unidade.assembleiaId,
        'CREDENCIADO',
        `${pessoa.nome} (${pessoa.papel.toLowerCase()}, ${origem.toLowerCase()})`,
        extra.por ?? null,
        unidade.id,
      );
    }
    return pessoa;
  }

  /** Grava o voto da unidade no item aberto. Uma vez gravado, não muda. */
  async votar(
    unidade: { id: string; assembleiaId: string },
    itemId: string,
    opcao: string,
    pessoa: { nome: string; cpf: string },
    origem: 'ONLINE' | 'PRESENCIAL',
    por?: string | null,
  ) {
    const item = await this.prisma.preOcupacaoAssembleiaItem.findFirst({ where: { id: itemId, assembleiaId: unidade.assembleiaId } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.status !== 'ABERTO') throw new BadRequestException('A votação deste item não está aberta.');
    if (!opcoesDoItem(item.tipo, item.opcoes).includes(opcao)) throw new BadRequestException('Opção inválida.');
    try {
      await this.prisma.preOcupacaoAssembleiaVoto.create({
        data: { itemId, unidadeId: unidade.id, opcao, nome: pessoa.nome, cpf: pessoa.cpf, origem, registradoPor: por ?? null },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Esta unidade já votou neste item.');
      throw e;
    }
    // O log não guarda a opção escolhida — só o mapa de votos (anexo) mostra
    await registrarEventoAssembleia(this.prisma, unidade.assembleiaId, 'VOTOU', `${item.ordem}. ${item.titulo} · ${pessoa.nome} (${origem.toLowerCase()})`, por ?? null, unidade.id);
    return { ok: true };
  }

  async credenciarPresencial(tenantId: string, id: string, unidadeId: string, cpf: string, por: string) {
    const a = await this.carregar(tenantId, id);
    if (a.status !== 'CONVOCADA' && a.status !== 'EM_ANDAMENTO') throw new BadRequestException('Credenciamento só com a assembleia convocada ou em andamento.');
    const u = await this.prisma.preOcupacaoAssembleiaUnidade.findFirst({ where: { id: unidadeId, assembleiaId: id } });
    if (!u) throw new NotFoundException('Unidade não encontrada.');
    const pessoa = await this.credenciar(u, cpf, 'PRESENCIAL', { por });
    if (!pessoa) throw new BadRequestException('Este CPF não está no cadastro desta unidade (titular, participante ou procurador).');
    return pessoa;
  }

  async votarPresencial(tenantId: string, id: string, body: any, por: string) {
    this.exigirVotacao(await this.carregar(tenantId, id));
    const u = await this.prisma.preOcupacaoAssembleiaUnidade.findFirst({ where: { id: String(body?.unidadeId ?? ''), assembleiaId: id } });
    if (!u) throw new NotFoundException('Unidade não encontrada.');
    const presenca = await this.prisma.preOcupacaoAssembleiaPresenca.findFirst({
      where: { unidadeId: u.id, origem: 'PRESENCIAL' },
      orderBy: { entrouEm: 'desc' },
    });
    if (!presenca) throw new BadRequestException('Credencie a unidade (CPF) na mesa antes de registrar o voto.');
    return this.votar(u, String(body?.itemId ?? ''), String(body?.opcao ?? ''), presenca, 'PRESENCIAL', por);
  }

  /**
   * Dados dos anexos da ata (a tela monta a planilha): lista de presença, mapa de
   * votos por unidade, prova de convocação e o log completo. CPF sai mascarado.
   */
  async relatorio(tenantId: string, id: string) {
    const det = await this.detalhe(tenantId, id);
    const [presencas, votos, eventos] = await Promise.all([
      this.prisma.preOcupacaoAssembleiaPresenca.findMany({ where: { assembleiaId: id }, orderBy: { entrouEm: 'asc' } }),
      this.prisma.preOcupacaoAssembleiaVoto.findMany({ where: { item: { assembleiaId: id } }, orderBy: { em: 'asc' } }),
      this.prisma.preOcupacaoAssembleiaEvento.findMany({ where: { assembleiaId: id }, orderBy: { em: 'asc' } }),
    ]);
    const mascara = (cpf: string) => (cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : '');
    const nomeUnidade = new Map(det.unidades.map((u) => [u.id, [u.torreNome, u.unidadeNome].filter(Boolean).join(' · ')]));
    return {
      assembleia: { ...det, unidades: undefined },
      unidades: det.unidades.map((u) => ({
        unidade: nomeUnidade.get(u.id),
        morador: u.morador,
        convocacao: u.statusEnvio ?? (u.leadId ? 'NAO_CONVOCADA' : 'SEM_MORADOR'),
        enviadoEm: u.enviadoEm,
        entregueEm: u.entregueEm,
        linkAbertoEm: u.linkAbertoEm,
        erro: u.ultimoEnvioErro,
        presente: u.presente,
      })),
      presencas: presencas.map((p) => ({
        unidade: nomeUnidade.get(p.unidadeId),
        nome: p.nome,
        cpf: mascara(p.cpf),
        papel: p.papel,
        origem: p.origem,
        entrouEm: p.entrouEm,
      })),
      votos: votos.map((v) => ({
        item: det.itens.find((i) => i.id === v.itemId)?.ordem,
        unidade: nomeUnidade.get(v.unidadeId),
        nome: v.nome,
        cpf: mascara(v.cpf),
        opcao: v.opcao,
        origem: v.origem,
        em: v.em,
      })),
      eventos: eventos.map((e) => ({ em: e.em, tipo: e.tipo, unidade: e.unidadeId ? nomeUnidade.get(e.unidadeId) : null, detalhe: e.detalhe, por: e.por })),
    };
  }
}
