export const MIN_STAGE = -6;
export const MAX_STAGE = 6;
export const clampStage = (n: number) => Math.max(MIN_STAGE, Math.min(MAX_STAGE, n));

/** Multiplicador de Ataque/Defensa/Velocidad por nivel de mejora (-6 a +6). */
export function stageMultiplier(stage: number): number {
  const s = clampStage(stage);
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

/** Multiplicador de precisión/evasión (se aplica con precisión - evasión). */
export function accuracyMultiplier(stage: number): number {
  const s = clampStage(stage);
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
}

export const applyStage = (stat: number, stage: number) => Math.floor(stat * stageMultiplier(stage));
