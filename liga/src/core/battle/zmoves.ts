import zData from '../../data/zmoves.json';
import type { Move, PokeType } from '../types';
import { moveKind } from './moves';
import { STRUGGLE_ID, type Battle, type Side } from './state';

/** Nombre del movimiento Z de cada tipo (en español). */
export const zMoveName = (type: PokeType): string => (zData as Record<string, string>)[type]!;

/** Potencia de un movimiento Z según la del ataque original (tabla oficial de 7.ª generación). */
export function zPower(base: number | null): number {
  const p = base ?? 0;
  if (p <= 55) return 100;
  if (p <= 65) return 120;
  if (p <= 75) return 140;
  if (p <= 85) return 160;
  if (p <= 95) return 175;
  if (p <= 100) return 180;
  if (p <= 110) return 185;
  if (p <= 125) return 190;
  if (p <= 130) return 195;
  return 200;
}

/** ¿Se puede convertir este ataque en movimiento Z? Solo los de daño directo, una vez por combate y bando. */
export const canUseZ = (battle: Battle, side: Side, move: Move): boolean =>
  !battle.sides[side].zUsed && move.id !== STRUGGLE_ID && moveKind(move) === 'damage';

/** El movimiento Z: mismo tipo y categoría, potencia de la tabla, no falla y sin efectos secundarios. */
export function makeZMove(move: Move): Move {
  return {
    ...move,
    slug: `z-${move.slug}`,
    name: zMoveName(move.type),
    power: zPower(move.power),
    accuracy: null,
    effectId: 0,
    effectChance: null,
    flags: { ...move.flags, charge: false, recharge: false },
    meta: {
      ...move.meta, category: 0, ailmentId: 0, ailmentChance: 0, flinchChance: 0, statChance: 0, statChanges: [],
      drain: 0, healing: 0, minHits: null, maxHits: null, critRate: 0,
    },
  };
}
