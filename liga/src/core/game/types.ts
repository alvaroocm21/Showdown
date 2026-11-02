import type { PokemonSet } from '../types';

export const SAVE_VERSION = 3;
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
  /** Pokémon (id de especie) de cada bando que se debilitaron: no pueden jugar la jornada siguiente. */
  fallenA?: number[];
  fallenB?: number[];
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

/** Qué Pokémon pueden salir en los sorteos (equipos nuevos, cambios gratis y Pokémon comprados). */
export interface DrawSettings {
  /** Generaciones (1-9) de las que se sortea. */
  generations: number[];
  /** Incluye legendarios y singulares. */
  legendaries: boolean;
  /** Solo Pokémon en su última etapa evolutiva. */
  finalStageOnly: boolean;
}

export interface Settings {
  draw: DrawSettings;
}

/** Un combate de liga ya jugado, guardado aparte para consultar el historial entre dos cuentas. */
export interface MatchLogEntry {
  season: number;
  /** Jornada (empezando en 0). */
  round: number;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  winnerId: string;
  faintedA: number;
  faintedB: number;
  mode: MatchResult['mode'];
  at: number;
}

export interface GameState {
  version: number;
  settings: Settings;
  profiles: Profile[];
  season: Season | null;
  history: SeasonRecord[];
  /** Todos los combates de liga jugados (para el historial entre cuentas). */
  matchLog: MatchLogEntry[];
  /** Número de la próxima temporada. */
  nextSeasonNumber: number;
}

export const ALL_GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const defaultSettings = (): Settings => ({ draw: { generations: [...ALL_GENERATIONS], legendaries: true, finalStageOnly: true } });

export const emptyGame = (): GameState => ({
  version: SAVE_VERSION,
  settings: defaultSettings(),
  profiles: [],
  season: null,
  history: [],
  matchLog: [],
  nextSeasonNumber: 1,
});
