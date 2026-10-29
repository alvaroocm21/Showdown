import type { Rng } from '../rng';
import { ignoresParalysisSpeed, speedMultiplier } from './abilities';
import { effectiveTerrain, effectiveWeather } from './field';
import { applyStage } from './stages';
import type { Battle, Battler, Side } from './state';

export interface OrderEntry {
  side: Side;
  priority: number;
  /** Orden dentro de la misma prioridad (Mano Rápida +1, Rezagado -1). */
  bracket?: number;
  speed: number;
}

/** Orden de actuación: prioridad del ataque, luego su subnivel y por último la velocidad; los empates se deciden al azar. */
export function orderActions(entries: readonly OrderEntry[], rng: Rng): Side[] {
  const sorted = [...entries];
  const key = (e: OrderEntry) => [e.priority, e.bracket ?? 0, e.speed] as const;
  const tie = (a: OrderEntry, b: OrderEntry) => key(a).every((v, i) => v === key(b)[i]);
  sorted.sort((a, b) => b.priority - a.priority || (b.bracket ?? 0) - (a.bracket ?? 0) || b.speed - a.speed);
  if (sorted.length === 2 && tie(sorted[0]!, sorted[1]!) && rng.next() >= 0.5) sorted.reverse();
  return sorted.map((e) => e.side);
}

/** Velocidad real: mejoras, habilidades, clima, terreno y parálisis (la mitad). */
export function effectiveSpeed(b: Battler, battle?: Battle): number {
  let speed = applyStage(b.stats.spe, b.stages.spe);
  if (battle) speed *= speedMultiplier(battle, b, effectiveWeather(battle), effectiveTerrain(battle));
  if (b.status === 'paralysis' && !ignoresParalysisSpeed(b)) speed *= 0.5;
  return Math.floor(speed);
}
