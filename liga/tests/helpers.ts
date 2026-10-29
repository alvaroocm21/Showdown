import { MOVES, SPECIES } from '../src/core/data';
import type { Rng } from '../src/core/rng';
import { cloneBuild, DEFAULT_BUILD } from '../src/core/stats';
import type { PokemonSet } from '../src/core/types';

export const moveId = (slug: string) => {
  const m = MOVES.find((x) => x.slug === slug);
  if (!m) throw new Error(`ataque desconocido: ${slug}`);
  return m.id;
};

export function makeSet(speciesSlug: string, moveSlugs: string[], abilityId = 1): PokemonSet {
  const s = SPECIES.find((x) => x.slug === speciesSlug);
  if (!s) throw new Error(`especie desconocida: ${speciesSlug}`);
  return { speciesId: s.id, abilityId, moveIds: moveSlugs.map(moveId), build: cloneBuild(DEFAULT_BUILD) };
}

/** RNG que devuelve los valores dados en orden (y 0.5 cuando se acaban). */
export function scriptedRng(values: number[]): Rng {
  const queue = [...values];
  const next = () => (queue.length ? queue.shift()! : 0.5);
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)]!,
    shuffle: (items) => [...items],
  };
}

/** Sin fallo, sin crítico y con la variación de daño máxima (100 %). */
export const HIT_NO_CRIT_MAX = [0, 0.99, 0.99];
