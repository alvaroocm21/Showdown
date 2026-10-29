import type { Rng } from '../rng';
import type { Move } from '../types';
import type { Battler, StatusName } from './state';

/** Ids de efecto de PokéAPI que el motor trata de forma especial. */
export const EFFECT = {
  selfDestruct: 8,
  dreamEater: 9,
  ohko: 39,
  superFang: 41,
  dragonRage: 42,
  rest: 38,
  toxic: 34,
  poisonFang: 203,
  levelDamage: 88,
  psywave: 89,
  sonicBoom: 131,
  endeavor: 190,
  fakeOut: 159,
} as const;

const FIXED_DAMAGE_EFFECTS: ReadonlySet<number> = new Set([
  EFFECT.sonicBoom, EFFECT.dragonRage, EFFECT.levelDamage, EFFECT.superFang, EFFECT.psywave, EFFECT.endeavor,
]);

/** Ataques que no se implementan aunque tengan potencia (o cuyo efecto sería engañoso). */
const UNSUPPORTED: ReadonlySet<string> = new Set([
  'focus-punch', 'future-sight', 'doom-desire', 'snore', 'curse', 'belly-drum', 'memento',
]);

/** Ataques cuya potencia depende de la situación. */
const VARIABLE_POWER: ReadonlySet<string> = new Set(['return', 'magnitude', 'flail', 'reversal']);

export type MoveKind = 'damage' | 'fixed' | 'ohko' | 'status' | 'none';

function statusSupported(m: Move): boolean {
  if (m.effectId === EFFECT.rest) return true;
  switch (m.meta.category) {
    case 1: return m.meta.ailmentId >= 1 && m.meta.ailmentId <= 5;
    case 2: return m.meta.statChanges.length > 0;
    case 3: return m.meta.healing > 0;
    default: return false;
  }
}

export function moveKind(m: Move): MoveKind {
  if (UNSUPPORTED.has(m.slug)) return 'none';
  if (VARIABLE_POWER.has(m.slug)) return 'damage';
  if (m.category !== 'status' && (m.power ?? 0) > 0) return 'damage';
  if (m.effectId === EFFECT.ohko) return 'ohko';
  if (FIXED_DAMAGE_EFFECTS.has(m.effectId)) return 'fixed';
  if (m.category === 'status' && statusSupported(m)) return 'status';
  return 'none';
}

export const isMoveImplemented = (m: Move) => moveKind(m) !== 'none';
/** Ataque de daño directo con la fórmula normal. */
export const isDamagingMove = (m: Move) => moveKind(m) === 'damage';

/** Ataques de estado que actúan sobre el propio usuario. */
export const targetsUser = (m: Move) => m.target === 5 || m.target === 7 || m.target === 13;

/** Estado principal que provoca un ataque de estado o secundario. */
export function statusOf(m: Move): StatusName | null {
  switch (m.meta.ailmentId) {
    case 1: return 'paralysis';
    case 2: return 'sleep';
    case 3: return 'freeze';
    case 4: return 'burn';
    case 5: return m.effectId === EFFECT.toxic || m.effectId === EFFECT.poisonFang ? 'toxic' : 'poison';
    default: return null;
  }
}

export function variablePower(move: Move, user: Battler, rng: Rng): number {
  switch (move.slug) {
    case 'return': return 102;
    case 'magnitude': {
      const r = rng.int(1, 100);
      return r <= 5 ? 10 : r <= 15 ? 30 : r <= 35 ? 50 : r <= 65 ? 70 : r <= 85 ? 90 : r <= 95 ? 110 : 150;
    }
    case 'flail':
    case 'reversal': {
      const p = Math.floor((user.hp * 48) / user.maxHp);
      return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20;
    }
    default: return move.power ?? 0;
  }
}

/** Potencia "media" para estimaciones (IA, interfaz) sin gastar números aleatorios. */
export function expectedPower(move: Move, user: Battler): number {
  switch (move.slug) {
    case 'magnitude': return 71;
    case 'return': return 102;
    case 'flail':
    case 'reversal': return variablePower(move, user, { next: () => 0, int: () => 0, pick: () => undefined as never, shuffle: (x) => [...x] });
    default: return move.power ?? 0;
  }
}

/** Número de golpes de un ataque multigolpe (2-5 golpes: 35 %, 35 %, 15 %, 15 %). */
export function rollHitCount(move: Move, rng: Rng): number {
  const { minHits, maxHits } = move.meta;
  if (minHits === null || maxHits === null) return 1;
  if (minHits === maxHits) return minHits;
  const r = rng.next();
  return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
}
