import type { Rng } from '../rng';
import { abilityImmune, accuracyMod, blocksStatus } from '../battle/abilities';
import { computeMoveDamage } from '../battle/damage';
import { legalMoveSlots, legalSwitchTargets, type Action } from '../battle/engine';
import { EFFECT, expectedPower, moveKind, statusOf, targetsUser } from '../battle/moves';
import { statusBlock } from '../battle/ops';
import { activeOf, moveOf, otherSide, STRUGGLE_ID, type Battle, type Battler, type Side } from '../battle/state';
import { typeEffectiveness } from '../battle/typeEffect';
import type { Move } from '../types';

const AVERAGE_ROLL = 92;

/** Daño esperado (en PS) de un ataque de daño, sin ruido. 0 si no puede hacer nada. */
export function expectedDamage(user: Battler, target: Battler, move: Move): number {
  const kind = moveKind(move);
  const effectiveness = move.id === STRUGGLE_ID ? 1 : typeEffectiveness(move.type, target.types);
  if (kind === 'status' || kind === 'none') return 0;
  if (effectiveness === 0 || abilityImmune(target, move, effectiveness)) return 0;
  const hit = ((move.accuracy ?? 100) / 100) * accuracyMod(user, move);
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
  let dmg = computeMoveDamage(user, target, move, { crit: false, roll: AVERAGE_ROLL, power: expectedPower(move, user) }) * hits * hit;
  if (move.flags.charge) dmg *= 0.55;
  if (move.flags.recharge && dmg < target.hp) dmg *= 0.6;
  if (move.effectId === EFFECT.selfDestruct && user.hp > user.maxHp * 0.35 && dmg < target.hp) dmg *= 0.4;
  if (move.effectId === EFFECT.dreamEater && target.status !== 'sleep') return 0;
  return dmg;
}

const AILMENT_VALUE = { sleep: 0.45, paralysis: 0.3, burn: 0.3, poison: 0.22, toxic: 0.32, freeze: 0.4 } as const;

/** Valor (en PS equivalentes) de un ataque de estado. */
function statusMoveValue(user: Battler, target: Battler, move: Move): number {
  const hit = ((move.accuracy ?? 100) / 100) * accuracyMod(user, move);
  const { meta } = move;
  if (move.effectId === EFFECT.rest) {
    return user.hp < user.maxHp * 0.4 && !user.status && !blocksStatus(user, 'sleep') ? (user.maxHp - user.hp) * 0.7 : 0;
  }
  if (meta.category === 3) {
    return user.hp < user.maxHp * 0.55 ? Math.min(user.maxHp - user.hp, (user.maxHp * meta.healing) / 100) * 0.9 : 0;
  }
  if (meta.category === 1) {
    const status = statusOf(move);
    if (!status || statusBlock(target, status)) return 0;
    if (abilityImmune(target, move, typeEffectiveness(move.type, target.types))) return 0;
    if (move.slug === 'thunder-wave' && typeEffectiveness(move.type, target.types) === 0) return 0;
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

function scoreMove(user: Battler, target: Battler, move: Move): number {
  const kind = moveKind(move);
  if (kind === 'none') return 0;
  if (kind === 'status') return statusMoveValue(user, target, move);
  const dmg = expectedDamage(user, target, move);
  const capped = Math.min(dmg, target.hp);
  return capped * (dmg >= target.hp ? 1.3 : 1) + (move.priority > 0 && dmg >= target.hp ? 0.3 * target.hp : 0);
}

/** Mejor ataque del Pokémon contra el rival: posición y puntuación (sin ruido). */
function bestMove(user: Battler, target: Battler): { slot: number; score: number } {
  let best = { slot: legalMoveSlots(user)[0] ?? -1, score: -1 };
  for (const slot of legalMoveSlots(user)) {
    const move = slot === -1 ? moveOf(STRUGGLE_ID) : moveOf(user.moves[slot]!.moveId);
    const score = scoreMove(user, target, move);
    if (score > best.score) best = { slot, score };
  }
  return best;
}

/** Mejor daño esperado como fracción de los PS actuales del objetivo. */
function threat(attacker: Battler, defender: Battler): number {
  let best = 0;
  for (const bm of attacker.moves) {
    const move = moveOf(bm.moveId);
    if (moveKind(move) === 'status') continue;
    best = Math.max(best, expectedDamage(attacker, defender, move));
  }
  return Math.min(1.5, best / Math.max(1, defender.hp));
}

/** Cuánto le conviene a `mine` enfrentarse a `foe` (positivo = ventaja). */
function matchup(mine: Battler, foe: Battler): number {
  let score = threat(mine, foe) - threat(foe, mine);
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
    const score = matchup(b, foe) + (b.hp / b.maxHp) * 0.2;
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

  const current = matchup(user, foe);
  const canHurt = bestMove(user, foe).score > 0;
  let best = -1;
  let bestScore = -Infinity;
  for (const i of options) {
    const mate = battle.sides[side].team[i]!;
    const score = matchup(mate, foe) + (mate.hp / mate.maxHp) * 0.2;
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

/**
 * IA del rival: elige el ataque con más valor esperado (daño según tipos, STAB y precisión; estados y mejoras
 * cuando compensan) con algo de ruido, y cambia de Pokémon si está en clara desventaja.
 */
export function chooseAction(battle: Battle, side: Side, rng: Rng): Action {
  const user = activeOf(battle, side);
  const foe = activeOf(battle, otherSide(side));
  if (user.recharging) return { type: 'move', slot: 0 };
  if (user.charging !== null) return { type: 'move', slot: user.charging };

  const sw = considerSwitch(battle, side, rng);
  if (sw) return sw;

  const slots = legalMoveSlots(user);
  if (slots[0] === -1) return { type: 'move', slot: -1 };
  let bestSlot = slots[0]!;
  let bestScore = -Infinity;
  for (const slot of slots) {
    const move = moveOf(user.moves[slot]!.moveId);
    const base = scoreMove(user, foe, move);
    // Un ataque sin utilidad solo se usa si no hay nada mejor
    const score = base > 0 ? base * (0.8 + 0.2 * rng.next()) : 0.01 * rng.next();
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }
  return { type: 'move', slot: bestSlot };
}

