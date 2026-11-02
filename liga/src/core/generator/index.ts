import { ABILITIES, MOVES, SPECIES, getMove, getSpecies, isMega } from '../data';
import type { Rng } from '../rng';
import { cloneBuild, DEFAULT_BUILD } from '../stats';
import type { BuildConfig, Move, PokemonSet, Species } from '../types';

export interface GenerateOptions {
  /** Permite legendarios y singulares (por defecto no). */
  allowLegendary?: boolean;
  /** Generaciones de las que se sortea (por defecto, todas). */
  generations?: readonly number[];
  /** Solo Pokémon en su última etapa evolutiva (por defecto sí). */
  finalStageOnly?: boolean;
  /** Ajustes de IVs/EVs/naturaleza/nivel con los que se construye cada Pokémon. */
  build?: BuildConfig;
}

export const MOVES_PER_POKEMON = 4;
/** Pokémon que salen a combatir (la alineación de cada combate). */
export const TEAM_SIZE = 6;
/** Pokémon que tiene cada perfil en su plantilla (de ellos se eligen los 6 de cada combate). */
export const ROSTER_SIZE = 15;

/** Ataque que hace daño directo con la fórmula normal (excluye estado y daño fijo/OHKO sin potencia). */
export const isDirectDamage = (m: Move) => m.category !== 'status' && (m.power ?? 0) > 0;

/**
 * Un set es jugable si tiene al menos 2 ataques de daño directo y, cuando la especie tiene
 * algún ataque de daño de su tipo en el pool, al menos uno de ellos es STAB.
 */
export function isPlayableMoveset(species: Species, moveIds: readonly number[]): boolean {
  const moves = moveIds.map(getMove);
  const damaging = moves.filter(isDirectDamage);
  if (damaging.length < 2) return false;
  if (!hasStabInPool(species)) return true;
  return damaging.some((m) => species.types.includes(m.type));
}

const stabPoolCache = new Map<string, boolean>();
function hasStabInPool(species: Species): boolean {
  const key = species.types.join('/');
  let v = stabPoolCache.get(key);
  if (v === undefined) {
    v = MOVES.some((m) => isDirectDamage(m) && species.types.includes(m.type));
    stabPoolCache.set(key, v);
  }
  return v;
}

/** 4 ataques distintos al azar de entre TODOS los del juego, repitiendo el sorteo si el set es injugable. */
export function rollMoves(species: Species, rng: Rng): number[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const picked = rng.shuffle(MOVES).slice(0, MOVES_PER_POKEMON).map((m) => m.id);
    if (isPlayableMoveset(species, picked)) return picked;
  }
  // Respaldo (casi inalcanzable): construir el set a mano respetando las reglas.
  const damaging = MOVES.filter(isDirectDamage);
  const stab = damaging.filter((m) => species.types.includes(m.type));
  const first = rng.pick(stab.length ? stab : damaging);
  const second = rng.pick(damaging.filter((m) => m.id !== first.id));
  const rest = rng.shuffle(MOVES.filter((m) => m.id !== first.id && m.id !== second.id)).slice(0, MOVES_PER_POKEMON - 2);
  return rng.shuffle([first, second, ...rest]).map((m) => m.id);
}

/** 1 habilidad al azar de entre todas las del juego, aunque no sea de la especie. */
export function rollAbility(rng: Rng, exceptId?: number): number {
  const pool = exceptId === undefined ? ABILITIES : ABILITIES.filter((a) => a.id !== exceptId);
  return rng.pick(pool).id;
}

export function speciesPool(options: GenerateOptions = {}): Species[] {
  const finalOnly = options.finalStageOnly ?? true;
  return SPECIES.filter(
    (s) =>
      !isMega(s) &&
      (!finalOnly || s.finalStage) &&
      (options.allowLegendary || !s.legendary) &&
      (!options.generations || options.generations.includes(s.generation)),
  );
}

export function rollSpecies(rng: Rng, excludeIds: ReadonlySet<number> = new Set(), options: GenerateOptions = {}): Species {
  const pool = speciesPool(options).filter((s) => !excludeIds.has(s.id));
  if (!pool.length) throw new Error('No quedan Pokémon disponibles para sortear');
  return rng.pick(pool);
}

export function buildSet(speciesId: number, rng: Rng, options: GenerateOptions = {}): PokemonSet {
  const species = getSpecies(speciesId);
  return {
    speciesId,
    abilityId: rollAbility(rng),
    moveIds: rollMoves(species, rng),
    build: cloneBuild(options.build ?? DEFAULT_BUILD),
  };
}

export function rollPokemon(rng: Rng, excludeIds: ReadonlySet<number> = new Set(), options: GenerateOptions = {}): PokemonSet {
  return buildSet(rollSpecies(rng, excludeIds, options).id, rng, options);
}

/** Equipo de 6 Pokémon distintos en su última etapa. */
export function rollTeam(rng: Rng, options: GenerateOptions = {}, size = TEAM_SIZE): PokemonSet[] {
  const team: PokemonSet[] = [];
  const used = new Set<number>();
  for (let i = 0; i < size; i++) {
    const p = rollPokemon(rng, used, options);
    used.add(p.speciesId);
    team.push(p);
  }
  return team;
}
