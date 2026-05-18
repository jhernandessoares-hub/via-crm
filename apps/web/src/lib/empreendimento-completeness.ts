import type { Development } from "./developments.service";

export type Completeness = {
  steps: boolean[];
  allComplete: boolean;
  firstIncomplete: number;
  percent: number;
};

export const STEP_LABELS = [
  "Identificação",
  "Localização",
  "Layout",
  "Estruturação",
  "Preços",
] as const;

export function computeCompleteness(dev: Development): Completeness {
  const s1 = !!(dev.nome && dev.tipo && dev.subtipo && dev.status && dev.prazoEntrega);

  const s2 = !!(dev.endereco && dev.cidade && dev.estado && dev.lat != null && dev.lng != null);

  const s3 = dev.towers.length > 0;

  const s4 = dev.towers.length > 0 && dev.towers.every((t) => {
    if (t.floors <= 0 || t.unitsPerFloor <= 0) return false;
    const subsolos = t.subsolos ?? 0;
    const cfg = t.floorUnitsConfig ?? {};
    let subsoloUnits = 0;
    for (let s = 1; s <= subsolos; s++) {
      subsoloUnits += (cfg as Record<string, number>)[String(-s)] ?? t.unitsPerFloor;
    }
    const expected = t.floors * t.unitsPerFloor + subsoloUnits;
    return t.units.length === expected;
  });

  const s5 = !!dev.paymentCondition;

  const steps = [s1, s2, s3, s4, s5];
  const completedCount = steps.filter(Boolean).length;
  const allComplete = completedCount === steps.length;
  const firstIncomplete = steps.findIndex((x) => !x);
  const percent = Math.round((completedCount / steps.length) * 100);

  return { steps, allComplete, firstIncomplete, percent };
}
