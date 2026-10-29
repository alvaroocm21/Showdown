import type { Rng } from '../rng';
import type { PokeType } from '../types';
import { critChance, computeMoveDamage, isDamagingMove } from './damage';
import { accuracyMultiplier, clampStage } from './stages';
import {
  STRUGGLE_ID, activeOf, hasAlive, moveOf, otherSide,
  type Battle, type Battler, type Side,
} from './state';
import { effectiveSpeed, orderActions } from './turnOrder';
import { typeEffectiveness } from './typeEffect';

/** slot = posición del ataque (0-3), o -1 para Forcejeo (solo si no quedan PP). */
export interface MoveAction {
  type: 'move';
  slot: number;
}
export type Action = MoveAction;

export type BattleEvent =
  | { type: 'turn'; turn: number }
  | { type: 'move'; side: Side; pokemon: string; move: string; moveType: PokeType }
  | { type: 'miss'; side: Side; pokemon: string }
  | { type: 'immune'; side: Side; pokemon: string }
  | { type: 'noEffect' }
  | { type: 'crit' }
  | { type: 'effectiveness'; multiplier: number }
  | { type: 'damage'; side: Side; pokemon: string; amount: number; hp: number; maxHp: number; cause: 'move' | 'recoil' }
  | { type: 'faint'; side: Side; pokemon: string }
  | { type: 'win'; side: Side };

/** Posiciones de ataque que se pueden elegir (con PP); si no hay ninguna, solo Forcejeo (-1). */
export function legalMoveSlots(b: Battler): number[] {
  const slots = b.moves.flatMap((m, i) => (m.pp > 0 ? [i] : []));
  return slots.length ? slots : [-1];
}

const moveForSlot = (b: Battler, slot: number) => (slot === -1 ? moveOf(STRUGGLE_ID) : moveOf(b.moves[slot]!.moveId));

export function executeTurn(battle: Battle, actions: readonly [Action, Action], rng: Rng): BattleEvent[] {
  if (battle.winner !== null) throw new Error('El combate ya ha terminado');
  const events: BattleEvent[] = [];
  battle.turn += 1;
  events.push({ type: 'turn', turn: battle.turn });

  const entries = ([0, 1] as const).map((side) => {
    const user = activeOf(battle, side);
    const { slot } = actions[side];
    if (!legalMoveSlots(user).includes(slot)) throw new Error(`Acción no válida para ${user.name}: ataque ${slot}`);
    return { side, priority: moveForSlot(user, slot).priority, speed: effectiveSpeed(user) };
  });

  for (const side of orderActions(entries, rng)) {
    if (activeOf(battle, side).hp <= 0) continue;
    useMove(battle, side, actions[side].slot, rng, events);
    if (battle.winner !== null) break;
  }
  return events;
}

function useMove(battle: Battle, side: Side, slot: number, rng: Rng, events: BattleEvent[]): void {
  const user = activeOf(battle, side);
  const targetSide = otherSide(side);
  const target = activeOf(battle, targetSide);
  const move = moveForSlot(user, slot);
  if (slot >= 0) user.moves[slot]!.pp -= 1;
  events.push({ type: 'move', side, pokemon: user.name, move: move.name, moveType: move.type });

  // Fase 2: solo los ataques de daño directo están implementados.
  if (!isDamagingMove(move)) {
    events.push({ type: 'noEffect' });
    return;
  }

  if (move.accuracy !== null) {
    const stage = clampStage(user.stages.acc - target.stages.eva);
    const chance = Math.floor(move.accuracy * accuracyMultiplier(stage));
    if (rng.int(1, 100) > chance) {
      events.push({ type: 'miss', side, pokemon: user.name });
      return;
    }
  }

  const effectiveness = move.id === STRUGGLE_ID ? 1 : typeEffectiveness(move.type, target.types);
  if (effectiveness === 0) {
    events.push({ type: 'immune', side: targetSide, pokemon: target.name });
    return;
  }

  const crit = rng.next() < critChance(move.meta.critRate);
  const roll = rng.int(85, 100);
  const amount = Math.min(target.hp, computeMoveDamage(user, target, move, { crit, roll }));
  target.hp -= amount;
  events.push({ type: 'damage', side: targetSide, pokemon: target.name, amount, hp: target.hp, maxHp: target.maxHp, cause: 'move' });
  if (crit) events.push({ type: 'crit' });
  if (effectiveness !== 1) events.push({ type: 'effectiveness', multiplier: effectiveness });
  if (target.hp <= 0) events.push({ type: 'faint', side: targetSide, pokemon: target.name });

  if (move.id === STRUGGLE_ID) {
    const recoil = Math.min(user.hp, Math.max(1, Math.floor(user.maxHp / 4)));
    user.hp -= recoil;
    events.push({ type: 'damage', side, pokemon: user.name, amount: recoil, hp: user.hp, maxHp: user.maxHp, cause: 'recoil' });
    if (user.hp <= 0) events.push({ type: 'faint', side, pokemon: user.name });
  }

  resolveWinner(battle, side, events);
}

/** Si un bando se queda sin Pokémon, gana el otro; si caen los dos a la vez (retroceso), gana quien usó el ataque. */
function resolveWinner(battle: Battle, userSide: Side, events: BattleEvent[]): void {
  const foeAlive = hasAlive(battle, otherSide(userSide));
  const selfAlive = hasAlive(battle, userSide);
  if (foeAlive && selfAlive) return;
  battle.winner = !foeAlive ? userSide : otherSide(userSide);
  events.push({ type: 'win', side: battle.winner });
}
