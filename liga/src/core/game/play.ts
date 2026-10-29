import { simulateBattle } from '../battle/sim';
import { createBattle, type Battle, type Side } from '../battle/state';
import type { Rng } from '../rng';
import type { MatchResult, Profile } from './types';

export interface BattleOutcome {
  winner: Side;
  /** Pokémon debilitados en cada bando. */
  fainted: [number, number];
}

export const outcomeOf = (battle: Battle): BattleOutcome => {
  if (battle.winner === null) throw new Error('El combate no ha terminado');
  const count = (s: Side) => battle.sides[s].team.filter((b) => b.hp <= 0).length;
  return { winner: battle.winner, fainted: [count(0), count(1)] };
};

/** Resultado de un combate de la liga entre `a` (bando 0) y `b` (bando 1). */
export function matchResultFrom(a: Profile, b: Profile, outcome: BattleOutcome, mode: MatchResult['mode']): MatchResult {
  return { winner: outcome.winner === 0 ? a.id : b.id, faintedA: outcome.fainted[0], faintedB: outcome.fainted[1], mode };
}

/** Simula con IA un combate entre dos perfiles (para los que no se juegan). */
export function simulateMatch(a: Profile, b: Profile, rng: Rng): MatchResult {
  const battle = createBattle(a.team, b.team);
  simulateBattle(battle, rng);
  return matchResultFrom(a, b, outcomeOf(battle), 'simulated');
}


/**
 * Resultado de un combate de la liga que ha jugado el usuario con el perfil `meId`
 * (que puede ser `a` o `b` de la pareja; en la batalla `meId` es el bando 0).
 */
export function resultForMatch(match: { a: string; b: string }, meId: string, outcome: BattleOutcome, mode: MatchResult['mode']): MatchResult {
  if (meId !== match.a && meId !== match.b) throw new Error('El perfil no participa en el combate');
  const foeId = meId === match.a ? match.b : match.a;
  const [faintedMe, faintedFoe] = outcome.fainted;
  const meIsA = meId === match.a;
  return {
    winner: outcome.winner === 0 ? meId : foeId,
    faintedA: meIsA ? faintedMe : faintedFoe,
    faintedB: meIsA ? faintedFoe : faintedMe,
    mode,
  };
}
