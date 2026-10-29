import { TYPE_CHART } from '../data';
import type { PokeType } from '../types';

export interface EffectivenessOptions {
  /** Escurridizo / Ojo Mental: Normal y Lucha golpean a los Fantasma. */
  hitsGhost?: boolean;
  /** Fuerte Corriente: los Voladores pierden sus debilidades. */
  strongWinds?: boolean;
}

/** Multiplicador de un ataque contra un Pokémon de 1 o 2 tipos (0, 0.25, 0.5, 1, 2 o 4). */
export function typeEffectiveness(moveType: PokeType, defenderTypes: readonly PokeType[], opts: EffectivenessOptions = {}): number {
  return defenderTypes.reduce((mult, t) => {
    let f = TYPE_CHART[moveType][t];
    if (opts.hitsGhost && t === 'ghost' && f === 0 && (moveType === 'normal' || moveType === 'fighting')) f = 1;
    if (opts.strongWinds && t === 'flying' && f > 1) f = 1;
    return mult * f;
  }, 1);
}

export type EffectivenessLabel = 'immune' | 'resisted' | 'neutral' | 'super';
export function effectivenessLabel(mult: number): EffectivenessLabel {
  if (mult === 0) return 'immune';
  if (mult < 1) return 'resisted';
  if (mult > 1) return 'super';
  return 'neutral';
}
