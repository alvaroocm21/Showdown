import speciesJson from '../data/species.json';
import movesJson from '../data/moves.json';
import abilitiesJson from '../data/abilities.json';
import naturesJson from '../data/natures.json';
import typesJson from '../data/types.json';
import type { Ability, Move, Nature, PokeType, Species } from './types';

export const SPECIES = speciesJson as unknown as Species[];
export const MOVES = movesJson as unknown as Move[];
export const ABILITIES = abilitiesJson as unknown as Ability[];
export const NATURES = naturesJson as unknown as Nature[];
export const TYPE_NAMES_ES = typesJson.names as Record<PokeType, string>;
/** TYPE_CHART[atacante][defensor] = multiplicador (0, 0.5, 1 o 2). */
export const TYPE_CHART = typesJson.chart as Record<PokeType, Record<PokeType, number>>;

const byId = <T extends { id: number }>(items: T[]) => new Map(items.map((i) => [i.id, i]));
const SPECIES_BY_ID = byId(SPECIES);
const MOVES_BY_ID = byId(MOVES);
const ABILITIES_BY_ID = byId(ABILITIES);
const NATURES_BY_ID = byId(NATURES);

function need<T>(item: T | undefined, kind: string, id: number): T {
  if (!item) throw new Error(`${kind} desconocido: ${id}`);
  return item;
}

export const getSpecies = (id: number) => need(SPECIES_BY_ID.get(id), 'Pokémon', id);
export const getMove = (id: number) => need(MOVES_BY_ID.get(id), 'Ataque', id);
export const getAbility = (id: number) => need(ABILITIES_BY_ID.get(id), 'Habilidad', id);
export const getNature = (id: number) => need(NATURES_BY_ID.get(id), 'Naturaleza', id);

/** Render 3D de Pokémon HOME alojado por PokéAPI. */
export const spriteUrl = (speciesId: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${speciesId}.png`;
