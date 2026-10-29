import type { Rng } from '../rng';
import { abilityBlocksMove, accuracyFactor } from '../battle/abilities';
import { computeMoveDamage, effectivenessOf } from '../battle/damage';
import { effectivePriority, moveForSlot, resolveMove } from '../battle/exec';
import { canUseZ, legalMoveSlots, legalSwitchTargets, megaOptions, type Action } from '../battle/engine';
import { EFFECT, TERRAIN_MOVES, WEATHER_MOVES, expectedPower, moveKind, statusOf, targetsUser } from '../battle/moves';
import { statusBlock } from '../battle/ops';
import { activeOf, moveOf, otherSide, STRUGGLE_ID, type Battle, type Battler, type Side } from '../battle/state';
import { makeZMove } from '../battle/zmoves';
import type { Move } from '../types';

const AVERAGE_ROLL = 92;

/** Daño esperado (en PS) de un ataque de daño, sin ruido. 0 si no puede hacer nada. */
export function expectedDamage(battle: Battle, user: Battler, target: Battler, base: Move): number {
  const kind = moveKind(base);
  if (kind === 'status' || kind === 'none') return 0;
  const { move, powerBoost } = resolveMove(battle, user, target, base);
  const effectiveness = effectivenessOf(battle, user, target, move);
  const priority = effectivePriority(battle, user, target, base);
  if (effectiveness === 0 || (move.id !== STRUGGLE_ID && abilityBlocksMove({ battle, user, target, move, effectiveness, priority, boostedStatus: false }))) return 0;
  const hit = ((move.accuracy ?? 100) / 100) * (move.accuracy === null ? 1 : accuracyFactor({ battle, user, target, move }));
  if (kind === 'ohko') return target.hp * 0.3;
  if (kind === 'fixed') {
    switch (move.effectId) {
      case EFFECT.sonicBoom: return Math.min(target.hp, 20) * hit;
      case EFFECT.dragonRage: return Math.min(target.hp, 40) * hit;
      case EFFECT.levelDamage: return Math.min(target.hp, user.level) * hit;
      case EFFECT.superFang: return Math.floor(target.hp / 2) * hit;
      case EFFECT.psywave: return user.level * hit;
      default: return Math.max(0, target.hp - user.hp) * hit;
    }
  }
  const hits = move.meta.minHits !== null && move.meta.maxHits !== null ? (move.meta.minHits === move.meta.maxHits ? move.meta.minHits : 3.1) : 1;
  let dmg = computeMoveDamage(user, target, move, { battle, crit: false, roll: AVERAGE_ROLL, power: expectedPower(move, user), powerBoost }) * hits * hit;
  if (move.flags.charge) dmg *= 0.55;
  if (move.flags.recharge && dmg < target.hp) dmg *= 0.6;
  if (move.effectId === EFFECT.selfDestruct && user.hp > user.maxHp * 0.35 && dmg < target.hp) dmg *= 0.4;
  if (move.effectId === EFFECT.dreamEater && target.status !== 'sleep') return 0;
  return dmg;
}

const AILMENT_VALUE = { sleep: 0.45, paralysis: 0.3, burn: 0.3, poison: 0.22, toxic: 0.32, freeze: 0.4 } as const;

/** Valor (en PS equivalentes) de un ataque de estado. */
function statusMoveValue(battle: Battle, user: Battler, target: Battler, move: Move): number {
  const hit = ((move.accuracy ?? 100) / 100) * accuracyFactor({ battle, user, target, move });
  const { meta } = move;
  if (move.effectId === EFFECT.rest) {
    return user.hp < user.maxHp * 0.4 && !user.status ? (user.maxHp - user.hp) * 0.7 : 0;
  }
  // Clima y terreno: útiles si no hay ya uno igual y quedan turnos
  if (move.slug in WEATHER_MOVES) return battle.field.weather === WEATHER_MOVES[move.slug] ? 0 : target.maxHp * 0.12;
  if (move.slug in TERRAIN_MOVES) return battle.field.terrain === TERRAIN_MOVES[move.slug] ? 0 : target.maxHp * 0.1;
  if (move.slug === 'roar' || move.slug === 'whirlwind') return target.stages.atk + target.stages.spa > 1 ? target.maxHp * 0.3 : 0;
  if (move.slug === 'disable') return target.disabled ? 0 : target.maxHp * 0.08;
  if (move.slug === 'perish-song') return user.perish || target.perish ? 0 : target.maxHp * 0.1;
  if (meta.category === 3) {
    return user.hp < user.maxHp * 0.55 ? Math.min(user.maxHp - user.hp, (user.maxHp * meta.healing) / 100) * 0.9 : 0;
  }
  if (meta.category === 1 || meta.category === 5) {
    if (meta.ailmentId === 6) return target.confused || move.accuracy === null ? 0 : target.maxHp * 0.2 * hit;
    const status = statusOf(move);
    if (!status) return 0;
    if (statusBlock(target, status, battle, user)) return 0;
    const effectiveness = effectivenessOf(battle, user, target, move);
    if (abilityBlocksMove({ battle, user, target, move, effectiveness, priority: effectivePriority(battle, user, target, move), boostedStatus: false })) return 0;
    if (move.slug === 'thunder-wave' && effectiveness === 0) return 0;
    const physicalFoe = target.stats.atk >= target.stats.spa;
    const factor = status === 'burn' && !physicalFoe ? 0.12 : AILMENT_VALUE[status];
    return target.maxHp * factor * hit;
  }
  // Mejoras y bajadas de estadísticas
  let value = 0;
  const onSelf = targetsUser(move);
  for (const c of meta.statChanges) {
    const holder = onSelf ? user : target;
    const current = holder.stages[c.stat];
    if (onSelf ? c.change > 0 && current >= 2 : c.change < 0 && current <= -2) continue;
    if (onSelf ? c.change < 0 : c.change > 0) continue; // empeora al usuario o mejora al rival
    const offense = c.stat === 'atk' ? user.stats.atk >= user.stats.spa : c.stat === 'spa' ? user.stats.spa > user.stats.atk : true;
    value += (offense ? 0.13 : 0.07) * target.maxHp * Math.abs(c.change);
  }
  return onSelf ? value : value * hit;
}

function scoreMove(battle: Battle, user: Battler, target: Battler, move: Move): number {
  const kind = moveKind(move);
  if (kind === 'none') return 0;
  if (kind === 'status') return statusMoveValue(battle, user, target, move);
  const dmg = expectedDamage(battle, user, target, move);
  const capped = Math.min(dmg, target.hp);
  return capped * (dmg >= target.hp ? 1.3 : 1) + (move.priority > 0 && dmg >= target.hp ? 0.3 * target.hp : 0);
}

/** Mejor ataque del Pokémon contra el rival: posición y puntuación (sin ruido). */
function bestMove(battle: Battle, user: Battler, target: Battler): { slot: number; score: number } {
  let best = { slot: legalMoveSlots(user)[0] ?? -1, score: -1 };
  for (const slot of legalMoveSlots(user)) {
    const score = scoreMove(battle, user, target, moveForSlot(user, slot));
    if (score > best.score) best = { slot, score };
  }
  return best;
}

/** Mejor daño esperado como fracción de los PS actuales del objetivo. */
function threat(battle: Battle, attacker: Battler, defender: Battler): number {
  let best = 0;
  for (const bm of attacker.moves) {
    const move = moveOf(bm.moveId);
    if (moveKind(move) === 'status') continue;
    best = Math.max(best, expectedDamage(battle, attacker, defender, move));
  }
  return Math.min(1.5, best / Math.max(1, defender.hp));
}

/** Cuánto le conviene a `mine` enfrentarse a `foe` (positivo = ventaja). */
function matchup(battle: Battle, mine: Battler, foe: Battler): number {
  let score = threat(battle, mine, foe) - threat(battle, foe, mine);
  if (mine.stats.spe > foe.stats.spe) score += 0.15;
  return score;
}

/** Cuando se debilita el Pokémon activo: el del equipo que mejor se enfrenta al rival. */
export function chooseReplacement(battle: Battle, side: Side): number {
  const s = battle.sides[side];
  const foe = activeOf(battle, otherSide(side));
  let best = -1;
  let bestScore = -Infinity;
  s.team.forEach((b, i) => {
    if (b.hp <= 0 || i === s.active) return;
    const score = matchup(battle, b, foe) + (b.hp / b.maxHp) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Decide si cambiar: sin forma de dañar al rival, o en clara desventaja con un compañero mucho mejor. */
function considerSwitch(battle: Battle, side: Side, rng: Rng): Action | null {
  const user = activeOf(battle, side);
  const foe = activeOf(battle, otherSide(side));
  const options = legalSwitchTargets(battle, side);
  if (!options.length || battle.turn - battle.sides[side].enteredTurn < 1) return null;

  const current = matchup(battle, user, foe);
  const canHurt = bestMove(battle, user, foe).score > 0;
  let best = -1;
  let bestScore = -Infinity;
  for (const i of options) {
    const mate = battle.sides[side].team[i]!;
    const score = matchup(battle, mate, foe) + (mate.hp / mate.maxHp) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  const stuck = !canHurt && bestScore > current;
  const disadvantage = current < -0.55 && bestScore > current + 0.7;
  if ((stuck || disadvantage) && rng.next() < 0.75) return { type: 'switch', to: best };
  return null;
}

/** Megaevolución: siempre que puede, con la forma de mayor total de estadísticas. */
function pickMega(battle: Battle, side: Side): number | undefined {
  const total = (s: { baseStats: Record<string, number> }) => Object.values(s.baseStats).reduce((a, b) => a + b, 0);
  const options = megaOptions(battle, side);
  if (!options.length) return undefined;
  return [...options].sort((a, b) => total(b) - total(a))[0]!.id;
}

/**
 * ¿Usar el movimiento Z? Si remata o hace mucho daño. Devuelve la posición del ataque a convertir o null.
 * Es de un solo uso, así que se espera a una buena ocasión (y se gasta si el Pokémon está a punto de caer).
 */
function pickZ(battle: Battle, side: Side, user: Battler, foe: Battler, rng: Rng): number | null {
  if (battle.sides[side].zUsed) return null;
  let best: { slot: number; dmg: number } | null = null;
  for (const slot of legalMoveSlots(user)) {
    if (slot < 0) continue;
    const move = moveForSlot(user, slot);
    if (!canUseZ(battle, side, move)) continue;
    const z = makeZMove(move);
    const dmg = expectedDamage(battle, user, foe, z);
    if (!best || dmg > best.dmg) best = { slot, dmg };
  }
  if (!best) return null;
  const kills = best.dmg >= foe.hp;
  const big = best.dmg >= foe.maxHp * 0.55;
  const dying = user.hp < user.maxHp * 0.35 && best.dmg >= foe.hp * 0.5;
  const lastOne = battle.sides[side].team.filter((b) => b.hp > 0).length === 1 && best.dmg >= foe.hp * 0.4;
  if ((kills || (big && battle.turn >= 2) || dying || lastOne) && rng.next() < 0.85) return best.slot;
  return null;
}

/**
 * IA del rival: elige el ataque con más valor esperado (daño según tipos, STAB, precisión, clima; estados, mejoras y
 * curación cuando compensan) con algo de ruido; megaevoluciona; usa el movimiento Z en una buena ocasión; y cambia de
 * Pokémon si está en clara desventaja.
 */
export function chooseAction(battle: Battle, side: Side, rng: Rng): Action {
  const user = activeOf(battle, side);
  const foe = activeOf(battle, otherSide(side));
  if (user.recharging) return { type: 'move', slot: 0 };
  if (user.charging !== null) return { type: 'move', slot: user.charging };

  const sw = considerSwitch(battle, side, rng);
  if (sw) return sw;

  const mega = pickMega(battle, side);
  const slots = legalMoveSlots(user);
  if (slots[0] === -1) return { type: 'move', slot: -1, mega };

  const zSlot = pickZ(battle, side, user, foe, rng);
  if (zSlot !== null) return { type: 'move', slot: zSlot, z: true, mega };

  let bestSlot = slots[0]!;
  let bestScore = -Infinity;
  for (const slot of slots) {
    const move = moveForSlot(user, slot);
    const base = scoreMove(battle, user, foe, move);
    // Un ataque sin utilidad solo se usa si no hay nada mejor
    const score = base > 0 ? base * (0.8 + 0.2 * rng.next()) : 0.01 * rng.next();
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }
  return { type: 'move', slot: bestSlot, mega };
}

