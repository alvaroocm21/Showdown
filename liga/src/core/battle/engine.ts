import type { Rng } from '../rng';
import type { Move } from '../types';
import { abilitySlug, accuracyMod, blocksFlinch, blocksStatus, blocksSecondary, preventsCrit, preventsRecoil, secondaryChanceMultiplier, sleepDecrement, trapsFoe } from './abilities';
import { onContact, onDamaged, onEndTurn, onSwitchIn, onSwitchOut, onTryHit } from './abilityEffects';
import { computeMoveDamage, critChance } from './damage';
import type { BattleEvent, CantMoveReason } from './events';
import { EFFECT, moveKind, rollHitCount, statusOf, targetsUser, variablePower } from './moves';
import {
  abilityActivates, changeStage, checkFaints, cureStatus, damageHp, emit, healHp, inflictStatus, type Ctx,
} from './ops';
import { accuracyMultiplier, clampStage } from './stages';
import {
  STRUGGLE_ID, activeOf, hasAlive, moveOf, otherSide, resetVolatile,
  type Battle, type Battler, type Side,
} from './state';
import { effectiveSpeed, orderActions } from './turnOrder';
import { typeEffectiveness } from './typeEffect';

export type { BattleEvent } from './events';

/** slot = posición del ataque (0-3), o -1 para Forcejeo (solo si no quedan PP). */
export interface MoveAction {
  type: 'move';
  slot: number;
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
  const slots = b.moves.flatMap((m, i) => (m.pp > 0 ? [i] : []));
  return slots.length ? slots : [-1];
}

export const isTrapped = (battle: Battle, side: Side) => trapsFoe(activeOf(battle, otherSide(side)), activeOf(battle, side));

/** Pokémon del equipo a los que se puede cambiar ahora mismo. */
export function legalSwitchTargets(battle: Battle, side: Side): number[] {
  if (isTrapped(battle, side)) return [];
  const s = battle.sides[side];
  return s.team.flatMap((b, i) => (i !== s.active && b.hp > 0 ? [i] : []));
}

const moveForSlot = (b: Battler, slot: number) => (slot === -1 ? moveOf(STRUGGLE_ID) : moveOf(b.moves[slot]!.moveId));

function validate(battle: Battle, side: Side, action: Action): void {
  const user = activeOf(battle, side);
  if (action.type === 'switch') {
    if (!legalSwitchTargets(battle, side).includes(action.to)) throw new Error(`Cambio no válido para ${user.name}: ${action.to}`);
  } else if (!user.recharging && !legalMoveSlots(user).includes(action.slot)) {
    throw new Error(`Acción no válida para ${user.name}: ataque ${action.slot}`);
  }
}

export function executeTurn(battle: Battle, actions: readonly [Action, Action], rng: Rng): BattleEvent[] {
  if (battle.winner !== null) throw new Error('El combate ya ha terminado');
  if (battle.pending[0] || battle.pending[1]) throw new Error('Falta elegir el Pokémon de reemplazo');
  const ctx: Ctx = { battle, rng, events: [] };
  battle.turn += 1;
  emit(ctx, { type: 'turn', turn: battle.turn });

  const entries = ([0, 1] as const).map((side) => {
    const action = actions[side];
    validate(battle, side, action);
    const user = activeOf(battle, side);
    const priority =
      action.type === 'switch' ? SWITCH_PRIORITY : user.recharging ? 0 : moveForSlot(user, user.charging ?? action.slot).priority;
    return { side, priority, speed: effectiveSpeed(user) };
  });

  for (const side of orderActions(entries, rng)) {
    if (activeOf(battle, side).hp <= 0) continue;
    const action = actions[side];
    if (action.type === 'switch') doSwitch(ctx, side, action.to);
    else useMove(ctx, side, action);
    if (finishIfOver(ctx)) return ctx.events;
  }

  endOfTurn(ctx);
  if (battle.winner === null) {
    for (const side of [0, 1] as const) {
      if (activeOf(battle, side).hp <= 0) battle.pending[side] = true;
    }
  }
  return ctx.events;
}

/** Envía al campo el Pokémon de reemplazo elegido tras un debilitamiento. */
export function sendOut(battle: Battle, side: Side, to: number, rng: Rng): BattleEvent[] {
  const s = battle.sides[side];
  const next = s.team[to];
  if (!battle.pending[side]) throw new Error('Este bando no tiene que elegir reemplazo');
  if (!next || next.hp <= 0 || to === s.active) throw new Error(`Reemplazo no válido: ${to}`);
  const ctx: Ctx = { battle, rng, events: [] };
  battle.pending[side] = false;
  s.active = to;
  s.enteredTurn = battle.turn;
  enter(ctx, side);
  return ctx.events;
}

/** Anuncia la entrada del Pokémon activo de un bando (evento 'switch'). */
function announceEntry(ctx: Ctx, side: Side): void {
  const b = activeOf(ctx.battle, side);
  b.firstTurn = true;
  emit(ctx, {
    type: 'switch', side, index: ctx.battle.sides[side].active, pokemon: b.name, speciesId: b.set.speciesId,
    level: b.level, types: [...b.types], hp: b.hp, maxHp: b.maxHp, status: b.status,
  });
}

function enter(ctx: Ctx, side: Side): void {
  announceEntry(ctx, side);
  onSwitchIn(ctx, side);
}

/** Saca al campo a los dos Pokémon iniciales (activa habilidades de entrada como Intimidación, el más rápido primero). */
export function startBattle(battle: Battle, rng: Rng): BattleEvent[] {
  const ctx: Ctx = { battle, rng, events: [] };
  for (const side of [0, 1] as const) announceEntry(ctx, side);
  const order = orderActions(
    ([0, 1] as const).map((side) => ({ side, priority: 0, speed: effectiveSpeed(activeOf(battle, side)) })),
    rng,
  );
  for (const side of order) onSwitchIn(ctx, side);
  return ctx.events;
}

function doSwitch(ctx: Ctx, side: Side, to: number): void {
  const s = ctx.battle.sides[side];
  const out = s.team[s.active]!;
  emit(ctx, { type: 'recall', side, pokemon: out.name });
  onSwitchOut(out);
  resetVolatile(out);
  s.active = to;
  s.enteredTurn = ctx.battle.turn;
  enter(ctx, side);
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

/** Comprobaciones antes de actuar: sueño, congelación, retroceso, holgazanería y parálisis. */
function canAct(ctx: Ctx, side: Side, user: Battler): boolean {
  const cant = (reason: CantMoveReason) => {
    emit(ctx, { type: 'cantMove', side, pokemon: user.name, reason });
    return false;
  };
  if (user.recharging) {
    user.recharging = false;
    return cant('recharge');
  }
  if (user.status === 'sleep') {
    if (user.sleepTurns > 0) {
      user.sleepTurns = Math.max(0, user.sleepTurns - sleepDecrement(user));
      return cant('sleep');
    }
    cureStatus(ctx, user);
  }
  if (user.status === 'freeze') {
    if (ctx.rng.next() < 0.2) cureStatus(ctx, user);
    else return cant('freeze');
  }
  if (user.flinched) return cant('flinch');
  if (abilitySlug(user) === 'truant' && user.loafing) {
    user.loafing = false;
    return cant('truant');
  }
  if (user.status === 'paralysis' && ctx.rng.next() < 0.25) return cant('paralysis');
  return true;
}

function hitsTarget(ctx: Ctx, user: Battler, target: Battler, move: Move, ohko: boolean): boolean {
  if (ohko) {
    if (user.level < target.level) return false;
    return ctx.rng.int(1, 100) <= 30 + user.level - target.level;
  }
  if (move.accuracy === null) return true;
  const stage = clampStage(user.stages.acc - target.stages.eva);
  const chance = Math.floor(move.accuracy * accuracyMultiplier(stage) * accuracyMod(user, move));
  return ctx.rng.int(1, 100) <= chance;
}

function useMove(ctx: Ctx, side: Side, action: MoveAction): void {
  const { battle, rng } = ctx;
  const user = activeOf(battle, side);
  const targetSide = otherSide(side);
  const target = activeOf(battle, targetSide);
  user.movedThisTurn = true;

  if (!canAct(ctx, side, user)) {
    user.charging = null;
    return;
  }
  const releasing = user.charging !== null;
  const slot = releasing ? user.charging! : action.slot;
  user.charging = null;
  const wasFirstTurn = user.firstTurn;
  user.firstTurn = false;

  const move = moveForSlot(user, slot);
  if (slot >= 0 && !releasing) {
    const bm = user.moves[slot]!;
    bm.pp -= 1;
    if (abilitySlug(target) === 'pressure' && !targetsUser(move)) bm.pp = Math.max(0, bm.pp - 1);
  }
  emit(ctx, { type: 'move', side, pokemon: user.name, move: move.name, moveType: move.type });

  if (move.flags.charge && !releasing) {
    user.charging = slot;
    emit(ctx, { type: 'charge', side, pokemon: user.name });
    return;
  }
  if (abilitySlug(user) === 'truant') user.loafing = true;

  const kind = moveKind(move);
  if (kind === 'none') {
    emit(ctx, { type: 'noEffect' });
    return;
  }
  if (kind === 'status' && targetsUser(move)) {
    useSelfMove(ctx, user, move);
    return;
  }

  // Condiciones propias de algunos ataques
  const fails =
    (move.effectId === EFFECT.fakeOut && !wasFirstTurn) ||
    (move.effectId === EFFECT.dreamEater && target.status !== 'sleep');
  if (fails) {
    emit(ctx, { type: 'failed' });
    return;
  }
  if (move.effectId === EFFECT.selfDestruct) {
    const damp = [user, target].find((b) => abilitySlug(b) === 'damp');
    if (damp) {
      abilityActivates(ctx, damp, 'Impide que se use ese ataque.');
      emit(ctx, { type: 'failed' });
      return;
    }
  }

  // Explosión y Autodestrucción debilitan al usuario aunque no lleguen a hacer daño.
  const failed = () => {
    if (move.effectId !== EFFECT.selfDestruct) return;
    damageHp(ctx, user, user.hp, 'selfdestruct');
    checkFaints(ctx, [side]);
  };

  const struggle = move.id === STRUGGLE_ID;
  const effectiveness = struggle ? 1 : typeEffectiveness(move.type, target.types);
  const typeMatters = kind !== 'status' || move.slug === 'thunder-wave';
  if (typeMatters && effectiveness === 0) {
    emit(ctx, { type: 'immune', side: targetSide, pokemon: target.name });
    return failed();
  }
  if (onTryHit(ctx, user, target, move, effectiveness)) return failed();
  if (!hitsTarget(ctx, user, target, move, kind === 'ohko')) {
    emit(ctx, { type: 'miss', side, pokemon: user.name });
    return failed();
  }

  if (kind === 'status') {
    useStatusOnFoe(ctx, user, target, move);
    return;
  }

  const total = kind === 'damage' ? dealDamage(ctx, user, target, move, effectiveness) : dealFixedDamage(ctx, user, target, move, kind);
  if (total === null) return; // el ataque falló o no tuvo efecto

  afterDamage(ctx, side, user, target, move, total);
}

// ---------------------------------------------------------------------------------------------
// Ataques de daño
// ---------------------------------------------------------------------------------------------

function dealDamage(ctx: Ctx, user: Battler, target: Battler, move: Move, effectiveness: number): number {
  const { rng } = ctx;
  const power = variablePower(move, user, rng);
  const hits = rollHitCount(move, rng);
  let total = 0;
  let landed = 0;
  for (let i = 0; i < hits && target.hp > 0; i++) {
    const crit = !preventsCrit(target) && rng.next() < critChance(move.meta.critRate);
    const roll = rng.int(85, 100);
    let amount = computeMoveDamage(user, target, move, { crit, roll, power });
    const sturdy = abilitySlug(target) === 'sturdy' && target.hp === target.maxHp && amount >= target.hp;
    if (sturdy) amount = target.hp - 1;
    amount = Math.min(target.hp, amount);
    damageHp(ctx, target, amount, 'move');
    total += amount;
    landed++;
    if (crit) emit(ctx, { type: 'crit' });
    if (i === 0 && effectiveness !== 1) emit(ctx, { type: 'effectiveness', multiplier: effectiveness });
    if (sturdy) abilityActivates(ctx, target, '¡Aguanta el golpe!');
    onDamaged(ctx, target, move);
    if (target.status === 'freeze' && move.type === 'fire') cureStatus(ctx, target);
    onContact(ctx, user, target, move);
  }
  if (landed > 1) emit(ctx, { type: 'hits', count: landed });
  return total;
}

/** Daño fijo (Sónico, Furia Dragón, Sísmico…) o KO de un golpe. Devuelve null si falla. */
function dealFixedDamage(ctx: Ctx, user: Battler, target: Battler, move: Move, kind: 'fixed' | 'ohko'): number | null {
  let amount: number;
  if (kind === 'ohko') {
    if (abilitySlug(target) === 'sturdy') {
      abilityActivates(ctx, target, 'No le afectan los ataques de KO.');
      return null;
    }
    amount = target.hp;
  } else {
    switch (move.effectId) {
      case EFFECT.sonicBoom: amount = 20; break;
      case EFFECT.dragonRage: amount = 40; break;
      case EFFECT.levelDamage: amount = user.level; break;
      case EFFECT.superFang: amount = Math.max(1, Math.floor(target.hp / 2)); break;
      case EFFECT.psywave: amount = Math.max(1, Math.floor((user.level * ctx.rng.int(50, 150)) / 100)); break;
      default: amount = Math.max(0, target.hp - user.hp); // Esfuerzo
    }
    if (amount <= 0) {
      emit(ctx, { type: 'failed' });
      return null;
    }
  }
  return damageHp(ctx, target, amount, 'move');
}

/** Drenaje, retroceso, efectos secundarios, autodestrucción y recarga una vez hecho el daño. */
function afterDamage(ctx: Ctx, side: Side, user: Battler, target: Battler, move: Move, total: number): void {
  const { rng } = ctx;
  const struggle = move.id === STRUGGLE_ID;
  const { meta } = move;

  if (struggle) {
    damageHp(ctx, user, Math.max(1, Math.floor(user.maxHp / 4)), 'recoil');
  } else if (meta.drain > 0 && total > 0) {
    const amount = Math.max(1, Math.floor((total * meta.drain) / 100));
    if (abilitySlug(target) === 'liquid-ooze') {
      abilityActivates(ctx, target, 'Daña a quien le drena.');
      damageHp(ctx, user, amount, 'liquid-ooze');
    } else healHp(ctx, user, amount);
  } else if (meta.drain < 0 && total > 0 && !preventsRecoil(user)) {
    damageHp(ctx, user, Math.max(1, Math.floor((total * -meta.drain) / 100)), 'recoil');
  }

  // Efectos secundarios sobre el objetivo
  if (target.hp > 0 && total > 0 && !struggle && !blocksSecondary(target)) {
    const mult = secondaryChanceMultiplier(user);
    const status = statusOf(move);
    if (status && meta.ailmentChance > 0 && rng.int(1, 100) <= meta.ailmentChance * mult) {
      inflictStatus(ctx, target, status, user, false);
    }
    if (meta.flinchChance > 0 && !target.movedThisTurn && !blocksFlinch(target) && rng.int(1, 100) <= meta.flinchChance * mult) {
      target.flinched = true;
    }
    if (meta.category === 6 && meta.statChanges.length && rng.int(1, 100) <= (meta.statChance || 100) * mult) {
      for (const c of meta.statChanges) changeStage(ctx, target, c.stat, c.change, user);
    }
  }
  // Mejoras o penalizaciones propias (Sofoco, A Bocajarro, Ataque Óseo…)
  if (meta.category === 7 && meta.statChanges.length && user.hp > 0 && rng.int(1, 100) <= (meta.statChance || 100)) {
    for (const c of meta.statChanges) changeStage(ctx, user, c.stat, c.change, null);
  }

  const targetSide = otherSide(side);
  if (move.effectId === EFFECT.selfDestruct) {
    damageHp(ctx, user, user.hp, 'selfdestruct');
    checkFaints(ctx, [side, targetSide]);
    return;
  }
  if (move.flags.recharge && target.hp > 0) user.recharging = true;
  checkFaints(ctx, [targetSide, side]);
}

// ---------------------------------------------------------------------------------------------
// Ataques de estado
// ---------------------------------------------------------------------------------------------

function useStatusOnFoe(ctx: Ctx, user: Battler, target: Battler, move: Move): void {
  if (move.meta.category === 1) {
    inflictStatus(ctx, target, statusOf(move)!, user, true);
    return;
  }
  for (const c of move.meta.statChanges) changeStage(ctx, target, c.stat, c.change, user);
}

function useSelfMove(ctx: Ctx, user: Battler, move: Move): void {
  if (move.effectId === EFFECT.rest) {
    if (user.hp === user.maxHp || user.status === 'sleep' || blocksStatus(user, 'sleep')) {
      emit(ctx, { type: 'failed' });
      return;
    }
    user.status = null;
    healHp(ctx, user, user.maxHp - user.hp);
    inflictStatus(ctx, user, 'sleep', null, false);
    user.sleepTurns = 2;
    return;
  }
  if (move.meta.category === 3) {
    const healed = healHp(ctx, user, Math.floor((user.maxHp * move.meta.healing) / 100));
    if (healed === 0) emit(ctx, { type: 'failed' });
    return;
  }
  for (const c of move.meta.statChanges) changeStage(ctx, user, c.stat, c.change, null);
}

// ---------------------------------------------------------------------------------------------
// Final de turno
// ---------------------------------------------------------------------------------------------

function endOfTurn(ctx: Ctx): void {
  const { battle } = ctx;
  const order = ([0, 1] as const)
    .map((side) => ({ side, speed: effectiveSpeed(activeOf(battle, side)) }))
    .sort((a, b) => b.speed - a.speed || a.side - b.side)
    .map((e) => e.side);

  for (const side of order) {
    const b = activeOf(battle, side);
    if (b.hp <= 0) continue;
    if (b.status === 'burn') damageHp(ctx, b, Math.max(1, Math.floor(b.maxHp / 16)), 'burn');
    else if (b.status === 'poison') damageHp(ctx, b, Math.max(1, Math.floor(b.maxHp / 8)), 'poison');
    else if (b.status === 'toxic') {
      damageHp(ctx, b, Math.max(1, Math.floor((b.maxHp * b.toxicCount) / 16)), 'poison');
      b.toxicCount = Math.min(15, b.toxicCount + 1);
    }
    if (b.hp > 0) onEndTurn(ctx, b);
    checkFaints(ctx, [side]);
    if (finishIfOver(ctx)) return;
  }
  for (const side of [0, 1] as const) {
    const b = activeOf(battle, side);
    b.flinched = false;
    b.movedThisTurn = false;
  }
}
