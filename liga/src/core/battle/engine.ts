import type { Rng } from '../rng';
import { halvesBurnDamage, healsFromPoison, isWeatherDamageImmune, refreshSuppression, runEndTurn, runSwitchIn, trapsFoe } from './abilities';
import type { BattleEvent } from './events';
import { clearTerrain, clearWeather, effectiveTerrain, effectiveWeather, isGrounded, isStrongWeather } from './field';
import { effectivePriority, moveForSlot, orderBracket, useMove } from './exec';
import { canUseZ } from './zmoves';
import { megaEvolve, megaOptions } from './mega';
import { checkFaints, damageHp, emit, healHp, type Ctx } from './ops';
import { activeOf, hasAlive, otherSide, SIDES, type Battle, type Battler, type Side } from './state';
import { announceEntry, doSwitch } from './switching';
import { effectiveSpeed, orderActions } from './turnOrder';

export type { BattleEvent } from './events';
export { megaOptions } from './mega';
export { canUseZ } from './zmoves';
export { moveForSlot } from './exec';

/** slot = posición del ataque (0-3), o -1 para Forcejeo (solo si no quedan PP). */
export interface MoveAction {
  type: 'move';
  slot: number;
  /** Megaevolucionar antes de atacar: id de la forma (ver `megaOptions`). */
  mega?: number;
  /** Usar el movimiento Z (una vez por combate y bando, solo con ataques de daño). */
  z?: boolean;
}
/** to = posición del Pokémon del equipo al que se cambia. */
export interface SwitchAction {
  type: 'switch';
  to: number;
}
export type Action = MoveAction | SwitchAction;

const SWITCH_PRIORITY = 100;

/** Posiciones de ataque que se pueden elegir. Preparando un ataque de dos turnos solo queda ese; sin PP, solo Forcejeo (-1). */
export function legalMoveSlots(b: Battler): number[] {
  if (b.charging !== null) return [b.charging];
  const slots = b.moves.flatMap((m, i) => (m.pp > 0 && !(b.disabled && b.disabled.moveId === m.moveId) ? [i] : []));
  if (b.locked !== null && slots.includes(b.locked)) return [b.locked];
  return slots.length ? slots : [-1];
}

export const isTrapped = (battle: Battle, side: Side) => trapsFoe(activeOf(battle, otherSide(side)), activeOf(battle, side));

/** Pokémon del equipo a los que se puede cambiar ahora mismo. */
export function legalSwitchTargets(battle: Battle, side: Side): number[] {
  if (isTrapped(battle, side)) return [];
  const s = battle.sides[side];
  return s.team.flatMap((b, i) => (i !== s.active && b.hp > 0 ? [i] : []));
}

function validate(battle: Battle, side: Side, action: Action): void {
  const user = activeOf(battle, side);
  if (action.type === 'switch') {
    if (!legalSwitchTargets(battle, side).includes(action.to)) throw new Error(`Cambio no válido para ${user.name}: ${action.to}`);
    return;
  }
  if (!user.recharging && !legalMoveSlots(user).includes(action.slot)) {
    throw new Error(`Acción no válida para ${user.name}: ataque ${action.slot}`);
  }
  if (action.mega !== undefined && !megaOptions(battle, side).some((f) => f.id === action.mega)) {
    throw new Error(`${user.name} no puede megaevolucionar a esa forma`);
  }
  if (action.z) {
    const chosen = moveForSlot(user, user.charging ?? action.slot);
    if (user.recharging || user.charging !== null || !canUseZ(battle, side, chosen)) throw new Error(`${user.name} no puede usar un movimiento Z ahora`);
  }
}

export function executeTurn(battle: Battle, actions: readonly [Action, Action], rng: Rng): BattleEvent[] {
  if (battle.winner !== null) throw new Error('El combate ya ha terminado');
  if (battle.pending[0] || battle.pending[1]) throw new Error('Falta elegir el Pokémon de reemplazo');
  const ctx: Ctx = { battle, rng, events: [] };
  battle.turn += 1;
  emit(ctx, { type: 'turn', turn: battle.turn });
  for (const side of SIDES) validate(battle, side, actions[side]);
  const startActive = [battle.sides[0].active, battle.sides[1].active];

  // Megaevolución: antes de todo (el más rápido primero), porque cambia estadísticas y velocidad
  const megaSides = SIDES.filter((s) => actions[s].type === 'move' && (actions[s] as { mega?: number }).mega !== undefined)
    .sort((a, b) => effectiveSpeed(activeOf(battle, b), battle) - effectiveSpeed(activeOf(battle, a), battle));
  for (const side of megaSides) megaEvolve(ctx, side, (actions[side] as { mega: number }).mega);

  const entries = SIDES.map((side) => {
    const action = actions[side];
    const user = activeOf(battle, side);
    const target = activeOf(battle, otherSide(side));
    if (action.type === 'switch') return { side, priority: SWITCH_PRIORITY, bracket: 0, speed: effectiveSpeed(user, battle) };
    if (user.recharging) return { side, priority: 0, bracket: 0, speed: effectiveSpeed(user, battle) };
    const move = moveForSlot(user, user.charging ?? action.slot);
    return {
      side,
      priority: effectivePriority(battle, user, target, move),
      bracket: orderBracket(battle, user, target, move, rng),
      speed: effectiveSpeed(user, battle),
    };
  });

  for (const side of orderActions(entries, rng)) {
    // Si lo han cambiado de sitio antes de actuar (Rugido…), pierde su acción
    if (battle.sides[side].active !== startActive[side]) continue;
    if (activeOf(battle, side).hp <= 0) continue;
    const action = actions[side];
    if (action.type === 'switch') doSwitch(ctx, side, action.to);
    else useMove(ctx, side, { slot: action.slot, z: action.z });
    if (finishIfOver(ctx)) return ctx.events;
  }

  endOfTurn(ctx);
  if (battle.winner === null) {
    for (const side of SIDES) {
      const b = activeOf(battle, side);
      const hasReserve = battle.sides[side].team.some((m, i) => i !== battle.sides[side].active && m.hp > 0);
      if (b.hp <= 0 || (b.forceOut && hasReserve)) battle.pending[side] = true;
      b.forceOut = false;
    }
  }
  return ctx.events;
}

/** Envía al campo el Pokémon de reemplazo elegido tras un debilitamiento (o una salida forzada). */
export function sendOut(battle: Battle, side: Side, to: number, rng: Rng): BattleEvent[] {
  const s = battle.sides[side];
  const next = s.team[to];
  if (!battle.pending[side]) throw new Error('Este bando no tiene que elegir reemplazo');
  if (!next || next.hp <= 0 || to === s.active) throw new Error(`Reemplazo no válido: ${to}`);
  const ctx: Ctx = { battle, rng, events: [] };
  battle.pending[side] = false;
  doSwitch(ctx, side, to);
  return ctx.events;
}

/** Saca al campo a los dos Pokémon iniciales (activa habilidades de entrada como Intimidación, el más rápido primero). */
export function startBattle(battle: Battle, rng: Rng): BattleEvent[] {
  const ctx: Ctx = { battle, rng, events: [] };
  for (const side of SIDES) announceEntry(ctx, side);
  refreshSuppression(battle);
  const order = orderActions(
    SIDES.map((side) => ({ side, priority: 0, speed: effectiveSpeed(activeOf(battle, side), battle) })),
    rng,
  );
  for (const side of order) runSwitchIn(ctx, side);
  return ctx.events;
}

/** Si un bando se queda sin Pokémon gana el otro; si caen los dos, gana el bando cuyo último Pokémon cayó el último. */
function finishIfOver(ctx: Ctx): boolean {
  const { battle } = ctx;
  if (battle.winner !== null) return true;
  const alive0 = hasAlive(battle, 0);
  const alive1 = hasAlive(battle, 1);
  if (alive0 && alive1) return false;
  let winner: Side;
  if (alive0) winner = 0;
  else if (alive1) winner = 1;
  else {
    const lastFaint = [...ctx.events].reverse().find((e) => e.type === 'faint');
    winner = lastFaint && lastFaint.type === 'faint' ? lastFaint.side : 0;
  }
  battle.winner = winner;
  emit(ctx, { type: 'win', side: winner });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Final de turno
// ---------------------------------------------------------------------------------------------

/** Tipos que no sufren la tormenta de arena. */
const SAND_PROOF = ['rock', 'ground', 'steel'];

function endOfTurn(ctx: Ctx): void {
  const { battle } = ctx;
  const order = SIDES.map((side) => ({ side, speed: effectiveSpeed(activeOf(battle, side), battle) }))
    .sort((a, b) => b.speed - a.speed || a.side - b.side)
    .map((e) => e.side);

  // 1) Daño del clima
  const weather = effectiveWeather(battle);
  if (weather === 'sand') {
    for (const side of order) {
      const b = activeOf(battle, side);
      if (b.hp <= 0 || b.types.some((t) => SAND_PROOF.includes(t)) || isWeatherDamageImmune(b)) continue;
      damageHp(ctx, b, Math.max(1, Math.floor(b.maxHp / 16)), 'weather');
      checkFaints(ctx, [side]);
    }
    // El final del turno se aplica a los dos Pokémon antes de decidir si el combate ha terminado
    if (finishIfOver(ctx)) return;
  }

  // 2) Estados, habilidades, terreno y cuentas atrás de cada Pokémon
  for (const side of order) {
    const b = activeOf(battle, side);
    if (b.hp <= 0) continue;
    statusDamage(ctx, b);
    if (b.hp > 0) runEndTurn(ctx, b);
    const terrain = effectiveTerrain(battle);
    if (b.hp > 0 && terrain === 'grassy' && isGrounded(b)) healHp(ctx, b, Math.max(1, Math.floor(b.maxHp / 16)));
    if (b.hp > 0 && b.perish > 0) {
      b.perish--;
      if (b.perish === 0) damageHp(ctx, b, b.hp, 'perish');
      else emit(ctx, { type: 'volatile', side, pokemon: b.name, kind: 'perish', on: true, turns: b.perish });
    }
    if (b.hp > 0 && b.disabled && --b.disabled.turns <= 0) {
      b.disabled = null;
      emit(ctx, { type: 'volatile', side, pokemon: b.name, kind: 'disable', on: false });
    }
    if (b.hp > 0 && b.slowStart > 0) b.slowStart--;
    checkFaints(ctx, [side]);
  }
  if (finishIfOver(ctx)) return;

  // 3) El clima y el terreno se agotan
  const f = battle.field;
  if (f.weather && !isStrongWeather(f.weather) && --f.weatherTurns <= 0) clearWeather(ctx);
  if (f.terrain && --f.terrainTurns <= 0) clearTerrain(ctx);

  for (const side of SIDES) {
    const b = activeOf(battle, side);
    b.flinched = false;
    b.movedThisTurn = false;
  }
}

/** Daño (o curación) del veneno y de la quemadura al final del turno. */
function statusDamage(ctx: Ctx, b: Battler): void {
  if (b.status === 'burn') {
    const fraction = halvesBurnDamage(b) ? 32 : 16;
    damageHp(ctx, b, Math.max(1, Math.floor(b.maxHp / fraction)), 'burn');
  } else if (b.status === 'poison' || b.status === 'toxic') {
    if (healsFromPoison(b)) {
      healHp(ctx, b, Math.max(1, Math.floor(b.maxHp / 8)));
      return;
    }
    if (b.status === 'poison') damageHp(ctx, b, Math.max(1, Math.floor(b.maxHp / 8)), 'poison');
    else {
      damageHp(ctx, b, Math.max(1, Math.floor((b.maxHp * b.toxicCount) / 16)), 'poison');
      b.toxicCount = Math.min(15, b.toxicCount + 1);
    }
  }
}

