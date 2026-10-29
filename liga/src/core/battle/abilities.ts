import { getAbility } from '../data';
import type { Move, PokeType, StageKey } from '../types';
import type { Battler, StatusName } from './state';

export const abilitySlug = (b: Battler): string => getAbility(b.abilityId).slug;

/** Habilidades con efecto en el combate. El resto se muestra pero no hace nada. */
export const IMPLEMENTED_ABILITIES: ReadonlySet<string> = new Set([
  // Estadísticas y daño
  'huge-power', 'pure-power', 'hustle', 'guts', 'marvel-scale', 'thick-fat',
  'overgrow', 'blaze', 'torrent', 'swarm', 'compound-eyes', 'serene-grace', 'rock-head',
  // Inmunidades
  'levitate', 'volt-absorb', 'water-absorb', 'flash-fire', 'lightning-rod', 'wonder-guard', 'soundproof', 'sturdy',
  'battle-armor', 'shell-armor', 'shield-dust', 'inner-focus', 'damp',
  'limber', 'insomnia', 'vital-spirit', 'immunity', 'water-veil', 'magma-armor',
  'clear-body', 'white-smoke', 'hyper-cutter', 'keen-eye',
  // Al entrar, al contacto y al final del turno
  'intimidate', 'static', 'poison-point', 'flame-body', 'effect-spore', 'rough-skin', 'color-change',
  'synchronize', 'natural-cure', 'shed-skin', 'speed-boost', 'early-bird', 'liquid-ooze',
  // Otras
  'truant', 'pressure', 'shadow-tag', 'arena-trap', 'magnet-pull',
]);
export const isAbilityImplemented = (slug: string) => IMPLEMENTED_ABILITIES.has(slug);

const PINCH_TYPE: Record<string, PokeType> = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' };

/** Multiplicador de la potencia del ataque del usuario. */
export function powerMod(user: Battler, move: Move): number {
  const s = abilitySlug(user);
  if (PINCH_TYPE[s] === move.type && user.hp * 3 <= user.maxHp) return 1.5;
  if (s === 'flash-fire' && user.flashFire && move.type === 'fire') return 1.5;
  return 1;
}

/** Multiplicador del Ataque/At. Esp. con el que se calcula el daño. */
export function attackMod(user: Battler, target: Battler, move: Move): number {
  const s = abilitySlug(user);
  let mult = 1;
  if (move.category === 'physical') {
    if (s === 'huge-power' || s === 'pure-power') mult *= 2;
    if (s === 'hustle') mult *= 1.5;
    if (s === 'guts' && user.status) mult *= 1.5;
  }
  if (abilitySlug(target) === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) mult *= 0.5;
  return mult;
}

export function defenseMod(target: Battler, move: Move): number {
  return abilitySlug(target) === 'marvel-scale' && target.status && move.category === 'physical' ? 1.5 : 1;
}

export const ignoresBurnPenalty = (user: Battler) => abilitySlug(user) === 'guts';

export function accuracyMod(user: Battler, move: Move): number {
  const s = abilitySlug(user);
  if (s === 'compound-eyes') return 1.3;
  if (s === 'hustle' && move.category === 'physical') return 0.8;
  return 1;
}

export const preventsCrit = (target: Battler) => ['battle-armor', 'shell-armor'].includes(abilitySlug(target));
export const blocksSecondary = (target: Battler) => abilitySlug(target) === 'shield-dust';
export const blocksFlinch = (target: Battler) => abilitySlug(target) === 'inner-focus';
export const secondaryChanceMultiplier = (user: Battler) => (abilitySlug(user) === 'serene-grace' ? 2 : 1);
export const preventsRecoil = (user: Battler) => abilitySlug(user) === 'rock-head';
export const sleepDecrement = (b: Battler) => (abilitySlug(b) === 'early-bird' ? 2 : 1);

const STATUS_BLOCKERS: Record<string, StatusName[]> = {
  limber: ['paralysis'],
  insomnia: ['sleep'],
  'vital-spirit': ['sleep'],
  immunity: ['poison', 'toxic'],
  'water-veil': ['burn'],
  'magma-armor': ['freeze'],
};
export const blocksStatus = (target: Battler, status: StatusName) => STATUS_BLOCKERS[abilitySlug(target)]?.includes(status) ?? false;

const DROP_BLOCKERS: Record<string, StageKey[] | 'all'> = {
  'clear-body': 'all',
  'white-smoke': 'all',
  'hyper-cutter': ['atk'],
  'keen-eye': ['acc'],
};
export function blocksStatDrop(target: Battler, stat: StageKey): boolean {
  const rule = DROP_BLOCKERS[abilitySlug(target)];
  return rule === 'all' || (rule?.includes(stat) ?? false);
}

/** Inmunidades por habilidad (sin efectos secundarios): para saber si un ataque va a ser absorbido o anulado. */
export function abilityImmune(target: Battler, move: Move, effectiveness: number): boolean {
  const s = abilitySlug(target);
  const damaging = move.category !== 'status';
  switch (s) {
    case 'levitate': return damaging && move.type === 'ground';
    case 'volt-absorb':
    case 'lightning-rod': return move.type === 'electric';
    case 'water-absorb': return move.type === 'water';
    case 'flash-fire': return move.type === 'fire';
    case 'wonder-guard': return damaging && effectiveness <= 1;
    case 'soundproof': return move.flags.sound;
    default: return false;
  }
}

/** ¿Atrapa `trapper` al rival `foe` impidiéndole cambiar? Los Pokémon Fantasma siempre pueden huir. */
export function trapsFoe(trapper: Battler, foe: Battler): boolean {
  if (foe.types.includes('ghost')) return false;
  switch (abilitySlug(trapper)) {
    case 'shadow-tag': return abilitySlug(foe) !== 'shadow-tag';
    case 'arena-trap': return !foe.types.includes('flying') && abilitySlug(foe) !== 'levitate';
    case 'magnet-pull': return foe.types.includes('steel');
    default: return false;
  }
}
