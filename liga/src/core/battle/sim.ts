import { chooseAction, chooseReplacement } from '../ai';
import type { Rng } from '../rng';
import { executeTurn, sendOut, startBattle } from './engine';
import { SIDES, type Battle, type Side } from './state';

export const MAX_SIM_TURNS = 300;

/** Fracción de PS que le quedan a un bando (para decidir un combate que no termina). */
const hpFraction = (battle: Battle, side: Side) => {
  const team = battle.sides[side].team;
  return team.reduce((sum, b) => sum + b.hp / b.maxHp, 0) / team.length;
};

/** Juega un combate completo con la IA de los dos lados (para los combates que no juega el usuario). */
export function simulateBattle(battle: Battle, rng: Rng, maxTurns = MAX_SIM_TURNS): { winner: Side; turns: number } {
  if (battle.turn === 0) startBattle(battle, rng);
  while (battle.winner === null) {
    for (const side of SIDES) {
      if (battle.pending[side]) sendOut(battle, side, chooseReplacement(battle, side), rng);
    }
    if (battle.turn >= maxTurns) {
      // Salvaguarda ante bucles de cambios: gana quien conserva más vida
      battle.winner = hpFraction(battle, 0) >= hpFraction(battle, 1) ? 0 : 1;
      break;
    }
    executeTurn(battle, [chooseAction(battle, 0, rng), chooseAction(battle, 1, rng)], rng);
  }
  return { winner: battle.winner, turns: battle.turn };
}
