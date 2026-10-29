import type { Move } from '../types';
import { applyStage } from './stages';
import { STRUGGLE_ID, type Battler } from './state';
import { typeEffectiveness } from './typeEffect';

export const CRIT_MULTIPLIER = 1.5;
/** Probabilidad de crítico según el nivel de crítico del ataque (0, +1, +2, +3 o más). */
export const CRIT_CHANCE = [1 / 16, 1 / 8, 1 / 2, 1] as const;
export const critChance = (critStage: number) => CRIT_CHANCE[Math.max(0, Math.min(3, critStage))]!;

export interface DamageInput {
  level: number;
  power: number;
  attack: number;
  defense: number;
  stab: boolean;
  effectiveness: number;
  crit: boolean;
  /** Variación aleatoria, entero entre 85 y 100. */
  roll: number;
  burned?: boolean;
  physical?: boolean;
}

/** Fórmula de daño de 5.ª generación en adelante (cada paso se redondea hacia abajo). */
export function calcDamage(i: DamageInput): number {
  if (i.effectiveness === 0) return 0;
  let d = Math.floor(Math.floor(((Math.floor((2 * i.level) / 5) + 2) * i.power * i.attack) / i.defense) / 50) + 2;
  if (i.crit) d = Math.floor(d * CRIT_MULTIPLIER);
  d = Math.floor((d * i.roll) / 100);
  if (i.stab) d = Math.floor(d * 1.5);
  d = Math.floor(d * i.effectiveness);
  if (i.burned && i.physical) d = Math.floor(d / 2);
  return Math.max(1, d);
}

/** Un ataque "implementado" es el que hace daño directo con la fórmula normal. */
export const isDamagingMove = (m: Move) => m.category !== 'status' && (m.power ?? 0) > 0;

/** Daño de un ataque entre dos Pokémon en combate, teniendo en cuenta mejoras de estadísticas y quemadura. */
export function computeMoveDamage(
  user: Battler,
  target: Battler,
  move: Move,
  opts: { crit: boolean; roll: number },
): number {
  const physical = move.category === 'physical';
  const atkKey = physical ? 'atk' : 'spa';
  const defKey = physical ? 'def' : 'spd';
  // En un crítico se ignoran las bajadas del atacante y las subidas del defensor.
  const atkStage = opts.crit ? Math.max(0, user.stages[atkKey]) : user.stages[atkKey];
  const defStage = opts.crit ? Math.min(0, target.stages[defKey]) : target.stages[defKey];
  const struggle = move.id === STRUGGLE_ID;
  return calcDamage({
    level: user.level,
    power: move.power ?? 0,
    attack: applyStage(user.stats[atkKey], atkStage),
    defense: Math.max(1, applyStage(target.stats[defKey], defStage)),
    stab: !struggle && user.types.includes(move.type),
    effectiveness: struggle ? 1 : typeEffectiveness(move.type, target.types),
    crit: opts.crit,
    roll: opts.roll,
    burned: user.status === 'burn',
    physical,
  });
}
