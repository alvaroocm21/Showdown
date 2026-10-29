import type { Rng } from '../rng';
import type { Move } from '../types';
import {
  abilityBlocksMove, abilitySlug, alwaysMaxHits, bracketBonus, blocksCrit, blocksRecoil, blocksSecondary,
  cannotFlinch, critBonus, flinchBonus, forcesCrit, hasAnchor, hasMoldBreaker, hasPressure, hasSheerForce, hasSturdy, invertsDrain,
  isChoiceLocked, isTruant, neverMisses, priorityBonus, reflectsStatusMoves, resolveMoveType, runAfterHit, runBeforeMove, runFainted,
  runFlinched, runImmuneEffect, runKnockOut, secondaryChanceMultiplier, setBreaking, sleepDecrement, absorbsHit, accuracyFactor,
} from './abilities';
import { computeMoveDamage, critChance, effectivenessOf } from './damage';
import type { CantMoveReason } from './events';
import { effectiveWeather, setTerrain, setWeather, weatherFor } from './field';
import {
  EFFECT, FORCE_SWITCH_DAMAGE, FORCE_SWITCH_STATUS, TERRAIN_MOVES, WEATHER_MOVES, hasSecondary, moveKind, rollHitCount, statusOf, targetsUser,
  variablePower, type MoveKind,
} from './moves';
import {
  abilityActivates, changeStage, checkFaints, confuse, cureStatus, damageHp, emit, healHp, inflictStatus, statusBlock, type Ctx,
} from './ops';
import { accuracyMultiplier, clampStage } from './stages';
import { STRUGGLE_ID, activeOf, moveOf, otherSide, type Battle, type Battler, type Side } from './state';
import { doSwitch } from './switching';
import { makeZMove } from './zmoves';

export interface MoveRequest {
  /** Posición del ataque (0-3), o -1 para Forcejeo. */
  slot: number;
  /** Usar la versión Z del ataque. */
  z?: boolean;
}

export const moveForSlot = (b: Battler, slot: number): Move => (slot === -1 ? moveOf(STRUGGLE_ID) : moveOf(b.moves[slot]!.moveId));

/** Prioridad real del ataque de `user`: la del ataque más la que dan sus habilidades (Bromista, Alas Vendaval…). */
export function effectivePriority(battle: Battle, user: Battler, target: Battler, move: Move): number {
  return move.priority + priorityBonus({ battle, user, target, move });
}

/** Subnivel dentro de la prioridad (Mano Rápida, Rezagado…). */
export const orderBracket = (battle: Battle, user: Battler, target: Battler, move: Move, rng: Rng): number =>
  bracketBonus({ battle, user, target, move }, rng);

/** Tipo y potencia definitivos del ataque (Piel Celeste, Normalizar, Bola Clima…). */
export function resolveMove(battle: Battle, user: Battler, target: Battler, base: Move): { move: Move; powerBoost: number } {
  let move = base;
  const weather = weatherFor(battle, user);
  if (base.slug === 'weather-ball' && weather) {
    const type = weather === 'sun' || weather === 'harsh-sun' ? 'fire' : weather === 'rain' || weather === 'heavy-rain' ? 'water' : weather === 'sand' ? 'rock' : weather === 'snow' ? 'ice' : 'normal';
    move = { ...move, type };
  }
  if (base.slug === 'terrain-pulse' && battle.field.terrain) {
    const type = { electric: 'electric', grassy: 'grass', misty: 'fairy', psychic: 'psychic' }[battle.field.terrain] as Move['type'];
    move = { ...move, type };
  }
  const r = resolveMoveType({ battle, user, target, move });
  if (r) return { move: { ...move, type: r.type }, powerBoost: r.power };
  return { move, powerBoost: 1 };
}

// ---------------------------------------------------------------------------------------------
// Antes de actuar
// ---------------------------------------------------------------------------------------------

/** Comprobaciones antes de actuar: recarga, sueño, congelación, retroceso, holgazanería, confusión y parálisis. */
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
  if (user.flinched) {
    runFlinched(ctx, user);
    return cant('flinch');
  }
  if (isTruant(user) && user.loafing) {
    user.loafing = false;
    return cant('truant');
  }
  if (user.confused > 0) {
    user.confused--;
    if (user.confused === 0) {
      emit(ctx, { type: 'volatile', side, pokemon: user.name, kind: 'confusion', on: false });
    } else if (ctx.rng.next() < 1 / 3) {
      // Se hiere a sí mismo: ataque físico sin tipo de 40 de potencia con sus propias estadísticas
      const hit = computeMoveDamage(user, user, { ...moveOf(STRUGGLE_ID), power: 40 }, { battle: ctx.battle, crit: false, roll: ctx.rng.int(85, 100) });
      damageHp(ctx, user, hit, 'confusion');
      checkFaints(ctx, [side]);
      return false;
    }
  }
  if (user.status === 'paralysis' && ctx.rng.next() < 0.25) return cant('paralysis');
  return true;
}

function hitsTarget(ctx: Ctx, user: Battler, target: Battler, move: Move, ohko: boolean): boolean {
  if (ohko) {
    if (user.level < target.level) return false;
    return ctx.rng.int(1, 100) <= 30 + user.level - target.level;
  }
  if (move.accuracy === null || neverMisses(user, target)) return true;
  const weather = effectiveWeather(ctx.battle);
  // Algunos ataques cambian de precisión con el clima
  let accuracy = move.accuracy;
  if (move.slug === 'thunder' || move.slug === 'hurricane') accuracy = weather === 'rain' || weather === 'heavy-rain' ? 100 : weather === 'sun' || weather === 'harsh-sun' ? 50 : accuracy;
  if (move.slug === 'blizzard' && weather === 'snow') accuracy = 100;
  const stage = clampStage(user.stages.acc - target.stages.eva);
  const chance = Math.floor(accuracy * accuracyMultiplier(stage) * accuracyFactor({ battle: ctx.battle, user, target, move }));
  return ctx.rng.int(1, 100) <= chance;
}

// ---------------------------------------------------------------------------------------------
// Usar un ataque
// ---------------------------------------------------------------------------------------------

/** El Pokémon activo del bando `side` usa un ataque (o lo suelta una vez cargado). */
export function useMove(ctx: Ctx, side: Side, req: MoveRequest, copied?: Move): void {
  const { battle, rng } = ctx;
  const user = activeOf(battle, side);
  const targetSide = otherSide(side);
  const target = activeOf(battle, targetSide);

  let slot = req.slot;
  let releasing = false;
  let baseMove: Move;
  if (copied) {
    // Bailarín: copia el ataque de baile del rival sin gastar PP ni comprobar si puede actuar
    baseMove = copied;
  } else {
    user.movedThisTurn = true;
    if (!canAct(ctx, side, user)) {
      user.charging = null;
      return;
    }
    releasing = user.charging !== null;
    slot = releasing ? user.charging! : req.slot;
    user.charging = null;
    baseMove = moveForSlot(user, slot);
  }
  const wasFirstTurn = user.firstTurn;
  user.firstTurn = false;
  if (slot >= 0) user.lastMoveId = baseMove.id;

  // Movimiento Z: se gasta al ejecutarlo (no si no ha podido moverse)
  let move0 = baseMove;
  if (req.z && !releasing && !copied && !battle.sides[side].zUsed) {
    battle.sides[side].zUsed = true;
    emit(ctx, { type: 'zmove', side, pokemon: user.name });
    move0 = makeZMove(baseMove);
  }

  if (slot >= 0 && !releasing && !copied) {
    const bm = user.moves[slot]!;
    bm.pp -= 1;
    if (hasPressure(target) && !targetsUser(move0)) bm.pp = Math.max(0, bm.pp - 1);
    if (isChoiceLocked(user) && user.locked === null) user.locked = slot;
  }

  runBeforeMove(ctx, user, move0);
  const { move, powerBoost } = resolveMove(battle, user, target, move0);
  emit(ctx, { type: 'move', side, pokemon: user.name, move: move.name, moveType: move.type });

  const sunBeam = (move.slug === 'solar-beam' || move.slug === 'solar-blade') && ['sun', 'harsh-sun'].includes(weatherFor(battle, user) ?? '');
  if (move.flags.charge && !releasing && !copied && !sunBeam) {
    user.charging = slot;
    emit(ctx, { type: 'charge', side, pokemon: user.name });
    return;
  }
  if (isTruant(user)) user.loafing = true;

  const kind = moveKind(move);
  if (kind === 'none') {
    emit(ctx, { type: 'noEffect' });
    return;
  }

  // Ataques que no apuntan al rival: clima, terreno y efectos sobre uno mismo
  if (move.slug in WEATHER_MOVES || move.slug in TERRAIN_MOVES) {
    const done =
      move.slug in WEATHER_MOVES
        ? setWeather(ctx, WEATHER_MOVES[move.slug]!, null)
        : setTerrain(ctx, TERRAIN_MOVES[move.slug]!);
    if (!done) emit(ctx, { type: 'failed' });
    return;
  }
  if (kind === 'status' && targetsUser(move)) {
    useSelfMove(ctx, user, move);
    return;
  }

  // Condiciones propias de algunos ataques
  if ((move.effectId === EFFECT.fakeOut && !wasFirstTurn) || (move.effectId === EFFECT.dreamEater && target.status !== 'sleep')) {
    emit(ctx, { type: 'failed' });
    return;
  }
  if (move.effectId === EFFECT.selfDestruct) {
    const damp = ([user, target] as const).find((b) => !b.suppressed && abilitySlug(b) === 'damp');
    if (damp) {
      abilityActivates(ctx, damp, 'Impide que se use ese ataque.');
      emit(ctx, { type: 'failed' });
      return;
    }
  }

  // Rompemoldes: mientras dura este ataque, la habilidad del objetivo no estorba
  setBreaking(hasMoldBreaker(user) || (kind === 'status' && !user.suppressed && abilitySlug(user) === 'mycelium-might'));
  try {
    resolveHit(ctx, side, user, target, move, move0, kind, powerBoost);
  } finally {
    setBreaking(false);
  }

  // Bailarín: el otro Pokémon repite los ataques de baile
  if (move.flags.dance && !copied && target.hp > 0 && !target.suppressed && abilitySlug(target) === 'dancer' && battle.winner === null) {
    abilityActivates(ctx, target, 'Copia el baile.');
    useMove(ctx, targetSide, { slot: -2 }, baseMove);
  }
}

function resolveHit(ctx: Ctx, side: Side, user: Battler, target: Battler, move: Move, base: Move, kind: Exclude<MoveKind, 'none'>, powerBoost: number): void {
  const { battle } = ctx;
  const targetSide = otherSide(side);
  const priority = effectivePriority(battle, user, target, base);
  const boostedStatus = kind === 'status' && !user.suppressed && abilitySlug(user) === 'prankster';

  // Explosión y Autodestrucción debilitan al usuario aunque no lleguen a hacer daño.
  const failed = () => {
    if (move.effectId !== EFFECT.selfDestruct) return;
    damageHp(ctx, user, user.hp, 'selfdestruct');
    checkFaints(ctx, [side]);
  };

  const struggle = move.id === STRUGGLE_ID;
  const effectiveness = effectivenessOf(battle, user, target, move);
  const typeMatters = kind !== 'status' || move.slug === 'thunder-wave';
  if (typeMatters && effectiveness === 0) {
    emit(ctx, { type: 'immune', side: targetSide, pokemon: target.name });
    return failed();
  }
  // Los ataques de estado de un Pokémon con Bromista no afectan a los de tipo Siniestro
  if (boostedStatus && priority > 0 && target.types.includes('dark')) {
    emit(ctx, { type: 'immune', side: targetSide, pokemon: target.name });
    return;
  }
  if (!struggle && abilityBlocksMove({ battle, user, target, move, effectiveness, priority, boostedStatus })) {
    runImmuneEffect(ctx, user, target, move);
    return failed();
  }
  // Espejo Mágico: rebota los ataques de estado rebotables
  if (kind === 'status' && move.flags.reflectable && !targetsUser(move) && reflectsStatusMoves(target)) {
    abilityActivates(ctx, target, 'Rebota el ataque.');
    setBreaking(false);
    useStatusOnFoe(ctx, target, user, move);
    return;
  }
  // El clima extremo anula los ataques del tipo contrario
  const weather = effectiveWeather(battle);
  if (kind !== 'status' && ((weather === 'harsh-sun' && move.type === 'water') || (weather === 'heavy-rain' && move.type === 'fire'))) {
    emit(ctx, { type: 'failed' });
    return failed();
  }
  if (!hitsTarget(ctx, user, target, move, kind === 'ohko')) {
    emit(ctx, { type: 'miss', side, pokemon: user.name });
    return failed();
  }

  if (kind === 'status') {
    useStatusOnFoe(ctx, user, target, move);
    return;
  }

  const result =
    kind === 'damage'
      ? dealDamage(ctx, user, target, move, powerBoost, base)
      : dealFixedDamage(ctx, user, target, move, kind);
  if (result === null) return; // el ataque falló o no tuvo efecto

  afterDamage(ctx, side, user, target, move, result.total, result.last);
}

// ---------------------------------------------------------------------------------------------
// Ataques de daño
// ---------------------------------------------------------------------------------------------

function dealDamage(ctx: Ctx, user: Battler, target: Battler, move: Move, powerBoost: number, base: Move): { total: number; last: number } {
  const { rng, battle } = ctx;
  const power = variablePower(move, user, rng, battle);
  let hits = rollHitCount(move, rng, alwaysMaxHits(user));
  const parentalBond = hits === 1 && !user.suppressed && abilitySlug(user) === 'parental-bond' && !base.flags.charge && !base.flags.recharge && move.effectId !== EFFECT.selfDestruct;
  if (parentalBond) hits = 2;
  const movesLast = target.movedThisTurn;
  const mctx = { battle, user, target, move };
  let total = 0;
  let landed = 0;
  let last = 0;
  for (let i = 0; i < hits && target.hp > 0; i++) {
    const crit = !blocksCrit(target) && (forcesCrit(mctx) || rng.next() < critChance(move.meta.critRate + critBonus(mctx)));
    const roll = rng.int(85, 100);
    // Disfraz y Cara de Hielo anulan este golpe
    if (absorbsHit(ctx, user, target, move)) continue;
    const effectiveness = effectivenessOf(battle, user, target, move);
    let amount = computeMoveDamage(user, target, move, {
      battle, crit, roll, power, powerBoost, hitIndex: i, movesLast, extraFinal: parentalBond && i === 1 ? 0.25 : 1,
    });
    const sturdy = hasSturdy(target) && target.hp === target.maxHp && amount >= target.hp;
    if (sturdy) amount = target.hp - 1;
    amount = Math.min(target.hp, amount);
    damageHp(ctx, target, amount, 'move');
    total += amount;
    last = amount;
    landed++;
    if (crit) emit(ctx, { type: 'crit' });
    if (i === 0 && effectiveness !== 1) emit(ctx, { type: 'effectiveness', multiplier: effectiveness });
    if (sturdy) abilityActivates(ctx, target, '¡Aguanta el golpe!');
    if (target.status === 'freeze' && move.type === 'fire') cureStatus(ctx, target);
    runAfterHit(ctx, user, target, move, amount, crit);
  }
  if (landed > 1) emit(ctx, { type: 'hits', count: landed });
  return { total, last };
}

/** Daño fijo (Sónico, Furia Dragón, Sísmico…) o KO de un golpe. Devuelve null si falla. */
function dealFixedDamage(ctx: Ctx, user: Battler, target: Battler, move: Move, kind: 'fixed' | 'ohko'): { total: number; last: number } | null {
  let amount: number;
  if (kind === 'ohko') {
    if (hasSturdy(target)) {
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
  const dealt = damageHp(ctx, target, amount, 'move');
  return { total: dealt, last: dealt };
}

/** Drenaje, retroceso, efectos secundarios, autodestrucción y recarga una vez hecho el daño. */
function afterDamage(ctx: Ctx, side: Side, user: Battler, target: Battler, move: Move, total: number, lastHit: number): void {
  const { rng } = ctx;
  const struggle = move.id === STRUGGLE_ID;
  const { meta } = move;
  const sheer = hasSheerForce(user) && hasSecondary(move);

  if (struggle) {
    damageHp(ctx, user, Math.max(1, Math.floor(user.maxHp / 4)), 'recoil');
  } else if (meta.drain > 0 && total > 0) {
    const amount = Math.max(1, Math.floor((total * meta.drain) / 100));
    if (invertsDrain(target)) {
      abilityActivates(ctx, target, 'Daña a quien le drena.');
      damageHp(ctx, user, amount, 'liquid-ooze');
    } else healHp(ctx, user, amount);
  } else if (meta.drain < 0 && total > 0 && !blocksRecoil(user)) {
    damageHp(ctx, user, Math.max(1, Math.floor((total * -meta.drain) / 100)), 'recoil');
  }

  // Efectos secundarios sobre el objetivo
  if (target.hp > 0 && total > 0 && !struggle && !sheer && !blocksSecondary(target)) {
    const mult = secondaryChanceMultiplier(user);
    const status = statusOf(move);
    if (status && meta.ailmentChance > 0 && rng.int(1, 100) <= meta.ailmentChance * mult) {
      inflictStatus(ctx, target, status, user, false);
    }
    if (meta.ailmentId === 6 && meta.ailmentChance > 0 && rng.int(1, 100) <= meta.ailmentChance * mult) {
      confuse(ctx, target, user, false);
    }
    const flinchChance = meta.flinchChance || flinchBonus(user);
    if (flinchChance > 0 && !target.movedThisTurn && !cannotFlinch(target) && rng.int(1, 100) <= flinchChance * mult) {
      target.flinched = true;
    }
    if (meta.category === 6 && meta.statChanges.length && rng.int(1, 100) <= (meta.statChance || 100) * mult) {
      for (const c of meta.statChanges) changeStage(ctx, target, c.stat, c.change, user);
    }
  }
  // Mejoras o penalizaciones propias (Sofoco, A Bocajarro, Ataque Óseo…)
  if (!sheer && meta.category === 7 && meta.statChanges.length && user.hp > 0 && rng.int(1, 100) <= (meta.statChance || 100)) {
    for (const c of meta.statChanges) changeStage(ctx, user, c.stat, c.change, null);
  }

  // Cambio forzado del rival (Cola Dragón, Llave Giro)
  if (FORCE_SWITCH_DAMAGE.has(move.slug) && target.hp > 0 && total > 0) forceSwitchFoe(ctx, user, target);

  const targetSide = otherSide(side);
  if (move.effectId === EFFECT.selfDestruct) {
    damageHp(ctx, user, user.hp, 'selfdestruct');
    checkFaints(ctx, [side, targetSide]);
    return;
  }
  if (move.flags.recharge && target.hp > 0) user.recharging = true;
  checkFaints(ctx, [targetSide, side]);

  // Reacciones a debilitar o ser debilitado (Venganza Póstuma, Intrépido, Moxie…)
  if (target.fainted) {
    runFainted(ctx, target, user, move, lastHit);
    if (user.hp > 0) runKnockOut(ctx, user, target);
    checkFaints(ctx, [side, targetSide]);
  }
}

// ---------------------------------------------------------------------------------------------
// Ataques de estado
// ---------------------------------------------------------------------------------------------

/** Cambia al rival por otro Pokémon vivo al azar. Falla si no queda ninguno o si su habilidad lo ancla. */
export function forceSwitchFoe(ctx: Ctx, user: Battler, target: Battler): boolean {
  const { battle, rng } = ctx;
  const side = battle.sides[otherSide(sideIndex(battle, user))];
  const options = side.team.flatMap((b, i) => (i !== side.active && b.hp > 0 ? [i] : []));
  if (hasAnchor(target)) {
    abilityActivates(ctx, target, 'No se le puede cambiar de sitio.');
    return false;
  }
  if (!options.length) {
    emit(ctx, { type: 'failed' });
    return false;
  }
  doSwitch(ctx, otherSide(sideIndex(battle, user)), rng.pick(options));
  return true;
}

const sideIndex = (battle: Battle, b: Battler): Side => (battle.sides[0].team.includes(b) ? 0 : 1);

function useStatusOnFoe(ctx: Ctx, user: Battler, target: Battler, move: Move): void {
  if (FORCE_SWITCH_STATUS.has(move.slug)) {
    forceSwitchFoe(ctx, user, target);
    return;
  }
  if (move.slug === 'disable') {
    const id = target.lastMoveId;
    if (id === null || target.disabled || !target.moves.some((m) => m.moveId === id)) emit(ctx, { type: 'failed' });
    else {
      target.disabled = { moveId: id, turns: 4 };
      emit(ctx, { type: 'volatile', side: sideIndex(ctx.battle, target), pokemon: target.name, kind: 'disable', on: true });
    }
    return;
  }
  if (move.slug === 'perish-song') {
    let any = false;
    for (const b of [user, target]) {
      if (b.perish === 0 && b.hp > 0) {
        b.perish = 4; // se resta al final de este mismo turno: el aviso empieza en 3
        any = true;
        emit(ctx, { type: 'volatile', side: sideIndex(ctx.battle, b), pokemon: b.name, kind: 'perish', on: true, turns: 3 });
      }
    }
    if (!any) emit(ctx, { type: 'failed' });
    return;
  }
  if (move.meta.category === 1) {
    if (move.meta.ailmentId === 6) confuse(ctx, target, user, true);
    else inflictStatus(ctx, target, statusOf(move)!, user, true);
    return;
  }
  for (const c of move.meta.statChanges) changeStage(ctx, target, c.stat, c.change, user);
  if (move.meta.category === 5) confuse(ctx, target, user, false); // Contoneo, Adulación
}

/** Fracción que curan Sol Matinal, Síntesis y Luz Lunar según el clima. */
function weatherHeal(battle: Battle, user: Battler): number {
  const w = weatherFor(battle, user);
  return w === 'sun' || w === 'harsh-sun' ? 2 / 3 : w ? 1 / 4 : 1 / 2;
}
const WEATHER_HEALERS: ReadonlySet<string> = new Set(['morning-sun', 'synthesis', 'moonlight']);

function useSelfMove(ctx: Ctx, user: Battler, move: Move): void {
  if (move.effectId === EFFECT.rest) {
    // Descanso cura incluso con un estado, pero no si ya está dormido o no puede dormir (Insomnio, Terreno Eléctrico…)
    const previous = user.status;
    user.status = null;
    const blocked = statusBlock(user, 'sleep', ctx.battle, null);
    user.status = previous;
    if (user.hp === user.maxHp || previous === 'sleep' || blocked) {
      emit(ctx, { type: 'failed' });
      return;
    }
    cureStatus(ctx, user);
    healHp(ctx, user, user.maxHp - user.hp);
    inflictStatus(ctx, user, 'sleep', null, false);
    user.sleepTurns = 2;
    return;
  }
  if (move.meta.category === 3) {
    const fraction = WEATHER_HEALERS.has(move.slug) ? weatherHeal(ctx.battle, user) : move.meta.healing / 100;
    const healed = healHp(ctx, user, Math.floor(user.maxHp * fraction));
    if (healed === 0) emit(ctx, { type: 'failed' });
    return;
  }
  const sun = ['sun', 'harsh-sun'].includes(weatherFor(ctx.battle, user) ?? '');
  for (const c of move.meta.statChanges) changeStage(ctx, user, c.stat, move.slug === 'growth' && sun ? c.change * 2 : c.change, null);
}
