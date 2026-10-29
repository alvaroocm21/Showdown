import type { Rng } from '../rng';
import { applyStage } from './stages';
import type { Battler, Side } from './state';

export interface OrderEntry {
  side: Side;
  priority: number;
  speed: number;
}

/** Orden de actuación: primero la prioridad del ataque y luego la velocidad; los empates se deciden al azar. */
export function orderActions(entries: readonly OrderEntry[], rng: Rng): Side[] {
  const sorted = [...entries];
  const tie = (a: OrderEntry, b: OrderEntry) => a.priority === b.priority && a.speed === b.speed;
  sorted.sort((a, b) => b.priority - a.priority || b.speed - a.speed);
  if (sorted.length === 2 && tie(sorted[0]!, sorted[1]!) && rng.next() >= 0.5) sorted.reverse();
  return sorted.map((e) => e.side);
}

/** Velocidad real: mejoras de estadística y parálisis (la mitad). */
export const effectiveSpeed = (b: Battler) =>
  Math.floor(applyStage(b.stats.spe, b.stages.spe) * (b.status === 'paralysis' ? 0.5 : 1));
