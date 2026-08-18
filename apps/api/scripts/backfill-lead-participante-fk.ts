/**
 * Backfill: preenche leadParticipanteId em LeadEvent e LeadDocument
 * comparando telefone/nome contra LeadParticipante do mesmo lead.
 *
 * Uso:
 *   npx ts-node scripts/backfill-lead-participante-fk.ts          ← dry-run (só imprime)
 *   npx ts-node scripts/backfill-lead-participante-fk.ts --apply  ← grava no banco
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// ── Normalização de telefone ───────────────────────────────────────────────

function digitsOnly(v: string | null | undefined): string {
  return (v || '').replace(/\D/g, '');
}

/** Últimos 9 dígitos — tolera DDI 55 e diferença do 9º dígito (8→9 mobile). */
function key9(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  return d.length >= 8 ? d.slice(-9) : null;
}

/** Últimos 8 dígitos — fallback quando o 9º dígito diverge entre cadastros. */
function key8(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  return d.length >= 8 ? d.slice(-8) : null;
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const k9a = key9(a), k9b = key9(b);
  if (k9a && k9b && k9a === k9b) return true;
  const k8a = key8(a), k8b = key8(b);
  return !!(k8a && k8b && k8a === k8b);
}

// ── Canais relevantes ──────────────────────────────────────────────────────

const IN_CHANNELS = new Set(['whatsapp.unofficial.in', 'whatsapp.in']);
const OUT_CHANNELS = new Set(['whatsapp.unofficial.out', 'whatsapp.out']);

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Backfill leadParticipanteId === ${APPLY ? '[APPLY MODE]' : '[DRY-RUN]'}\n`);

  // ────────────────────────────────────────────────────────────────────────
  // Parte A: LeadEvent
  // ────────────────────────────────────────────────────────────────────────
  console.log('── LeadEvent ──────────────────────────────────────────────────');

  const events = await prisma.leadEvent.findMany({
    where: {
      leadParticipanteId: null,
      channel: { in: [...IN_CHANNELS, ...OUT_CHANNELS] },
    },
    select: {
      id: true,
      leadId: true,
      channel: true,
      payloadRaw: true,
      lead: {
        select: {
          telefone: true,
          participantes: { select: { id: true, nome: true, telefone: true } },
        },
      },
    },
  });

  let evResolved = 0;
  let evSkippedLeadPhone = 0; // telefone bate com o lead principal → ok, fica null
  let evSkippedNoPhone = 0;   // payloadRaw sem telefone identificável
  let evSkippedNoMatch = 0;   // nenhum participante bateu
  let evSkippedAmbiguous = 0; // mais de um participante com o mesmo telefone

  type EvUpdate = { id: string; leadParticipanteId: string; phone: string; pNome: string };
  const evUpdates: EvUpdate[] = [];

  for (const ev of events) {
    const raw = ev.payloadRaw as Record<string, any> | null;

    // Extrai o telefone relevante conforme a direção
    let phone: string | null = null;
    if (IN_CHANNELS.has(ev.channel)) {
      phone = raw?.from ?? null;
    } else if (OUT_CHANNELS.has(ev.channel) && raw?.source === 'corretor_celular') {
      // outbound para número específico (direção celular do corretor → participante)
      phone = raw?.to ?? null;
    }
    // outbound do CRM (IA, inbox) vai sempre para Lead.telefone — sem campo to

    if (!phone || digitsOnly(phone).length < 8) {
      evSkippedNoPhone++;
      continue;
    }

    // Bate com o lead principal → permanece null (= lead mesmo)
    if (phonesMatch(phone, ev.lead.telefone)) {
      evSkippedLeadPhone++;
      continue;
    }

    const matches = ev.lead.participantes.filter(
      (p) => p.telefone && phonesMatch(phone, p.telefone),
    );

    if (matches.length === 0) {
      evSkippedNoMatch++;
      continue;
    }

    if (matches.length > 1) {
      console.warn(
        `  [AMBÍGUO] LeadEvent ${ev.id}: tel=${phone} casa com ${matches.length} participantes do lead ${ev.leadId}`,
      );
      evSkippedAmbiguous++;
      continue;
    }

    evUpdates.push({ id: ev.id, leadParticipanteId: matches[0].id, phone, pNome: matches[0].nome });
    evResolved++;
  }

  if (APPLY) {
    for (const u of evUpdates) {
      await prisma.leadEvent.update({
        where: { id: u.id },
        data: { leadParticipanteId: u.leadParticipanteId },
      });
    }
    console.log(`  Atualizados: ${evResolved}`);
  } else {
    console.log(`  Seriam atualizados: ${evResolved}`);
    evUpdates.slice(0, 10).forEach((u) =>
      console.log(`    event=${u.id}  tel=${u.phone}  →  participante="${u.pNome}"`),
    );
    if (evUpdates.length > 10) console.log(`    ... (+${evUpdates.length - 10} omitidos)`);
  }

  console.log(`  Lead principal (sem ação):       ${evSkippedLeadPhone}`);
  console.log(`  Sem telefone no payloadRaw:       ${evSkippedNoPhone}`);
  console.log(`  Sem match em participantes:       ${evSkippedNoMatch}`);
  console.log(`  Ambíguos (>1 participante):       ${evSkippedAmbiguous}`);

  // ────────────────────────────────────────────────────────────────────────
  // Parte B: LeadDocument
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── LeadDocument ───────────────────────────────────────────────');

  const docs = await prisma.leadDocument.findMany({
    where: {
      leadParticipanteId: null,
      participanteNome: { not: null },
    },
    select: {
      id: true,
      leadId: true,
      participanteNome: true,
      lead: {
        select: {
          participantes: { select: { id: true, nome: true } },
        },
      },
    },
  });

  let docResolved = 0;
  let docSkippedNoMatch = 0;
  let docSkippedAmbiguous = 0;

  type DocUpdate = { id: string; leadParticipanteId: string; pNome: string; matchedNome: string };
  const docUpdates: DocUpdate[] = [];
  type DocUnresolved = { id: string; leadId: string; participanteNome: string; reason: string };
  const docUnresolved: DocUnresolved[] = [];

  for (const doc of docs) {
    const target = (doc.participanteNome ?? '').trim().toLowerCase();
    if (!target) continue;

    const matches = doc.lead.participantes.filter(
      (p) => p.nome.trim().toLowerCase() === target,
    );

    if (matches.length === 0) {
      docSkippedNoMatch++;
      docUnresolved.push({ id: doc.id, leadId: doc.leadId, participanteNome: doc.participanteNome!, reason: 'sem_match' });
      continue;
    }

    if (matches.length > 1) {
      docSkippedAmbiguous++;
      docUnresolved.push({
        id: doc.id,
        leadId: doc.leadId,
        participanteNome: doc.participanteNome!,
        reason: `ambiguo_${matches.length}_matches`,
      });
      continue;
    }

    docUpdates.push({ id: doc.id, leadParticipanteId: matches[0].id, pNome: doc.participanteNome!, matchedNome: matches[0].nome });
    docResolved++;
  }

  if (APPLY) {
    for (const u of docUpdates) {
      await prisma.leadDocument.update({
        where: { id: u.id },
        data: { leadParticipanteId: u.leadParticipanteId },
      });
    }
    console.log(`  Atualizados: ${docResolved}`);
  } else {
    console.log(`  Seriam atualizados: ${docResolved}`);
    docUpdates.slice(0, 10).forEach((u) =>
      console.log(`    doc=${u.id}  nome="${u.pNome}"  →  participante="${u.matchedNome}"`),
    );
    if (docUpdates.length > 10) console.log(`    ... (+${docUpdates.length - 10} omitidos)`);
  }

  console.log(`  Sem match de nome:                ${docSkippedNoMatch}`);
  console.log(`  Ambíguos (>1 participante):       ${docSkippedAmbiguous}`);

  // ── Casos não resolvidos de LeadDocument ──────────────────────────────
  if (docUnresolved.length > 0) {
    console.log('\n── LeadDocument sem resolução automática ──────────────────────');
    console.log(`  Total: ${docUnresolved.length}`);
    docUnresolved.forEach((d) =>
      console.log(`  doc=${d.id}  leadId=${d.leadId}  nome="${d.participanteNome}"  motivo=${d.reason}`),
    );
  }

  // ── Resumo final ─────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('RESUMO FINAL');
  console.log('  LeadEvent');
  console.log(`    resolvidos (vinculados a participante):  ${evResolved}`);
  console.log(`    lead principal, sem ação (correto):      ${evSkippedLeadPhone}`);
  console.log(`    sem telefone identificável:              ${evSkippedNoPhone}`);
  console.log(`    sem match em participantes:              ${evSkippedNoMatch}`);
  console.log(`    ambíguos (ignorados):                    ${evSkippedAmbiguous}`);
  console.log('  LeadDocument');
  console.log(`    resolvidos (vinculados a participante):  ${docResolved}`);
  console.log(`    sem match de nome:                       ${docSkippedNoMatch}`);
  console.log(`    ambíguos (ignorados):                    ${docSkippedAmbiguous}`);
  if (!APPLY) {
    console.log('\n  ⚠️  [DRY-RUN] nada foi gravado. Rode com --apply para persistir.');
  }
  console.log('════════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
