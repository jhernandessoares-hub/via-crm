// Lógica pura de decisão de poda do auth-state Baileys (Signal Protocol) —
// isolada em módulo próprio, sem nenhuma dependência de Prisma/Baileys/NestJS,
// pra poder ser testada isoladamente (importar whatsapp-unofficial.service.ts
// direto puxa @whiskeysockets/baileys, que é ESM puro e quebra o parser padrão
// do Jest nesse projeto).
//
// Ver whatsapp-unofficial.service.ts para o contexto completo do vazamento de
// memória que motivou isso: o blob de chaves Signal (`keys`) crescia sem
// limite pelo tempo de vida da sessão.

export type AuthStatePruneOpts = { maxPreKeys?: number; inactiveDays?: number };
export type AuthStatePruneResult = { deletedPreKeys: number; deletedSessions: number };

export function isContactScopedAuthKey(k: string): boolean {
  return k.startsWith('session-') || k.startsWith('sender-key-');
}

export function preKeyIdOf(k: string): number | null {
  if (!k.startsWith('pre-key-')) return null;
  const id = Number(k.slice('pre-key-'.length));
  return Number.isFinite(id) ? id : null;
}

// Decide o que podar a partir do estado atual — função pura, sem I/O. Nunca
// poda uma chave contact-scoped (session-*/sender-key-*) sem timestamp
// conhecido: nesse caso só agenda o "seed" do timestamp (trata como ativa
// agora, poda só a partir da próxima passada se continuar inativa). Isso é o
// que garante que dados anteriores a este fix (sem histórico de uso) nunca
// sejam removidos "às cegas" — a pior coisa que essa poda poderia fazer é
// quebrar a criptografia de uma conversa em andamento.
export function computeAuthStatePrune(
  keys: Record<string, any>,
  lastUsedAt: Record<string, number>,
  opts: { maxPreKeys: number; inactiveDays: number; now?: number },
): { toDelete: string[]; seedMeta: Record<string, number> } {
  const now = opts.now ?? Date.now();
  const cutoff = now - opts.inactiveDays * 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];
  const seedMeta: Record<string, number> = {};

  // Pre-keys: o protocolo Signal só usa cada uma UMA vez (removida via
  // removePreKey quando consumida — ver libsignal/session_cipher.js). As que
  // sobram nunca consumidas viram peso morto com o tempo (o servidor do
  // WhatsApp também rotaciona o bundle anunciado, então uma pre-key muito
  // antiga e nunca usada tem baixíssima chance de ainda ser referenciada por
  // alguém). Mantém sempre as `maxPreKeys` mais recentes por id (Baileys gera
  // ids crescentes), poda o resto.
  const preKeyEntries = Object.keys(keys)
    .map((k) => ({ k, id: preKeyIdOf(k) }))
    .filter((e): e is { k: string; id: number } => e.id !== null)
    .sort((a, b) => b.id - a.id); // ids maiores = gerados mais recentemente

  if (preKeyEntries.length > opts.maxPreKeys) {
    for (const e of preKeyEntries.slice(opts.maxPreKeys)) toDelete.push(e.k);
  }

  // Sessões/sender-keys: só poda quem está comprovadamente inativo há mais
  // que `inactiveDays`. Se o Baileys precisar desse contato de novo depois, o
  // Signal Protocol renegocia a sessão do zero automaticamente e de forma
  // transparente (é exatamente o que já acontece hoje no primeiro contato com
  // qualquer lead novo) — o único custo é um handshake a mais, não perda de
  // dados nem de conversa.
  for (const k of Object.keys(keys)) {
    if (!isContactScopedAuthKey(k)) continue;
    const ts = lastUsedAt[k];
    if (ts == null) {
      seedMeta[k] = now;
      continue;
    }
    if (ts < cutoff) toDelete.push(k);
  }

  return { toDelete, seedMeta };
}
