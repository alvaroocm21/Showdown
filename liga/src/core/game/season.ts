import type { Rng } from '../rng';
import { roundRobin } from './schedule';
import { computeStandings } from './standings';
import type { GameState, Match, MatchResult, Season, SeasonRecord } from './types';

export function createSeason(number: number, participants: readonly string[], rng: Rng, now = Date.now()): Season {
  const { rounds, byes } = roundRobin(participants, rng);
  return {
    number,
    startedAt: now,
    participants: [...participants],
    rounds: rounds.map((fixtures, r) => fixtures.map((f, i): Match => ({ id: `${number}-${r + 1}-${i + 1}`, round: r, a: f.a, b: f.b, result: null }))),
    byes,
    finishedAt: null,
  };
}

export const allMatches = (season: Season): Match[] => season.rounds.flat();
export const findMatch = (season: Season, id: string): Match | undefined => allMatches(season).find((m) => m.id === id);
export const pendingInRound = (season: Season, round: number): Match[] => (season.rounds[round] ?? []).filter((m) => !m.result);
export const isSeasonComplete = (season: Season): boolean => allMatches(season).every((m) => m.result);

/** Primera jornada con combates por jugar (null si la temporada ha terminado). */
export function currentRound(season: Season): number | null {
  const i = season.rounds.findIndex((r) => r.some((m) => !m.result));
  return i === -1 ? null : i;
}

/** Devuelve una temporada nueva con el resultado anotado. Falla si el combate ya estaba jugado o el ganador no es de la pareja. */
export function recordResult(season: Season, matchId: string, result: MatchResult, now = Date.now()): Season {
  const next = structuredClone(season);
  const match = findMatch(next, matchId);
  if (!match) throw new Error(`Combate desconocido: ${matchId}`);
  if (match.result) throw new Error('Ese combate ya está jugado');
  if (result.winner !== match.a && result.winner !== match.b) throw new Error('El ganador no participa en el combate');
  match.result = result;
  if (isSeasonComplete(next)) next.finishedAt = now;
  return next;
}

export function champion(season: Season, names?: ReadonlyMap<string, string>): string | null {
  if (!isSeasonComplete(season)) return null;
  return computeStandings(season, names)[0]!.profileId;
}

/** Pasa la temporada terminada al historial y deja la liga lista para empezar otra. */
export function archiveSeason(state: GameState): GameState {
  const { season } = state;
  if (!season || !isSeasonComplete(season)) throw new Error('La temporada no ha terminado');
  const names = new Map(state.profiles.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => names.get(id) ?? 'Perfil eliminado';
  const standings = computeStandings(season, names);
  const record: SeasonRecord = {
    number: season.number,
    startedAt: season.startedAt,
    finishedAt: season.finishedAt ?? Date.now(),
    championId: standings[0]!.profileId,
    championName: nameOf(standings[0]!.profileId),
    standings: standings.map((r) => ({ ...r, name: nameOf(r.profileId) })),
  };
  return { ...state, season: null, history: [...state.history, record], nextSeasonNumber: season.number + 1 };
}
