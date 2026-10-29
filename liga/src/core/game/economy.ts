import { TEAM_SIZE } from '../generator';
import type { Match, MatchResult } from './types';

/** Monedas que gana el perfil que vence un combate: base + un extra por cada Pokémon propio que sobrevive. */
export const WIN_COINS = 100;
export const SURVIVOR_COINS = 10;

/** Precio de cada mejora (todas son sorteos al azar). */
export const UPGRADE_COSTS = { move: 60, ability: 80, pokemon: 150 } as const;
export type UpgradeKind = keyof typeof UPGRADE_COSTS;

/** Monedas por ganar un combate en el que el ganador perdió `winnerFainted` Pokémon. */
export const matchReward = (winnerFainted: number): number =>
  WIN_COINS + SURVIVOR_COINS * Math.max(0, TEAM_SIZE - winnerFainted);

/** Quién cobra y cuánto por el resultado de un combate. */
export function rewardFor(match: Pick<Match, 'a' | 'b'>, result: MatchResult): { profileId: string; coins: number } {
  const winnerFainted = result.winner === match.a ? result.faintedA : result.faintedB;
  return { profileId: result.winner, coins: matchReward(winnerFainted) };
}
