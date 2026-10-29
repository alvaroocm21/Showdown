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

import { ABILITIES } from '../src/core/data';
import { createBattle, activeOf, type Battle, type Battler } from '../src/core/battle/state';
import { executeTurn, type Action, type BattleEvent } from '../src/core/battle/engine';

export const abilityId = (slug: string) => {
  const a = ABILITIES.find((x) => x.slug === slug);
  if (!a) throw new Error(`habilidad desconocida: ${slug}`);
  return a.id;
};

export const mv = (slot: number): Action => ({ type: 'move', slot });
export const sw = (to: number): Action => ({ type: 'switch', to });

/** Combate 1 contra 1 de especies concretas. */
export function duel(
  a: [species: string, moves: string[], ability?: string],
  b: [species: string, moves: string[], ability?: string],
): Battle {
  const set = ([s, m, ab]: typeof a) => makeSet(s, m, ab ? abilityId(ab) : 1);
  return createBattle([set(a)], [set(b)]);
}

/** Ejecuta un turno con un RNG con guion (0.5 por defecto cuando se acaba). */
export const turn = (b: Battle, a0: Action, a1: Action, rolls: number[] = []): BattleEvent[] =>
  executeTurn(b, [a0, a1], scriptedRng(rolls));

export const types = (events: BattleEvent[]) => events.map((e) => e.type);
export const has = (events: BattleEvent[], pred: (e: BattleEvent) => boolean) => events.some(pred);
export const A = (b: Battle): Battler => activeOf(b, 0);
export const B = (b: Battle): Battler => activeOf(b, 1);
