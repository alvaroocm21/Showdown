import type { Rng } from '../rng';
import { createSeason, recordResult } from './season';
import { MAX_PLAYERS, MIN_PLAYERS, type GameState, type MatchResult, type Profile } from './types';

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

export function recordMatch(state: GameState, matchId: string, result: MatchResult, now = Date.now()): GameState {
  if (!state.season) throw new Error('No hay temporada en curso');
  return { ...state, season: recordResult(state.season, matchId, result, now) };
}
