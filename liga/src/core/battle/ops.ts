import { TYPE_NAMES_ES, getAbility } from '../data';
import type { Rng } from '../rng';
import type { PokeType, StageKey } from '../types';
import {
  abilityBlocksStatus, abilitySlug, blocksConfusion, blocksIndirectDamage, blocksStatDrop, canPoisonAnything, defOf, reflectsStatDrops, refreshSuppression,
  runAnyFainted, runFoeStatRaised, runStatDropped, stageDeltaFor,
} from './abilities/dispatch';
import type { BattleEvent, DamageCause } from './events';
import { checkStrongWeather, effectiveTerrain, effectiveWeather, isGrounded } from './field';
import { clampStage } from './stages';
import { activeOf, otherSide, sideOfBattler, type Battle, type Battler, type Side, type StatusName } from './state';

/** Contexto de ejecución: el combate, el RNG y la lista de eventos que se va generando. */
export interface Ctx {
  battle: Battle;
  rng: Rng;
  events: BattleEvent[];
}

export const emit = (ctx: Ctx, e: BattleEvent) => void ctx.events.push(e);
const sideOf = (ctx: Ctx, b: Battler) => sideOfBattler(ctx.battle, b);
export const foeOf = (ctx: Ctx, b: Battler): Battler => activeOf(ctx.battle, otherSide(sideOf(ctx, b)));

/** Causas de daño indirecto: Guardia Mágica protege de ellas. */
const INDIRECT: ReadonlySet<DamageCause> = new Set(['recoil', 'burn', 'poison', 'rough-skin', 'liquid-ooze', 'weather', 'bad-dreams', 'ability']);

export function damageHp(ctx: Ctx, b: Battler, amount: number, cause: DamageCause): number {
  if (INDIRECT.has(cause) && blocksIndirectDamage(b)) return 0;
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
      ctx.battle.sides[side].faintedCount++;
      emit(ctx, { type: 'faint', side, pokemon: b.name });
      refreshSuppression(ctx.battle);
      checkStrongWeather(ctx);
      runAnyFainted(ctx, b);
    }
  }
}

/** Sube o baja una estadística. `source` es quien provoca el cambio (Cuerpo Puro, Espejo, Desafiante…). */
export function changeStage(ctx: Ctx, b: Battler, stat: StageKey, delta: number, source: Battler | null, opts: { react?: boolean } = {}): boolean {
  const fromFoe = !!source && source !== b;
  const d = stageDeltaFor(b, delta); // Simple (×2) y Contrario (×-1)
  if (d < 0 && fromFoe) {
    if (reflectsStatDrops(b)) {
      abilityActivates(ctx, b, 'Refleja la bajada de estadísticas.');
      changeStage(ctx, source!, stat, d, null);
      return false;
    }
    if (blocksStatDrop(b, stat)) {
      abilityActivates(ctx, b, 'Evita que le bajen las estadísticas.');
      return false;
    }
  }
  const before = b.stages[stat];
  const after = clampStage(before + d);
  b.stages[stat] = after;
  emit(ctx, { type: 'stage', side: sideOf(ctx, b), pokemon: b.name, stat, change: after - before, stage: after });
  const applied = after !== before;
  if (applied && b.hp > 0) {
    if (d < 0 && fromFoe) runStatDropped(ctx, b, source!);
    else if (d > 0 && opts.react !== false) runFoeStatRaised(ctx, foeOf(ctx, b), b, stat, d);
  }
  return applied;
}

const STATUS_IMMUNE_TYPES: Record<StatusName, readonly string[]> = {
  burn: ['fire'],
  paralysis: ['electric'],
  poison: ['poison', 'steel'],
  toxic: ['poison', 'steel'],
  freeze: ['ice'],
  sleep: [],
};

export type StatusBlock = 'fainted' | 'already' | 'type' | 'ability' | 'field' | null;

/** Por qué no se puede provocar un estado (null = se puede). `source` es quien lo provoca. */
export function statusBlock(target: Battler, status: StatusName, battle: Battle, source: Battler | null = null): StatusBlock {
  if (target.hp <= 0) return 'fainted';
  if (target.status) return 'already';
  const fromFoe = !!source && source !== target;
  const poisonous = status === 'poison' || status === 'toxic';
  if (!(poisonous && source && canPoisonAnything(source)) && target.types.some((t) => STATUS_IMMUNE_TYPES[status].includes(t))) return 'type';
  const weather = effectiveWeather(battle);
  const terrain = effectiveTerrain(battle);
  // Terrenos (solo a quien pisa el suelo) y sol (no se congela)
  if (isGrounded(target) && ((terrain === 'misty') || (terrain === 'electric' && status === 'sleep'))) return 'field';
  if (status === 'freeze' && (weather === 'sun' || weather === 'harsh-sun')) return 'field';
  if (abilityBlocksStatus(target, status, battle, fromFoe, weather, terrain)) return 'ability';
  return null;
}

/**
 * Provoca un estado principal. `announce` = ataque de estado: los fallos se avisan en el registro.
 * `source` es quien lo provoca (Sincronía devuelve el estado a quien lo causó).
 */
export function inflictStatus(ctx: Ctx, target: Battler, status: StatusName, source: Battler | null, announce: boolean): boolean {
  const block = statusBlock(target, status, ctx.battle, source);
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
  if (syncable && source && source !== target && !target.suppressed && abilitySlug(target) === 'synchronize' && !statusBlock(source, status, ctx.battle, null)) {
    abilityActivates(ctx, target, 'Devuelve el estado.');
    inflictStatus(ctx, source, status, null, false);
  }
  // Títere Tóxico: lo que envenena, además confunde
  if ((status === 'poison' || status === 'toxic') && source && source !== target && !source.suppressed && abilitySlug(source) === 'poison-puppeteer') {
    abilityActivates(ctx, source);
    confuse(ctx, target, source, false);
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

/** Confunde al Pokémon (2-5 turnos). Devuelve false si no puede. */
export function confuse(ctx: Ctx, target: Battler, source: Battler | null, announce: boolean): boolean {
  const fromFoe = !!source && source !== target;
  const fail = (): false => {
    if (announce) emit(ctx, { type: 'failed' });
    return false;
  };
  if (target.hp <= 0 || target.confused > 0) return fail();
  if (blocksConfusion(target, fromFoe)) {
    if (announce) abilityActivates(ctx, target, 'Es inmune a la confusión.');
    return false;
  }
  if (effectiveTerrain(ctx.battle) === 'misty' && isGrounded(target)) return fail();
  target.confused = ctx.rng.int(2, 5);
  emit(ctx, { type: 'volatile', side: sideOf(ctx, target), pokemon: target.name, kind: 'confusion', on: true });
  return true;
}

export const typeNameEs = (t: keyof typeof TYPE_NAMES_ES) => TYPE_NAMES_ES[t];

/** Cambia los tipos del Pokémon y lo avisa (Cambio Color, Líbero, Mutatipo…). */
export function setTypes(ctx: Ctx, b: Battler, types: PokeType[]): void {
  b.types = types;
  emit(ctx, { type: 'types', side: sideOf(ctx, b), pokemon: b.name, types: [...types] });
}

/** Cambia la habilidad actual del Pokémon (Calco, Momia…); vuelve a la suya al retirarse. */
export function changeAbility(ctx: Ctx, b: Battler, abilityId: number): void {
  b.abilityId = abilityId;
  refreshSuppression(ctx.battle);
  void defOf;
}
