import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { chaveAcessoQuestionarioValida, gerarChaveAcessoQuestionario, hashConviteToken } from '../pre-ocupacao-convite-token.util';
import { AssembleiasService } from '../assembleias.service';
import { registrarEventoAssembleia } from '../assembleia-convocacao.service';
import { opcoesDoItem } from '../assembleia-apuracao.util';
import { soDigitos } from './questionario-cpf.util';

const CPF_NAO_CONFIRMADO =
  'Não conseguimos confirmar este CPF no cadastro da sua unidade. ' +
  'Fale com a equipe respondendo a mensagem do WhatsApp em que você recebeu este link.';

const CREDENCIE_DE_NOVO = 'Confirme o seu CPF de novo para votar.';

/**
 * Página pública do morador na assembleia (link individual por unidade, sem login).
 * Depois que o CPF confere, o servidor devolve uma chave amarrada à unidade, ao CPF e
 * ao link atual; ela acompanha cada voto no cabeçalho `X-Assembleia-Acesso` (formato
 * `cpf:chave`). Mesmo esquema da chave do questionário.
 */
@Injectable()
export class AssembleiaPublicoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assembleias: AssembleiasService,
  ) {}

  private async buscarUnidade(token: string) {
    const u = await this.prisma.preOcupacaoAssembleiaUnidade.findFirst({
      where: { tokenHash: hashConviteToken(token) },
      include: { assembleia: true },
    });
    if (!u || !u.tokenHash) throw new NotFoundException('Link não encontrado.');
    if (!u.tokenExpiraEm || u.tokenExpiraEm < new Date()) throw new GoneException('Este link não é mais válido. Fale com a equipe.');
    return u as typeof u & { tokenHash: string; tokenExpiraEm: Date };
  }

  /** CPF autorizado pela chave, ou null. */
  private cpfAutorizado(u: { id: string; tokenHash: string }, acesso: unknown): string | null {
    if (typeof acesso !== 'string') return null;
    const [cpf, chave] = acesso.split(':');
    if (soDigitos(cpf).length !== 11) return null;
    return chaveAcessoQuestionarioValida(chave, `${u.id}:${cpf}`, u.tokenHash) ? cpf : null;
  }

  async buscar(token: string, acesso?: string) {
    const u = await this.buscarUnidade(token);
    const a = u.assembleia;
    if (!u.linkAbertoEm) {
      await this.prisma.preOcupacaoAssembleiaUnidade.update({ where: { id: u.id }, data: { linkAbertoEm: new Date() } });
      await registrarEventoAssembleia(this.prisma, a.id, 'LINK_ABERTO', null, null, u.id);
    }
    const cpf = this.cpfAutorizado(u, acesso);
    const presenca = cpf
      ? await this.prisma.preOcupacaoAssembleiaPresenca.findFirst({ where: { unidadeId: u.id, cpf }, select: { nome: true } })
      : null;
    const itens = await this.prisma.preOcupacaoAssembleiaItem.findMany({
      where: { assembleiaId: a.id },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true, titulo: true, descricao: true, tipo: true, opcoes: true, status: true, resultado: true },
    });
    const aberto = itens.find((i) => i.status === 'ABERTO') ?? null;
    const meuVoto = aberto && presenca
      ? await this.prisma.preOcupacaoAssembleiaVoto.findUnique({
          where: { itemId_unidadeId: { itemId: aberto.id, unidadeId: u.id } },
          select: { opcao: true, nome: true },
        })
      : null;
    return {
      tipo: a.tipo,
      titulo: a.titulo,
      status: a.status,
      unidade: [u.torreNome, u.unidadeNome].filter(Boolean).join(' · '),
      dataPrimeiraConvocacao: a.dataPrimeiraConvocacao,
      dataSegundaConvocacao: a.dataSegundaConvocacao,
      linkVideo: a.linkVideo,
      credenciado: !!presenca,
      nome: presenca?.nome ?? null,
      // Pauta sempre visível; o detalhe do resultado só depois de fechado
      pauta: itens.map((i) => ({
        id: i.id,
        ordem: i.ordem,
        titulo: i.titulo,
        status: i.status,
        resumo: i.status === 'FECHADO' ? ((i.resultado as any)?.resumo ?? null) : null,
      })),
      itemAberto:
        aberto && presenca
          ? { id: aberto.id, ordem: aberto.ordem, titulo: aberto.titulo, descricao: aberto.descricao, tipo: aberto.tipo, opcoes: opcoesDoItem(aberto.tipo, aberto.opcoes) }
          : null,
      meuVoto,
    };
  }

  async credenciar(token: string, cpfDigitado: string, ip?: string, userAgent?: string) {
    const u = await this.buscarUnidade(token);
    if (u.assembleia.status !== 'CONVOCADA' && u.assembleia.status !== 'EM_ANDAMENTO') {
      throw new GoneException('Esta assembleia não está aberta para credenciamento.');
    }
    if (soDigitos(cpfDigitado).length !== 11) throw new BadRequestException('Digite os 11 números do CPF.');
    const pessoa = await this.assembleias.credenciar(u, cpfDigitado, 'ONLINE', { ip, userAgent });
    if (!pessoa) {
      await registrarEventoAssembleia(this.prisma, u.assembleiaId, 'CPF_RECUSADO', null, null, u.id);
      throw new BadRequestException(CPF_NAO_CONFIRMADO);
    }
    const chave = gerarChaveAcessoQuestionario(`${u.id}:${pessoa.cpf}`, u.tokenHash, u.tokenExpiraEm);
    return { nome: pessoa.nome, acesso: `${pessoa.cpf}:${chave}` };
  }

  async votar(token: string, acesso: string | undefined, itemId: string, opcao: string) {
    const u = await this.buscarUnidade(token);
    if (u.assembleia.status !== 'EM_ANDAMENTO') throw new GoneException('A votação não está aberta.');
    const cpf = this.cpfAutorizado(u, acesso);
    if (!cpf) throw new ForbiddenException(CREDENCIE_DE_NOVO);
    const presenca = await this.prisma.preOcupacaoAssembleiaPresenca.findFirst({ where: { unidadeId: u.id, cpf } });
    if (!presenca) throw new ForbiddenException(CREDENCIE_DE_NOVO);
    return this.assembleias.votar(u, String(itemId ?? ''), String(opcao ?? ''), presenca, 'ONLINE');
  }
}
