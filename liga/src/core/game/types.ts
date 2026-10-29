import type { PokemonSet } from '../types';

export const SAVE_VERSION = 1;
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;
export const WIN_POINTS = 3;

export interface Avatar {
  emoji: string;
  hue: number;
}

export interface Profile {
  id: string;
  name: string;
  avatar: Avatar;
  /** Perfil "principal": sus combates siempre se juegan; los de perfiles no principales se pueden simular. */
  main: boolean;
  team: PokemonSet[];
  /** Monedas para mejorar el equipo (se ganan al vencer; se gastan en la fase 5). */
  coins: number;
}

export interface MatchResult {
  winner: string;
  /** Pokémon debilitados de cada bando: de `a` y de `b`. */
  faintedA: number;
  faintedB: number;
  /** Cómo se jugó. */
  mode: 'played' | 'simulated';
}

export interface Match {
  id: string;
  round: number;
  a: string;
  b: string;
  result: MatchResult | null;
}

export interface Season {
  number: number;
  startedAt: number;
  participants: string[];
  /** Jornadas: lista de combates de cada una. */
  rounds: Match[][];
  /** Perfil que descansa en cada jornada (solo con número impar de participantes). */
  byes: (string | null)[];
  finishedAt: number | null;
}

export interface StandingRow {
  profileId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  /** Pokémon rivales debilitados / propios debilitados. */
  faintedCaused: number;
  faintedSuffered: number;
  /** Diferencia de Pokémon debilitados (causados - sufridos). */
  diff: number;
}

export interface SeasonRecord {
  number: number;
  startedAt: number;
  finishedAt: number;
  championId: string;
  championName: string;
  standings: (StandingRow & { name: string })[];
}

export interface GameState {
  version: number;
  profiles: Profile[];
  season: Season | null;
  history: SeasonRecord[];
  /** Número de la próxima temporada. */
  nextSeasonNumber: number;
}

export const emptyGame = (): GameState => ({ version: SAVE_VERSION, profiles: [], season: null, history: [], nextSeasonNumber: 1 });
