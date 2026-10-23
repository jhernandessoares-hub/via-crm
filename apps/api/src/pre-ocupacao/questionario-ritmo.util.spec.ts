import { falhaDoNumero, inicioDoDiaSP } from './questionario-ritmo.util';

describe('proteção do disparo', () => {
  // São Paulo = UTC-3
  const sp = (dia: number, hora: number) => new Date(Date.UTC(2026, 9, dia, hora + 3, 30));

  it('início do dia em São Paulo', () => {
    expect(inicioDoDiaSP(sp(22, 1)).toISOString()).toBe('2026-10-22T03:00:00.000Z');
    expect(inicioDoDiaSP(sp(22, 23)).toISOString()).toBe('2026-10-22T03:00:00.000Z');
  });
  it('falha do número da família não conta para pausar', () => {
    expect(falhaDoNumero('Este número não tem WhatsApp.')).toBe(true);
    // Lead sem canal é da família (cadastro), não do nosso número: não pausa o disparo
    expect(falhaDoNumero('Lead sem canal de WhatsApp definido. Defina o canal no lead e reenvie.')).toBe(true);
    expect(falhaDoNumero('Sessão WhatsApp Light não conectada')).toBe(false);
  });
});
