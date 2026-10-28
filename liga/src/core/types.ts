export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type PokeType = (typeof TYPE_NAMES)[number];

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export type MoveCategory = 'physical' | 'special' | 'status';

export interface Species {
  id: number;
  slug: string;
  /** Nombre en español (o inglés si PokéAPI no lo tiene). */
  name: string;
  generation: number;
  types: PokeType[];
  baseStats: Stats;
  /** Ninguna otra especie evoluciona a partir de ésta. */
  finalStage: boolean;
  legendary: boolean;
}

export interface MoveMeta {
  /** Estado que puede causar (id de ailment de PokéAPI: 1 parálisis, 2 sueño, 3 congelación, 4 quemadura, 5 veneno...). */
  ailmentId: number;
  ailmentChance: number;
  flinchChance: number;
  statChance: number;
  critRate: number;
  drain: number;
  healing: number;
  minHits: number | null;
  maxHits: number | null;
  statChanges: { stat: StatKey; change: number }[];
}

export interface Move {
  id: number;
  slug: string;
  name: string;
  type: PokeType;
  category: MoveCategory;
  power: number | null;
  accuracy: number | null;
  pp: number;
  priority: number;
  /** id de objetivo de PokéAPI (10 = un rival, 7 = el usuario...). */
  target: number;
  effectId: number;
  effectChance: number | null;
  meta: MoveMeta;
}

export interface Ability {
  id: number;
  slug: string;
  name: string;
  description: string;
}

export interface Nature {
  id: number;
  slug: string;
  name: string;
  up: StatKey | null;
  down: StatKey | null;
}

/** Ajustes de construcción que se pueden cambiar a mano (IVs, EVs, naturaleza, nivel). */
export interface BuildConfig {
  level: number;
  ivs: Stats;
  evs: Stats;
  natureId: number;
}

export interface PokemonSet {
  speciesId: number;
  abilityId: number;
  moveIds: number[];
  build: BuildConfig;
}
