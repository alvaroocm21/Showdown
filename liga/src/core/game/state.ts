import type { Rng } from '../rng';
import { rewardFor } from './economy';
import { createSeason, findMatch, recordResult } from './season';
import { validateDraw } from './settings';
import { MAX_PLAYERS, MIN_PLAYERS, type DrawSettings, type GameState, type MatchLogEntry, type MatchResult, type Profile } from './types';

/** Operaciones sobre la partida: siempre devuelven un estado nuevo y lanzan un Error con un mensaje claro si no se pueden hacer. */

const profileById = (state: GameState, id: string): Profile => {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) throw new Error('Perfil desconocido');
  return p;
};

export const findProfile = (state: GameState, id: string): Profile | undefined => state.profiles.find((p) => p.id === id);

/** ¿Participa el perfil en la temporada actual (terminada o no)? */
export const inSeason = (state: GameState, id: string): boolean => !!state.season && state.season.participants.includes(id);

/** Los equipos solo se pueden re-sortear con la liga parada o terminada, para no alterar una temporada en juego. */
export const canRerollTeam = (state: GameState): boolean => !state.season || state.season.finishedAt !== null;

export const addProfile = (state: GameState, profile: Profile): GameState => ({ ...state, profiles: [...state.profiles, profile] });

export function removeProfile(state: GameState, id: string): GameState {
  profileById(state, id);
  if (inSeason(state, id)) throw new Error('No se puede borrar un perfil que participa en la temporada actual');
  return { ...state, profiles: state.profiles.filter((p) => p.id !== id) };
}

export function updateProfile(state: GameState, id: string, change: (p: Profile) => Profile): GameState {
  profileById(state, id);
  return { ...state, profiles: state.profiles.map((p) => (p.id === id ? change(p) : p)) };
}

export function startSeason(state: GameState, participants: readonly string[], rng: Rng, now = Date.now()): GameState {
  if (state.season) throw new Error('Ya hay una temporada en curso');
  if (participants.length < MIN_PLAYERS || participants.length > MAX_PLAYERS) {
    throw new Error(`Una liga necesita entre ${MIN_PLAYERS} y ${MAX_PLAYERS} perfiles`);
  }
  for (const id of participants) profileById(state, id);
  return { ...state, season: createSeason(state.nextSeasonNumber, participants, rng, now) };
}

/** Anota el resultado de un combate y paga las monedas al ganador. */
export function recordMatch(state: GameState, matchId: string, result: MatchResult, now = Date.now()): GameState {
  if (!state.season) throw new Error('No hay temporada en curso');
  const match = findMatch(state.season, matchId);
  if (!match) throw new Error(`Combate desconocido: ${matchId}`);
  const season = recordResult(state.season, matchId, result, now);
  const { profileId, coins } = rewardFor(match, result);
  const nameOf = (id: string) => state.profiles.find((p) => p.id === id)?.name ?? 'Perfil eliminado';
  const entry: MatchLogEntry = {
    season: state.season.number, round: match.round, aId: match.a, bId: match.b, aName: nameOf(match.a), bName: nameOf(match.b),
    winnerId: result.winner, faintedA: result.faintedA, faintedB: result.faintedB, mode: result.mode, at: now,
  };
  return {
    ...state,
    season,
    matchLog: [...state.matchLog, entry],
    profiles: state.profiles.map((p) => (p.id === profileId ? { ...p, coins: p.coins + coins } : p)),
  };
}

/** Cambia qué Pokémon pueden salir en los sorteos futuros (los equipos que ya existen no cambian). */
export function updateDraw(state: GameState, draw: DrawSettings): GameState {
  const error = validateDraw(draw);
  if (error) throw new Error(error);
  return { ...state, settings: { ...state.settings, draw: { ...draw, generations: [...draw.generations].sort((a, b) => a - b) } } };
}
