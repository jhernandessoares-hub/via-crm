import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { FinCategoryType, FinContactBankAccountType, FinContactType, FinPixKeyType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Logger } from '../logger';
import { assertPositiveMoney, finSerialize, parseDateOnly, roundMoney, sumMoney } from './fin-shared.util';

const logger = new Logger('FinCadastros');

// Plano de contas padrão da holding (sistema: true — renomeável, não deletável)
const SEED_CATEGORIES: Record<FinCategoryType, Record<string, string[]>> = {
  RECEITA: {
    'Receitas VIA CRM': ['Mensalidades', 'Setup / Implantação', 'Add-ons'],
    'Receitas de Serviços': ['Correspondente bancário', 'Consultoria', 'Outros CNPJs prestadores'],
    'Receitas Financeiras': ['Rendimentos', 'Outras receitas'],
    'Movimentação entre contas': ['Transferência recebida'],
    'Movimentação entre empresas do grupo': ['Repasse recebido de outra empresa do grupo'],
  },
  DESPESA: {
    Infraestrutura: ['Servidores / Cloud', 'APIs de IA', 'WhatsApp / Meta', 'Domínios / SaaS'],
    Pessoal: ['Pró-labore', 'Salários', 'Encargos', 'Benefícios'],
    Administrativas: ['Contabilidade', 'Jurídico', 'Aluguel', 'Escritório'],
    'Comercial / Marketing': ['Anúncios', 'Comissões', 'Eventos'],
    Impostos: ['Simples / DAS', 'ISS', 'Outros impostos'],
    Financeiras: ['Tarifas bancárias', 'Juros / Multas'],
    'Movimentação entre contas': ['Transferência enviada'],
    'Movimentação entre empresas do grupo': ['Repasse enviado para outra empresa do grupo'],
  },
};

// Nomes fixos usados pela transferência entre contas (ver transferirEntreContas) —
// identificam as categorias de sistema criadas pelo seed acima, sem hardcodar IDs.
// "entre contas" = mesma empresa (neutro, não é receita/despesa real).
// "entre empresas" = CNPJs diferentes do mesmo grupo — mesmo mecanismo, mas fica
// separado no plano de contas porque é um repasse entre pessoas jurídicas distintas
// (pode exigir formalização como mútuo entre empresas — revisar com o contador).
const TRANSFER_GRUPO_NOME = 'Movimentação entre contas';
const TRANSFER_CATEGORIA_SAIDA_NOME = 'Transferência enviada';
const TRANSFER_CATEGORIA_ENTRADA_NOME = 'Transferência recebida';
const REPASSE_GRUPO_NOME = 'Movimentação entre empresas do grupo';
const REPASSE_CATEGORIA_SAIDA_NOME = 'Repasse enviado para outra empresa do grupo';
const REPASSE_CATEGORIA_ENTRADA_NOME = 'Repasse recebido de outra empresa do grupo';

@Injectable()
export class FinCadastrosService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedCategorias();
    } catch (err: any) {
      logger.error(`Seed de categorias financeiras falhou: ${err?.message}`);
    }
  }

  // Idempotente: findFirst+create (o unique [tipo,parentId,nome] não cobre
  // parentId NULL no Postgres, então upsert não serve para os grupos).
  async seedCategorias() {
    for (const tipo of Object.keys(SEED_CATEGORIES) as FinCategoryType[]) {
      let ordem = 0;
      for (const [grupoNome, filhas] of Object.entries(SEED_CATEGORIES[tipo])) {
        let grupo = await this.prisma.finCategory.findFirst({
          where: { tipo, parentId: null, nome: grupoNome },
        });
        if (!grupo) {
          grupo = await this.prisma.finCategory.create({
            data: { tipo, nome: grupoNome, sistema: true, ordem },
          });
          logger.log(`Seed: grupo ${tipo}/${grupoNome} criado`);
        }
        let subOrdem = 0;
        for (const filhaNome of filhas) {
          const exists = await this.prisma.finCategory.findFirst({
            where: { tipo, parentId: grupo.id, nome: filhaNome },
          });
          if (!exists) {
            await this.prisma.finCategory.create({
              data: { tipo, nome: filhaNome, parentId: grupo.id, sistema: true, ordem: subOrdem },
            });
          }
          subOrdem++;
        }
        ordem++;
      }
    }
  }

  // ---------- Categorias ----------

  async listCategorias(incluirInativas = false) {
    const where = incluirInativas ? {} : { ativo: true };
    const grupos = await this.prisma.finCategory.findMany({
      where: { ...where, parentId: null },
      orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { nome: 'asc' }],
      include: {
        children: {
          where,
          orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
        },
      },
    });
    return finSerialize(grupos);
  }

  async createCategoria(data: { nome: string; tipo: FinCategoryType; parentId?: string; ordem?: number }) {
    const nome = (data.nome || '').trim();
    if (!nome) throw new BadRequestException('Nome da categoria é obrigatório');
    if (data.parentId) {
      const parent = await this.prisma.finCategory.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new NotFoundException('Grupo pai não encontrado');
      if (parent.parentId) throw new BadRequestException('Só há 2 níveis: o pai precisa ser um grupo');
      if (parent.tipo !== data.tipo) throw new BadRequestException('Categoria e grupo precisam ter o mesmo tipo');
    }
    const dup = await this.prisma.finCategory.findFirst({
      where: { tipo: data.tipo, parentId: data.parentId ?? null, nome },
    });
    if (dup) throw new BadRequestException('Já existe categoria com esse nome nesse nível');
    const created = await this.prisma.finCategory.create({
      data: { nome, tipo: data.tipo, parentId: data.parentId ?? null, ordem: data.ordem ?? 0 },
    });
    return finSerialize(created);
  }

  async updateCategoria(id: string, data: { nome?: string; ordem?: number; ativo?: boolean }) {
    const cat = await this.prisma.finCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Categoria não encontrada');
    const nome = data.nome !== undefined ? data.nome.trim() : undefined;
    if (nome !== undefined && !nome) throw new BadRequestException('Nome da categoria é obrigatório');
    const updated = await this.prisma.finCategory.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome } : {}),
        ...(data.ordem !== undefined ? { ordem: data.ordem } : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
      },
    });
    return finSerialize(updated);
  }

  /** Delete real só sem uso e sistema:false; com uso → desativa. */
  async deleteCategoria(id: string) {
    const cat = await this.prisma.finCategory.findUnique({
      where: { id },
      include: { _count: { select: { entries: true, recurringRules: true, children: true } } },
    });
    if (!cat) throw new NotFoundException('Categoria não encontrada');
    if (cat.sistema) throw new BadRequestException('Categoria do sistema não pode ser excluída — apenas renomeada');
    const emUso = cat._count.entries > 0 || cat._count.recurringRules > 0 || cat._count.children > 0;
    if (emUso) {
      await this.prisma.finCategory.update({ where: { id }, data: { ativo: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.finCategory.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  /** Valida que a categoria existe, está ativa e é analítica (nível 2) do tipo compatível. */
  async assertCategoriaAnalitica(categoriaId: string, tipoEsperado: FinCategoryType) {
    const cat = await this.prisma.finCategory.findUnique({ where: { id: categoriaId } });
    if (!cat || !cat.ativo) throw new BadRequestException('Categoria inválida ou inativa');
    if (!cat.parentId) throw new BadRequestException('Use uma categoria analítica (nível 2), não um grupo');
    if (cat.tipo !== tipoEsperado) {
      throw new BadRequestException(
        `Categoria de ${cat.tipo === 'RECEITA' ? 'receita' : 'despesa'} não combina com o tipo do lançamento`,
      );
    }
    return cat;
  }

  // ---------- Contas bancárias ----------

  async listContasBancarias(incluirInativas = false) {
    const contas = await this.prisma.finBankAccount.findMany({
      where: incluirInativas ? {} : { ativo: true },
      orderBy: { nome: 'asc' },
    });
    // Saldo atual = saldoInicial + recebimentos − pagamentos (baixas da conta)
    const result: any[] = [];
    for (const conta of contas) {
      const payments = await this.prisma.finPayment.findMany({
        where: { bankAccountId: conta.id },
        select: { valor: true, entry: { select: { tipo: true } } },
      });
      const movimento = payments.reduce(
        (acc, p) => acc + (p.entry.tipo === 'RECEBER' ? p.valor.toNumber() : -p.valor.toNumber()),
        0,
      );
      result.push({
        ...finSerialize(conta),
        saldoAtual: roundMoney(conta.saldoInicial.toNumber() + movimento),
      });
    }
    return result;
  }

  async createContaBancaria(data: {
    nome: string;
    banco?: string;
    agencia?: string;
    conta?: string;
    saldoInicial?: number;
    saldoInicialData: string;
    companyId?: string;
  }) {
    const nome = (data.nome || '').trim();
    if (!nome) throw new BadRequestException('Nome da conta é obrigatório');
    const created = await this.prisma.finBankAccount.create({
      data: {
        nome,
        banco: data.banco?.trim() || null,
        agencia: data.agencia?.trim() || null,
        conta: data.conta?.trim() || null,
        saldoInicial: roundMoney(Number(data.saldoInicial ?? 0) || 0),
        saldoInicialData: parseDateOnly(data.saldoInicialData, 'saldoInicialData'),
        companyId: data.companyId || null,
      },
    });
    return finSerialize(created);
  }

  async updateContaBancaria(
    id: string,
    data: {
      nome?: string;
      banco?: string;
      agencia?: string;
      conta?: string;
      saldoInicial?: number;
      saldoInicialData?: string;
      ativo?: boolean;
      companyId?: string | null;
    },
  ) {
    const conta = await this.prisma.finBankAccount.findUnique({ where: { id } });
    if (!conta) throw new NotFoundException('Conta bancária não encontrada');
    const updated = await this.prisma.finBankAccount.update({
      where: { id },
      data: {
        ...(data.nome !== undefined ? { nome: data.nome.trim() } : {}),
        ...(data.banco !== undefined ? { banco: data.banco.trim() || null } : {}),
        ...(data.agencia !== undefined ? { agencia: data.agencia.trim() || null } : {}),
        ...(data.conta !== undefined ? { conta: data.conta.trim() || null } : {}),
        ...(data.saldoInicial !== undefined ? { saldoInicial: roundMoney(Number(data.saldoInicial) || 0) } : {}),
        ...(data.saldoInicialData !== undefined
          ? { saldoInicialData: parseDateOnly(data.saldoInicialData, 'saldoInicialData') }
          : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
        ...(data.companyId !== undefined ? { companyId: data.companyId || null } : {}),
      },
    });
    return finSerialize(updated);
  }

  async deleteContaBancaria(id: string) {
    const conta = await this.prisma.finBankAccount.findUnique({
      where: { id },
      include: { _count: { select: { payments: true, transactions: true, imports: true } } },
    });
    if (!conta) throw new NotFoundException('Conta bancária não encontrada');
    const emUso = conta._count.payments > 0 || conta._count.transactions > 0 || conta._count.imports > 0;
    if (emUso) {
      await this.prisma.finBankAccount.update({ where: { id }, data: { ativo: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.finBankAccount.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  // ---------- Transferência entre contas ----------

  /** Categorias de sistema (seed) usadas para registrar as 2 pontas do movimento. */
  private async transferCategorias(grupoNome: string, categoriaSaidaNome: string, categoriaEntradaNome: string) {
    const grupoSaida = await this.prisma.finCategory.findFirst({
      where: { tipo: 'DESPESA', parentId: null, nome: grupoNome },
    });
    const grupoEntrada = await this.prisma.finCategory.findFirst({
      where: { tipo: 'RECEITA', parentId: null, nome: grupoNome },
    });
    const saida =
      grupoSaida &&
      (await this.prisma.finCategory.findFirst({
        where: { tipo: 'DESPESA', parentId: grupoSaida.id, nome: categoriaSaidaNome },
      }));
    const entrada =
      grupoEntrada &&
      (await this.prisma.finCategory.findFirst({
        where: { tipo: 'RECEITA', parentId: grupoEntrada.id, nome: categoriaEntradaNome },
      }));
    if (!saida || !entrada) {
      throw new BadRequestException('Categorias de movimentação não encontradas — reinicie a API para rodar o seed');
    }
    return { saida, entrada };
  }

  /**
   * Move dinheiro entre 2 contas: cria um título PAGAR (já pago) na origem e um título RECEBER
   * (já recebido) no destino, ambos com o mesmo transferGroupId — usa o mesmo mecanismo de
   * FinEntry+FinPayment para os saldos baterem (ver saldoAtual em listContasBancarias).
   * Mesma empresa (CNPJ) → categoria "Movimentação entre contas" (neutro, não é receita/despesa real).
   * Empresas diferentes do grupo → categoria "Movimentação entre empresas do grupo" (repasse — pode
   * exigir formalização como mútuo entre empresas; fica separado no plano de contas de propósito).
   */
  async transferirEntreContas(
    data: { contaOrigemId: string; contaDestinoId: string; valor: number; data: string; descricao?: string; observacao?: string },
    adminId?: string,
  ) {
    if (data.contaOrigemId === data.contaDestinoId) {
      throw new BadRequestException('Conta de origem e destino não podem ser a mesma');
    }
    const [origem, destino] = await Promise.all([
      this.prisma.finBankAccount.findUnique({ where: { id: data.contaOrigemId } }),
      this.prisma.finBankAccount.findUnique({ where: { id: data.contaDestinoId } }),
    ]);
    if (!origem || !origem.ativo) throw new BadRequestException('Conta de origem inválida ou inativa');
    if (!destino || !destino.ativo) throw new BadRequestException('Conta de destino inválida ou inativa');
    const mesmaEmpresa = !origem.companyId || !destino.companyId || origem.companyId === destino.companyId;

    const valor = assertPositiveMoney(data.valor, 'valor');
    const dataMov = parseDateOnly(data.data, 'data');
    const competencia = new Date(Date.UTC(dataMov.getUTCFullYear(), dataMov.getUTCMonth(), 1));
    const { saida, entrada } = mesmaEmpresa
      ? await this.transferCategorias(TRANSFER_GRUPO_NOME, TRANSFER_CATEGORIA_SAIDA_NOME, TRANSFER_CATEGORIA_ENTRADA_NOME)
      : await this.transferCategorias(REPASSE_GRUPO_NOME, REPASSE_CATEGORIA_SAIDA_NOME, REPASSE_CATEGORIA_ENTRADA_NOME);
    const groupId = randomUUID();
    const descricaoBase = data.descricao?.trim();

    const [entrySaida, entryEntrada] = await this.prisma.$transaction(async (tx) => {
      const eSaida = await tx.finEntry.create({
        data: {
          tipo: 'PAGAR',
          descricao: descricaoBase || `Transferência para ${destino.nome}`,
          categoriaId: saida.id,
          companyId: origem.companyId,
          competencia,
          vencimento: dataMov,
          valor,
          status: 'PAGO',
          observacao: data.observacao?.trim() || null,
          transferGroupId: groupId,
          createdBy: adminId || null,
        },
      });
      await tx.finPayment.create({
        data: { entryId: eSaida.id, bankAccountId: origem.id, dataPagamento: dataMov, valor, createdBy: adminId || null },
      });

      const eEntrada = await tx.finEntry.create({
        data: {
          tipo: 'RECEBER',
          descricao: descricaoBase || `Transferência de ${origem.nome}`,
          categoriaId: entrada.id,
          companyId: destino.companyId,
          competencia,
          vencimento: dataMov,
          valor,
          status: 'PAGO',
          observacao: data.observacao?.trim() || null,
          transferGroupId: groupId,
          createdBy: adminId || null,
        },
      });
      await tx.finPayment.create({
        data: { entryId: eEntrada.id, bankAccountId: destino.id, dataPagamento: dataMov, valor, createdBy: adminId || null },
      });

      return [eSaida, eEntrada];
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_TRANSFER',
      resourceType: 'FinEntry',
      resourceId: groupId,
      metadata: { contaOrigemId: origem.id, contaDestinoId: destino.id, valor, data: data.data, mesmaEmpresa },
    });

    return { transferGroupId: groupId, mesmaEmpresa, saida: finSerialize(entrySaida), entrada: finSerialize(entryEntrada) };
  }

  /** Desfaz a transferência: cancela as 2 pontas (só permitido enquanto nenhuma baixa foi conciliada/alterada). */
  async estornarTransferencia(transferGroupId: string, adminId?: string) {
    const entries = await this.prisma.finEntry.findMany({
      where: { transferGroupId },
      include: { payments: true },
    });
    if (entries.length === 0) throw new NotFoundException('Transferência não encontrada');
    if (entries.some((e) => e.status === 'CANCELADO')) {
      throw new BadRequestException('Transferência já foi estornada');
    }
    if (entries.some((e) => e.payments.some((p) => p.bankTransactionId))) {
      throw new BadRequestException(
        'Uma das pontas já foi conciliada com o extrato — desfaça a conciliação antes de estornar a transferência',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const e of entries) {
        await tx.finPayment.deleteMany({ where: { entryId: e.id } });
        await tx.finEntry.update({ where: { id: e.id }, data: { status: 'CANCELADO' } });
      }
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_TRANSFER_REVERSAL',
      resourceType: 'FinEntry',
      resourceId: transferGroupId,
      metadata: { entryIds: entries.map((e) => e.id) },
    });

    return { estornado: true };
  }

  async listTransferencias(bankAccountId?: string) {
    const entries = await this.prisma.finEntry.findMany({
      where: {
        transferGroupId: { not: null },
        ...(bankAccountId ? { payments: { some: { bankAccountId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { payments: { select: { bankAccountId: true, valor: true, dataPagamento: true } } },
    });
    const groups = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = e.transferGroupId!;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    const contaIds = [...new Set(entries.flatMap((e) => e.payments.map((p) => p.bankAccountId)))];
    const contas = contaIds.length
      ? await this.prisma.finBankAccount.findMany({ where: { id: { in: contaIds } }, select: { id: true, nome: true, banco: true } })
      : [];
    const contaNome = new Map(contas.map((c) => [c.id, c]));

    const result = [...groups.entries()].map(([transferGroupId, pair]) => {
      const saida = pair.find((e) => e.tipo === 'PAGAR');
      const entrada = pair.find((e) => e.tipo === 'RECEBER');
      const contaOrigem = saida?.payments[0] ? contaNome.get(saida.payments[0].bankAccountId) : null;
      const contaDestino = entrada?.payments[0] ? contaNome.get(entrada.payments[0].bankAccountId) : null;
      return finSerialize({
        transferGroupId,
        data: saida?.vencimento ?? entrada?.vencimento,
        valor: saida?.valor ?? entrada?.valor,
        descricao: saida?.descricao ?? entrada?.descricao,
        status: saida?.status ?? entrada?.status,
        contaOrigem,
        contaDestino,
      });
    });
    return result.sort((a, b) => (a.data < b.data ? 1 : -1));
  }

  // ---------- Contatos ----------

  async listContatos(incluirInativos = false) {
    const contatos = await this.prisma.finContact.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { entries: true, documents: true } } },
    });
    return finSerialize(contatos);
  }

  async createContato(data: {
    nome: string;
    documento?: string;
    tipo?: FinContactType;
    observacao?: string;
    chavePix?: string;
    tipoChavePix?: FinPixKeyType;
    banco?: string;
    agencia?: string;
    conta?: string;
    tipoConta?: FinContactBankAccountType;
  }) {
    const nome = (data.nome || '').trim();
    if (!nome) throw new BadRequestException('Nome do contato é obrigatório');
    const created = await this.prisma.finContact.create({
      data: {
        nome,
        documento: data.documento?.replace(/\D/g, '') || null,
        tipo: data.tipo ?? 'AMBOS',
        observacao: data.observacao?.trim() || null,
        chavePix: data.chavePix?.trim() || null,
        tipoChavePix: data.tipoChavePix ?? null,
        banco: data.banco?.trim() || null,
        agencia: data.agencia?.trim() || null,
        conta: data.conta?.trim() || null,
        tipoConta: data.tipoConta ?? null,
      },
    });
    return finSerialize(created);
  }

  async updateContato(
    id: string,
    data: {
      nome?: string;
      documento?: string;
      tipo?: FinContactType;
      observacao?: string;
      ativo?: boolean;
      chavePix?: string | null;
      tipoChavePix?: FinPixKeyType | null;
      banco?: string | null;
      agencia?: string | null;
      conta?: string | null;
      tipoConta?: FinContactBankAccountType | null;
    },
  ) {
    const contato = await this.prisma.finContact.findUnique({ where: { id } });
    if (!contato) throw new NotFoundException('Contato não encontrado');
    const updated = await this.prisma.finContact.update({
      where: { id },
      data: {
        ...(data.nome !== undefined ? { nome: data.nome.trim() } : {}),
        ...(data.documento !== undefined ? { documento: data.documento.replace(/\D/g, '') || null } : {}),
        ...(data.tipo !== undefined ? { tipo: data.tipo } : {}),
        ...(data.observacao !== undefined ? { observacao: data.observacao.trim() || null } : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
        ...(data.chavePix !== undefined ? { chavePix: data.chavePix?.trim() || null } : {}),
        ...(data.tipoChavePix !== undefined ? { tipoChavePix: data.tipoChavePix } : {}),
        ...(data.banco !== undefined ? { banco: data.banco?.trim() || null } : {}),
        ...(data.agencia !== undefined ? { agencia: data.agencia?.trim() || null } : {}),
        ...(data.conta !== undefined ? { conta: data.conta?.trim() || null } : {}),
        ...(data.tipoConta !== undefined ? { tipoConta: data.tipoConta } : {}),
      },
    });
    return finSerialize(updated);
  }

  async deleteContato(id: string) {
    const contato = await this.prisma.finContact.findUnique({
      where: { id },
      include: { _count: { select: { entries: true, recurringRules: true, documents: true } } },
    });
    if (!contato) throw new NotFoundException('Contato não encontrado');
    const emUso = contato._count.entries > 0 || contato._count.recurringRules > 0 || contato._count.documents > 0;
    if (emUso) {
      await this.prisma.finContact.update({ where: { id }, data: { ativo: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.finContact.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  // ---------- Empresas ----------

  async listEmpresas(incluirInativas = false) {
    const empresas = await this.prisma.finCompany.findMany({
      where: incluirInativas ? {} : { ativo: true },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { bankAccounts: true, entries: true, documents: true, contracts: true } } },
    });
    return finSerialize(empresas);
  }

  async createEmpresa(data: { nome: string; nomeFantasia?: string; cnpj?: string }) {
    const nome = (data.nome || '').trim();
    if (!nome) throw new BadRequestException('Nome da empresa é obrigatório');
    const created = await this.prisma.finCompany.create({
      data: {
        nome,
        nomeFantasia: data.nomeFantasia?.trim() || null,
        cnpj: data.cnpj?.replace(/\D/g, '') || null,
      },
    });
    return finSerialize(created);
  }

  async updateEmpresa(id: string, data: { nome?: string; nomeFantasia?: string; cnpj?: string; ativo?: boolean }) {
    const empresa = await this.prisma.finCompany.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');
    const updated = await this.prisma.finCompany.update({
      where: { id },
      data: {
        ...(data.nome !== undefined ? { nome: data.nome.trim() } : {}),
        ...(data.nomeFantasia !== undefined ? { nomeFantasia: data.nomeFantasia.trim() || null } : {}),
        ...(data.cnpj !== undefined ? { cnpj: data.cnpj.replace(/\D/g, '') || null } : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
      },
    });
    return finSerialize(updated);
  }

  async deleteEmpresa(id: string) {
    const empresa = await this.prisma.finCompany.findUnique({
      where: { id },
      include: { _count: { select: { bankAccounts: true, entries: true, documents: true, contracts: true } } },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');
    const emUso =
      empresa._count.bankAccounts > 0 ||
      empresa._count.entries > 0 ||
      empresa._count.documents > 0 ||
      empresa._count.contracts > 0;
    if (emUso) {
      await this.prisma.finCompany.update({ where: { id }, data: { ativo: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.finCompany.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  /** Saldo consolidado das contas ativas (para dashboard/fluxo) — opcionalmente restrito a uma empresa. */
  async saldoConsolidado(companyId?: string): Promise<number> {
    const contas = await this.prisma.finBankAccount.findMany({
      where: { ativo: true, ...(companyId ? { companyId } : {}) },
      select: { id: true, saldoInicial: true },
    });
    if (contas.length === 0) return 0;
    const payments = await this.prisma.finPayment.findMany({
      where: { bankAccountId: { in: contas.map((c) => c.id) } },
      select: { valor: true, entry: { select: { tipo: true } } },
    });
    const inicial = sumMoney(contas.map((c) => c.saldoInicial));
    const movimento = payments.reduce(
      (acc, p) => acc + (p.entry.tipo === 'RECEBER' ? p.valor.toNumber() : -p.valor.toNumber()),
      0,
    );
    return roundMoney(inicial + movimento);
  }
}
