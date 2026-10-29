import type { Rng } from '../rng';
import { TYPE_NAMES_ES, getAbility } from '../data';
import type { StageKey } from '../types';
import { abilitySlug, blocksStatDrop, blocksStatus } from './abilities';
import type { BattleEvent, DamageCause } from './events';
import { clampStage } from './stages';
import { activeOf, sideOfBattler, type Battle, type Battler, type Side, type StatusName } from './state';

/** Contexto de ejecución: el combate, el RNG y la lista de eventos que se va generando. */
export interface Ctx {
  battle: Battle;
  rng: Rng;
  events: BattleEvent[];
}

export const emit = (ctx: Ctx, e: BattleEvent) => void ctx.events.push(e);
const sideOf = (ctx: Ctx, b: Battler) => sideOfBattler(ctx.battle, b);

export function damageHp(ctx: Ctx, b: Battler, amount: number, cause: DamageCause): number {
  const actual = Math.min(b.hp, Math.max(0, amount));
  b.hp -= actual;
  emit(ctx, { type: 'damage', side: sideOf(ctx, b), pokemon: b.name, amount: actual, hp: b.hp, maxHp: b.maxHp, cause });
  return actual;
}

export function healHp(ctx: Ctx, b: Battler, amount: number): number {
  const actual = Math.min(b.maxHp - b.hp, Math.max(0, amount));
  if (actual > 0) {
    b.hp += actual;
    emit(ctx, { type: 'heal', side: sideOf(ctx, b), pokemon: b.name, amount: actual, hp: b.hp, maxHp: b.maxHp });
  }
  return actual;
}

export function abilityActivates(ctx: Ctx, b: Battler, message?: string): void {
  emit(ctx, { type: 'ability', side: sideOf(ctx, b), pokemon: b.name, ability: getAbility(b.abilityId).name, message });
}

/** Marca como debilitados (y avisa) a los Pokémon activos sin PS, en el orden indicado. */
export function checkFaints(ctx: Ctx, order: readonly Side[]): void {
  for (const side of order) {
    const b = activeOf(ctx.battle, side);
    if (b.hp <= 0 && !b.fainted) {
      b.fainted = true;
      emit(ctx, { type: 'faint', side, pokemon: b.name });
    }
  }
}

/** Sube o baja una estadística. `source` es quien provoca el cambio (para Cuerpo Puro y similares). */
export function changeStage(ctx: Ctx, b: Battler, stat: StageKey, delta: number, source: Battler | null): boolean {
  if (delta < 0 && source && source !== b && blocksStatDrop(b, stat)) {
    abilityActivates(ctx, b, 'Evita que le bajen las estadísticas.');
    return false;
  }
  const before = b.stages[stat];
  const after = clampStage(before + delta);
  b.stages[stat] = after;
  emit(ctx, { type: 'stage', side: sideOf(ctx, b), pokemon: b.name, stat, change: after - before, stage: after });
  return after !== before;
}

const STATUS_IMMUNE_TYPES: Record<StatusName, readonly string[]> = {
  burn: ['fire'],
  paralysis: ['electric'],
  poison: ['poison', 'steel'],
  toxic: ['poison', 'steel'],
  freeze: ['ice'],
  sleep: [],
};

export type StatusBlock = 'fainted' | 'already' | 'type' | 'ability' | null;

/** Por qué no se puede provocar un estado (null = se puede). */
export function statusBlock(target: Battler, status: StatusName): StatusBlock {
  if (target.hp <= 0) return 'fainted';
  if (target.status) return 'already';
  if (target.types.some((t) => STATUS_IMMUNE_TYPES[status].includes(t))) return 'type';
  if (blocksStatus(target, status)) return 'ability';
  return null;
}

/**
 * Provoca un estado principal. `announce` = ataque de estado: los fallos se avisan en el registro.
 * `source` es quien lo provoca (Sincronía devuelve el estado a quien lo causó).
 */
export function inflictStatus(ctx: Ctx, target: Battler, status: StatusName, source: Battler | null, announce: boolean): boolean {
  const block = statusBlock(target, status);
  if (block) {
    if (announce) {
      if (block === 'ability') abilityActivates(ctx, target, 'Es inmune a ese estado.');
      else if (block === 'type') emit(ctx, { type: 'immune', side: sideOf(ctx, target), pokemon: target.name });
      else emit(ctx, { type: 'failed' });
    }
    return false;
  }
  target.status = status;
  target.sleepTurns = status === 'sleep' ? ctx.rng.int(1, 3) : 0;
  target.toxicCount = 1;
  emit(ctx, { type: 'status', side: sideOf(ctx, target), pokemon: target.name, status });

  const syncable = status === 'burn' || status === 'paralysis' || status === 'poison' || status === 'toxic';
  if (syncable && source && source !== target && abilitySlug(target) === 'synchronize' && !statusBlock(source, status)) {
    abilityActivates(ctx, target, 'Devuelve el estado.');
    inflictStatus(ctx, source, status, null, false);
  }
  return true;
}

export function cureStatus(ctx: Ctx, b: Battler): void {
  const was = b.status;
  if (!was) return;
  b.status = null;
  b.sleepTurns = 0;
  b.toxicCount = 1;
  emit(ctx, { type: 'status', side: sideOf(ctx, b), pokemon: b.name, status: null, was });
}

export const typeNameEs = (t: keyof typeof TYPE_NAMES_ES) => TYPE_NAMES_ES[t];
