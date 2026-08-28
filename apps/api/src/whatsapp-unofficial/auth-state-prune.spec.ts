import { computeAuthStatePrune } from './auth-state-prune.util';

/**
 * Testes puros (sem banco) da decisão de poda do auth-state Baileys — a parte
 * crítica pra não corromper sessões ativas. Cobre: cap de pre-keys por
 * recência, poda de sessões/sender-keys por inatividade, e a regra de nunca
 * remover uma chave sem timestamp conhecido (só "semear" o timestamp).
 */
describe('computeAuthStatePrune', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('mantém as N pre-keys mais recentes e poda o excedente mais antigo', () => {
    const keys: Record<string, any> = {};
    for (let id = 1; id <= 1500; id++) keys[`pre-key-${id}`] = {};

    const { toDelete, seedMeta } = computeAuthStatePrune(keys, {}, { maxPreKeys: 1000, inactiveDays: 90 });

    expect(seedMeta).toEqual({});
    expect(toDelete).toHaveLength(500);
    // as removidas devem ser exatamente os ids 1..500 (os mais antigos)
    const removedIds = toDelete.map((k) => Number(k.slice('pre-key-'.length))).sort((a, b) => a - b);
    expect(removedIds).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    // as que sobrevivem (não estão em toDelete) devem ser os ids 501..1500
    const survivors = Object.keys(keys).filter((k) => !toDelete.includes(k));
    expect(survivors).toHaveLength(1000);
  });

  it('não poda pre-keys quando o total está dentro do limite', () => {
    const keys: Record<string, any> = {};
    for (let id = 1; id <= 50; id++) keys[`pre-key-${id}`] = {};

    const { toDelete } = computeAuthStatePrune(keys, {}, { maxPreKeys: 1000, inactiveDays: 90 });
    expect(toDelete).toEqual([]);
  });

  it('poda sessão/sender-key de contato inativo há mais que o limite de dias', () => {
    const now = Date.parse('2026-08-26T00:00:00Z');
    const keys = {
      'session-5511999@s.whatsapp.net': {},
      'sender-key-120363@g.us__5511999@s.whatsapp.net': {},
    };
    const lastUsedAt = {
      'session-5511999@s.whatsapp.net': now - 91 * DAY, // inativo há 91 dias
      'sender-key-120363@g.us__5511999@s.whatsapp.net': now - 91 * DAY,
    };

    const { toDelete } = computeAuthStatePrune(keys, lastUsedAt, { maxPreKeys: 1000, inactiveDays: 90, now });
    expect(toDelete.sort()).toEqual(Object.keys(keys).sort());
  });

  it('NUNCA poda sessão/sender-key com atividade dentro da janela — a regra mais importante', () => {
    const now = Date.parse('2026-08-26T00:00:00Z');
    const keys = {
      'session-ativo@s.whatsapp.net': {},
      'session-quase-no-limite@s.whatsapp.net': {},
    };
    const lastUsedAt = {
      'session-ativo@s.whatsapp.net': now - 1 * DAY,
      'session-quase-no-limite@s.whatsapp.net': now - 89 * DAY, // 1 dia dentro do limite de 90
    };

    const { toDelete } = computeAuthStatePrune(keys, lastUsedAt, { maxPreKeys: 1000, inactiveDays: 90, now });
    expect(toDelete).toEqual([]);
  });

  it('chave contact-scoped sem timestamp conhecido nunca é podada de primeira — só semeia o timestamp', () => {
    const now = Date.parse('2026-08-26T00:00:00Z');
    const keys = { 'session-legado-sem-historico@s.whatsapp.net': {} };

    const { toDelete, seedMeta } = computeAuthStatePrune(keys, {}, { maxPreKeys: 1000, inactiveDays: 90, now });

    expect(toDelete).toEqual([]);
    expect(seedMeta).toEqual({ 'session-legado-sem-historico@s.whatsapp.net': now });
  });

  it('chave semeada e depois nunca mais tocada só é podada após o período completo de inatividade', () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const keys = { 'session-x@s.whatsapp.net': {} };

    // 1ª passada: sem histórico → semeia, não poda
    const first = computeAuthStatePrune(keys, {}, { maxPreKeys: 1000, inactiveDays: 90, now: t0 });
    expect(first.toDelete).toEqual([]);
    const lastUsedAt = first.seedMeta;

    // 89 dias depois: ainda dentro da janela → não poda
    const mid = computeAuthStatePrune(keys, lastUsedAt, { maxPreKeys: 1000, inactiveDays: 90, now: t0 + 89 * DAY });
    expect(mid.toDelete).toEqual([]);

    // 91 dias depois: fora da janela → poda
    const late = computeAuthStatePrune(keys, lastUsedAt, { maxPreKeys: 1000, inactiveDays: 90, now: t0 + 91 * DAY });
    expect(late.toDelete).toEqual(['session-x@s.whatsapp.net']);
  });

  it('ignora chaves de outros tipos (device, app-state-sync, lid, tctoken) na poda por inatividade', () => {
    const keys = {
      'device-1': {},
      'app-state-sync-key-abc': {},
      'lid-mapping-123': {},
      'tctoken-xyz': {},
    };
    const { toDelete, seedMeta } = computeAuthStatePrune(keys, {}, { maxPreKeys: 1000, inactiveDays: 90 });
    expect(toDelete).toEqual([]);
    expect(seedMeta).toEqual({});
  });

  it('reproduz o caso real observado em produção: 14620 chaves (8367 pre-keys) → poda só o excedente de pre-keys', () => {
    const keys: Record<string, any> = {};
    for (let id = 1; id <= 8367; id++) keys[`pre-key-${id}`] = {};
    for (let i = 0; i < 2086; i++) keys[`session-contato-${i}@s.whatsapp.net`] = {};
    for (let i = 0; i < 1397; i++) keys[`sender-key-grupo${i}@g.us__part@s.whatsapp.net`] = {};

    const now = Date.now();
    const { toDelete, seedMeta } = computeAuthStatePrune(keys, {}, { maxPreKeys: 1000, inactiveDays: 90, now });

    // pre-keys: mantém as 1000 mais recentes, poda as 7367 mais antigas
    const deletedPreKeys = toDelete.filter((k) => k.startsWith('pre-key-'));
    expect(deletedPreKeys).toHaveLength(8367 - 1000);

    // sessões/sender-keys sem histórico: nenhuma é removida de cara, todas são semeadas
    const deletedSessions = toDelete.filter((k) => !k.startsWith('pre-key-'));
    expect(deletedSessions).toHaveLength(0);
    expect(Object.keys(seedMeta)).toHaveLength(2086 + 1397);
  });
});
