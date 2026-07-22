import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { FinCategoryType, FinContactBankAccountType, FinContactType, FinPixKeyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';
import { finSerialize, parseDateOnly, roundMoney, sumMoney } from './fin-shared.util';

const logger = new Logger('FinCadastros');

// Plano de contas padrão da holding (sistema: true — renomeável, não deletável)
const SEED_CATEGORIES: Record<FinCategoryType, Record<string, string[]>> = {
  RECEITA: {
    'Receitas VIA CRM': ['Mensalidades', 'Setup / Implantação', 'Add-ons'],
    'Receitas de Serviços': ['Correspondente bancário', 'Consultoria', 'Outros CNPJs prestadores'],
    'Receitas Financeiras': ['Rendimentos', 'Outras receitas'],
  },
  DESPESA: {
    Infraestrutura: ['Servidores / Cloud', 'APIs de IA', 'WhatsApp / Meta', 'Domínios / SaaS'],
    Pessoal: ['Pró-labore', 'Salários', 'Encargos', 'Benefícios'],
    Administrativas: ['Contabilidade', 'Jurídico', 'Aluguel', 'Escritório'],
    'Comercial / Marketing': ['Anúncios', 'Comissões', 'Eventos'],
    Impostos: ['Simples / DAS', 'ISS', 'Outros impostos'],
    Financeiras: ['Tarifas bancárias', 'Juros / Multas'],
  },
};

@Injectable()
export class FinCadastrosService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

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
