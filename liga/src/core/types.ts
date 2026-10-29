export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type PokeType = (typeof TYPE_NAMES)[number];

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

/** Estadísticas que pueden subir o bajar en combate (-6 a +6): las 5 de combate, precisión y evasión. */
export type StageKey = Exclude<StatKey, 'hp'> | 'acc' | 'eva';

export type MoveCategory = 'physical' | 'special' | 'status';

/** Forma alternativa de una especie: regional (se sortea) o megaevolución (solo en combate). */
export interface SpeciesForm {
  kind: 'regional' | 'mega';
  /** Número de Pokédex de la especie base. */
  baseId: number;
  /** Etiqueta corta: «Alola», «Mega X»… */
  label: string;
}

export interface Species {
  /** Identificador del Pokémon: para las especies base coincide con su número de Pokédex; las formas usan el de PokéAPI (10000+). */
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
  form?: SpeciesForm;
}

export interface MoveFlags {
  contact: boolean;
  /** Ataque de dos turnos (se prepara un turno y golpea al siguiente). */
  charge: boolean;
  /** El usuario debe descansar el turno siguiente. */
  recharge: boolean;
  sound: boolean;
  defrost: boolean;
  /** Rebotable con Espejo Mágico. */
  reflectable: boolean;
  punch: boolean;
  bite: boolean;
  pulse: boolean;
  /** Bombas, bolas y proyectiles (Antibalas). */
  ballistics: boolean;
  powder: boolean;
  dance: boolean;
  /** Ataques que curan al usuario (Médico). */
  heal: boolean;
}

export interface MoveMeta {
  /** Categoría de efecto de PokéAPI (1 estado, 2 mejoras, 3 curar, 6 daño+bajar al rival, 7 daño+subir/bajar al usuario, 9 KO...). */
  category: number;
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
  statChanges: { stat: StageKey; change: number }[];
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
  flags: MoveFlags;
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
