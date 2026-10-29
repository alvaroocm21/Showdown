import { getMove, getSpecies } from '../data';
import { computeStats } from '../stats';
import type { Move, PokemonSet, PokeType, Stats, StatKey } from '../types';

export type Side = 0 | 1;
export const SIDES = [0, 1] as const;
export const otherSide = (s: Side): Side => (s === 0 ? 1 : 0);

export type StageKey = Exclude<StatKey, 'hp'> | 'acc' | 'eva';
export type StatusName = 'burn' | 'paralysis' | 'poison' | 'toxic' | 'sleep' | 'freeze';

export interface BattleMove {
  moveId: number;
  pp: number;
  maxPp: number;
}

export interface Battler {
  set: PokemonSet;
  name: string;
  level: number;
  types: PokeType[];
  stats: Stats;
  hp: number;
  maxHp: number;
  moves: BattleMove[];
  abilityId: number;
  /** Se aplicará en la fase 3. */
  status: StatusName | null;
  stages: Record<StageKey, number>;
}

export interface BattleSide {
  team: Battler[];
  active: number;
}

export interface Battle {
  sides: [BattleSide, BattleSide];
  turn: number;
  winner: Side | null;
}

/** Forcejeo: se usa solo cuando no quedan PP. Sin tipo, 50 de potencia y retroceso de 1/4 de los PS máximos. */
export const STRUGGLE_ID = 0;
export const STRUGGLE: Move = {
  id: STRUGGLE_ID,
  slug: 'struggle',
  name: 'Forcejeo',
  type: 'normal',
  category: 'physical',
  power: 50,
  accuracy: null,
  pp: 1,
  priority: 0,
  target: 10,
  effectId: 0,
  effectChance: null,
  meta: {
    ailmentId: 0, ailmentChance: 0, flinchChance: 0, statChance: 0, critRate: 0,
    drain: 0, healing: 0, minHits: null, maxHits: null, statChanges: [],
  },
};

export const moveOf = (id: number): Move => (id === STRUGGLE_ID ? STRUGGLE : getMove(id));

export const newStages = (): Record<StageKey, number> => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });

export function createBattler(set: PokemonSet): Battler {
  const species = getSpecies(set.speciesId);
  const stats = computeStats(set.speciesId, set.build);
  return {
    set,
    name: species.name,
    level: set.build.level,
    types: [...species.types],
    stats,
    hp: stats.hp,
    maxHp: stats.hp,
    moves: set.moveIds.map((moveId) => ({ moveId, pp: getMove(moveId).pp, maxPp: getMove(moveId).pp })),
    abilityId: set.abilityId,
    status: null,
    stages: newStages(),
  };
}

export function createBattle(team0: PokemonSet[], team1: PokemonSet[]): Battle {
  if (!team0.length || !team1.length) throw new Error('Cada bando necesita al menos un Pokémon');
  return {
    sides: [
      { team: team0.map(createBattler), active: 0 },
      { team: team1.map(createBattler), active: 0 },
    ],
    turn: 0,
    winner: null,
  };
}

export const activeOf = (battle: Battle, side: Side): Battler => {
  const s = battle.sides[side];
  return s.team[s.active]!;
};

export const hasAlive = (battle: Battle, side: Side) => battle.sides[side].team.some((b) => b.hp > 0);
