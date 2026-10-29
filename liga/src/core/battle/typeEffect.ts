import { TYPE_CHART } from '../data';
import type { PokeType } from '../types';

/** Multiplicador de un ataque contra un Pokémon de 1 o 2 tipos (0, 0.25, 0.5, 1, 2 o 4). */
export function typeEffectiveness(moveType: PokeType, defenderTypes: readonly PokeType[]): number {
  return defenderTypes.reduce((mult, t) => mult * TYPE_CHART[moveType][t], 1);
}

export type EffectivenessLabel = 'immune' | 'resisted' | 'neutral' | 'super';
export function effectivenessLabel(mult: number): EffectivenessLabel {
  if (mult === 0) return 'immune';
  if (mult < 1) return 'resisted';
  if (mult > 1) return 'super';
  return 'neutral';
}
