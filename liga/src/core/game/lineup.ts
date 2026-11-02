import { getSpecies } from '../data';
import { TEAM_SIZE } from '../generator';
import type { Rng } from '../rng';
import { STAT_KEYS, type PokemonSet } from '../types';
import { findMatch } from './season';
import type { GameState, Profile, Season } from './types';

/** Cuántos Pokémon salen en cada combate. */
export const LINEUP_SIZE = TEAM_SIZE;

/**
 * Pokémon (id de especie) de un perfil que no pueden jugar una jornada: los que se debilitaron en su combate
 * de la jornada anterior. Si la jornada anterior no se ha jugado o el perfil descansó, no hay ninguno.
 */
export function unavailableSpecies(season: Season | null, profileId: string, round: number): Set<number> {
  const out = new Set<number>();
  if (!season || round <= 0) return out;
  const prev = season.rounds[round - 1]?.find((m) => m.a === profileId || m.b === profileId);
  const result = prev?.result;
  if (!prev || !result) return out;
  for (const id of (prev.a === profileId ? result.fallenA : result.fallenB) ?? []) out.add(id);
  return out;
}

/** Pokémon de la plantilla que pueden jugar (sin los que descansan). */
export const availableSets = (profile: Profile, unavailable: ReadonlySet<number>): PokemonSet[] =>
  profile.team.filter((s) => !unavailable.has(s.speciesId));

const strength = (s: PokemonSet): number => STAT_KEYS.reduce((sum, k) => sum + getSpecies(s.speciesId).baseStats[k], 0);

/** Alineación automática (la IA y las simulaciones): los 6 más fuertes entre los disponibles, con algo de azar entre parecidos. */
export function autoLineup(available: readonly PokemonSet[], rng: Rng): PokemonSet[] {
  return [...available]
    .map((s) => ({ s, score: strength(s) + rng.int(0, 60) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LINEUP_SIZE)
    .map((x) => x.s);
}

/** Alineación automática de un perfil en una jornada de la temporada en curso (respeta a los que descansan). */
export function autoLineupFor(state: GameState, profileId: string, round: number, rng: Rng): PokemonSet[] {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Perfil desconocido');
  const free = availableSets(profile, unavailableSpecies(state.season, profileId, round));
  // sin suficientes sanos (no debería pasar con 15) se completa con los que descansan
  const pool = free.length >= LINEUP_SIZE ? free : profile.team;
  return autoLineup(pool, rng);
}

/** Jornada de un combate de la temporada en curso. */
export const roundOfMatch = (state: GameState, matchId: string): number => (state.season && findMatch(state.season, matchId)?.round) || 0;
