import type { Rng } from '../rng';
import { computeMoveDamage, isDamagingMove } from '../battle/damage';
import { legalMoveSlots, type Action } from '../battle/engine';
import { activeOf, moveOf, otherSide, STRUGGLE_ID, type Battle, type Side } from '../battle/state';

const AVERAGE_ROLL = 92;

/**
 * IA del rival: elige el ataque con más daño esperado (tipos, STAB, precisión), con un poco de ruido
 * para que no sea totalmente predecible. Prefiere el que remata. Los ataques sin implementar solo se
 * usan si no queda ningún ataque de daño.
 */
export function chooseAction(battle: Battle, side: Side, rng: Rng): Action {
  const user = activeOf(battle, side);
  const target = activeOf(battle, otherSide(side));
  const slots = legalMoveSlots(user);
  if (slots[0] === -1) return { type: 'move', slot: -1 };

  let bestSlot = slots[0]!;
  let bestScore = -Infinity;
  for (const slot of slots) {
    const move = moveOf(user.moves[slot]!.moveId);
    let score: number;
    if (!isDamagingMove(move) || move.id === STRUGGLE_ID) {
      score = 0.01 * rng.next();
    } else {
      const hit = (move.accuracy ?? 100) / 100;
      const expected = computeMoveDamage(user, target, move, { crit: false, roll: AVERAGE_ROLL }) * hit;
      const kills = expected >= target.hp;
      score = Math.min(expected, target.hp) * (kills ? 1.3 : 1) * (0.8 + 0.2 * rng.next());
    }
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }
  return { type: 'move', slot: bestSlot };
}
