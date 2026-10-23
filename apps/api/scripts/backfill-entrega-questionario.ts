/**
 * Corrige a situação dos questionários JÁ enviados antes do aviso de entrega:
 * até aqui todo envio sem erro aparecia como "Recebeu". Agora "Recebeu" exige a
 * confirmação de entrega do WhatsApp — este script procura essa confirmação nas
 * mensagens já gravadas no lead.
 *
 * Como acha a mensagem do envio: evento de saída do lead (Light ou Oficial) com o
 * link do questionário. Confere o token pelo hash (precisa do WEBHOOK_HMAC_SECRET
 * do mesmo ambiente do banco); sem bater o hash, usa a mensagem mais perto do
 * horário do envio (até 3 min).
 *
 * Resultado por envio:
 *   - ENTREGUE: Light com ✓✓ (DELIVERED/READ) → grava entregueEm
 *   - SEM_CONFIRMACAO: Light sem aviso de entrega → fica "Enviado, aguardando entrega"
 *   - OFICIAL: saiu pelo WhatsApp Oficial — o aviso não era guardado, não dá para saber
 *   - NAO_ACHOU: nenhuma mensagem do link encontrada no lead
 * Em todos que acha a mensagem, grava também waMessageId e canalEnvio.
 *
 * Uso (rodar da pasta apps/api):
 *   npx ts-node scripts/backfill-entrega-questionario.ts            → só simula e gera o CSV
 *   npx ts-node scripts/backfill-entrega-questionario.ts --aplicar  → grava (depois do ok)
 * Opcional: --questionario <id>. O --aplicar só funciona depois do deploy das colunas novas.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { hashConviteToken } from '../src/pre-ocupacao/pre-ocupacao-convite-token.util';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const iq = process.argv.indexOf('--questionario');
const questionarioId = iq > 0 ? process.argv[iq + 1] : null;
const JANELA_MS = 3 * 60 * 1000;
const LINK_RE = /\/portal\/questionario\/([0-9a-f]{64})/i;

type Resultado = 'ENTREGUE' | 'SEM_CONFIRMACAO' | 'OFICIAL' | 'NAO_ACHOU';

function hashSeguro(token: string): string | null {
  try {
    return hashConviteToken(token);
  } catch {
    return null;
  }
}

function textoDo(payload: any): string {
  const t = payload?.text;
  return [typeof t === 'string' ? t : t?.body, payload?.message, payload?.body].filter((x) => typeof x === 'string').join('\n');
}

async function main() {
  // Só colunas que já existem antes do deploy: a simulação roda em qualquer banco
  const envios = await prisma.preOcupacaoQuestionarioEnvio.findMany({
    where: { teste: false, statusEnvio: 'ENVIADO', ...(questionarioId ? { questionarioId } : {}) },
    select: {
      id: true,
      questionarioId: true,
      tokenHash: true,
      enviadoEm: true,
      linkAbertoEm: true,
      respondidoEm: true,
      familia: { select: { numero: true, leadId: true, lead: { select: { nome: true, nomeCorreto: true, telefone: true } } } },
    },
    orderBy: { enviadoEm: 'asc' },
  });

  const linhas: string[][] = [['Família', 'Nome', 'Telefone', 'Enviado em', 'Abriu o link', 'Respondeu', 'Resultado', 'Como achou', 'Status WhatsApp']];
  const contagem: Record<Resultado, number> = { ENTREGUE: 0, SEM_CONFIRMACAO: 0, OFICIAL: 0, NAO_ACHOU: 0 };
  const gravar: { id: string; data: Record<string, unknown> }[] = [];

  for (const e of envios) {
    if (!e.familia || !e.enviadoEm) continue;
    const eventos = await prisma.leadEvent.findMany({
      where: {
        leadId: e.familia.leadId,
        channel: { in: ['whatsapp.unofficial.out', 'whatsapp.out'] },
        criadoEm: { gte: new Date(e.enviadoEm.getTime() - JANELA_MS) },
      },
      select: { channel: true, sourceRef: true, criadoEm: true, payloadRaw: true },
      orderBy: { criadoEm: 'asc' },
    });
    const comLink = eventos
      .map((ev) => ({ ev, token: LINK_RE.exec(textoDo(ev.payloadRaw))?.[1] ?? null }))
      .filter((x) => x.token);

    let achado = comLink.find((x) => e.tokenHash && hashSeguro(x.token!) === e.tokenHash);
    let como = 'token';
    if (!achado) {
      achado = comLink
        .filter((x) => Math.abs(x.ev.criadoEm.getTime() - e.enviadoEm!.getTime()) <= JANELA_MS)
        .sort((a, b) => Math.abs(a.ev.criadoEm.getTime() - e.enviadoEm!.getTime()) - Math.abs(b.ev.criadoEm.getTime() - e.enviadoEm!.getTime()))[0];
      como = achado ? 'horário' : '';
    }

    let resultado: Resultado = 'NAO_ACHOU';
    let statusWa = '';
    if (achado) {
      const p = achado.ev.payloadRaw as any;
      if (achado.ev.channel === 'whatsapp.out') {
        resultado = 'OFICIAL';
        gravar.push({ id: e.id, data: { waMessageId: p?.messageId ?? null, canalEnvio: 'WHATSAPP_OFICIAL' } });
      } else {
        statusWa = p?.waMessageStatus ?? '';
        const entregue = statusWa === 'DELIVERED' || statusWa === 'READ';
        resultado = entregue ? 'ENTREGUE' : 'SEM_CONFIRMACAO';
        gravar.push({
          id: e.id,
          data: {
            waMessageId: achado.ev.sourceRef ?? null,
            canalEnvio: 'WHATSAPP_LIGHT',
            ...(entregue ? { entregueEm: p?.waMessageStatusAt ? new Date(p.waMessageStatusAt) : achado.ev.criadoEm } : {}),
          },
        });
      }
    }
    contagem[resultado]++;
    const fmt = (d: Date | null) => (d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
    linhas.push([
      String(e.familia.numero),
      e.familia.lead.nomeCorreto ?? e.familia.lead.nome,
      e.familia.lead.telefone ?? '',
      fmt(e.enviadoEm),
      fmt(e.linkAbertoEm),
      fmt(e.respondidoEm),
      resultado,
      como,
      statusWa,
    ]);
  }

  const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const arquivo = path.resolve(__dirname, '..', '..', `Entrega questionario - ${aplicar ? 'aplicado' : 'simulacao'} ${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(arquivo, csv);

  console.log(`Envios analisados: ${envios.length}`);
  console.log(contagem);
  console.log(`Planilha: ${arquivo}`);

  if (!aplicar) {
    console.log('Simulação: nada foi gravado. Rode com --aplicar para gravar.');
    return;
  }
  for (const g of gravar) {
    await prisma.preOcupacaoQuestionarioEnvio.update({ where: { id: g.id }, data: g.data as any });
    if ((g.data as any).entregueEm) {
      await prisma.preOcupacaoQuestionarioEnvioEvento.create({
        data: { envioId: g.id, tipo: 'ENTREGUE', em: (g.data as any).entregueEm, detalhe: 'Confirmação recuperada do histórico do WhatsApp', por: null },
      });
    }
  }
  console.log(`Gravados: ${gravar.length} envio(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
