import { getMove, getSpecies } from '../data';
import { computeStats } from '../stats';
import type { Move, PokemonSet, PokeType, StageKey, Stats } from '../types';

export type Side = 0 | 1;
export const SIDES = [0, 1] as const;
export const otherSide = (s: Side): Side => (s === 0 ? 1 : 0);

export type { StageKey };
export type StatusName = 'burn' | 'paralysis' | 'poison' | 'toxic' | 'sleep' | 'freeze';

/** Clima: normales (5 turnos) y fuertes (duran mientras el Pokémon que los provoca siga en el campo). */
export type Weather = 'sun' | 'rain' | 'sand' | 'snow' | 'harsh-sun' | 'heavy-rain' | 'strong-winds';
export type Terrain = 'electric' | 'grassy' | 'misty' | 'psychic';

export interface Field {
  weather: Weather | null;
  weatherTurns: number;
  /** Bando del Pokémon que provocó un clima fuerte. */
  weatherSource: Side | null;
  terrain: Terrain | null;
  terrainTurns: number;
}
export const newField = (): Field => ({ weather: null, weatherTurns: 0, weatherSource: null, terrain: null, terrainTurns: 0 });

export interface BattleMove {
  moveId: number;
  pp: number;
  maxPp: number;
}

export interface Battler {
  set: PokemonSet;
  /** Forma actual (id del Pokémon): cambia al megaevolucionar. */
  speciesId: number;
  /** Ha megaevolucionado. */
  mega: boolean;
  name: string;
  level: number;
  types: PokeType[];
  stats: Stats;
  hp: number;
  maxHp: number;
  moves: BattleMove[];
  abilityId: number;
  status: StatusName | null;
  /** Dormido: turnos que le quedan sin poder moverse. */
  sleepTurns: number;
  /** Gravemente envenenado: contador que sube cada turno (daño = n/16). */
  toxicCount: number;
  stages: Record<StageKey, number>;
  fainted: boolean;
  flinched: boolean;
  movedThisTurn: boolean;
  /** Es su primer turno en el campo (Sorpresa solo funciona entonces). */
  firstTurn: boolean;
  /** Posición del ataque de dos turnos que está preparando. */
  charging: number | null;
  recharging: boolean;
  /** Holgazán: este turno no hace nada. */
  loafing: boolean;
  /** Absorbe Fuego: sus ataques de fuego están potenciados. */
  flashFire: boolean;
  /** Confuso: turnos que le quedan (0 = no está confuso). */
  confused: number;
  /** Canto Mortal / Cuerpo Mortal: turnos para debilitarse (0 = no). */
  perish: number;
  /** Anulación / Cuerpo Maldito: ataque bloqueado y turnos restantes. */
  disabled: { moveId: number; turns: number } | null;
  /** Táctica Gorila: solo puede repetir este ataque (posición). */
  locked: number | null;
  /** Inicio Lento: turnos que le quedan con la mitad de Ataque y Velocidad. */
  slowStart: number;
  /** Dinamo / Energía Eólica: el próximo ataque eléctrico se potencia. */
  charged: boolean;
  /** Gas Reactivo de un rival: sus habilidades no actúan. */
  suppressed: boolean;
  /** Disfraz / Cara de Hielo: ya se ha usado. */
  disguiseBroken: boolean;
  iceFaceBroken: boolean;
  /** Mutatipo / Líbero: ya cambió de tipo desde que entró. */
  typeChanged: boolean;
  /** Habilidad que tenía al empezar (la actual puede cambiar: Calco, Momia…). */
  baseAbilityId: number;
  /** Datos originales mientras está transformado (Impostor). */
  transformBackup: { speciesId: number; name: string; stats: Stats; moves: BattleMove[]; types: PokeType[]; abilityId: number } | null;
  /** Potenciación de Protosíntesis / Impulso Cuark: la estadística más alta. */
  boosted: import('../types').StatKey | null;
  /** Último ataque que usó (para Anulación). */
  lastMoveId: number | null;
  /** Sale del campo al final del turno (Retirada / Huida de Emergencia). */
  forceOut: boolean;
}

export interface BattleSide {
  team: Battler[];
  active: number;
  /** Ya se ha usado la megaevolución / el movimiento Z en este combate (una vez por bando). */
  megaUsed: boolean;
  zUsed: boolean;
  /** Pokémon debilitados de este bando (Señor Supremo). */
  faintedCount: number;
  /** Turno en el que entró el Pokémon activo (para que la IA no cambie sin parar). */
  enteredTurn: number;
}

export interface Battle {
  sides: [BattleSide, BattleSide];
  turn: number;
  winner: Side | null;
  field: Field;
  /** El bando debe elegir un Pokémon de reemplazo (el activo se ha debilitado). */
  pending: [boolean, boolean];
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
  flags: {
    contact: true, charge: false, recharge: false, sound: false, defrost: false, reflectable: false, punch: false,
    bite: false, pulse: false, ballistics: false, powder: false, dance: false, heal: false,
  },
  meta: {
    category: 0, ailmentId: 0, ailmentChance: 0, flinchChance: 0, statChance: 0, critRate: 0,
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
    speciesId: set.speciesId,
    mega: false,
    name: species.name,
    level: set.build.level,
    types: [...species.types],
    stats,
    hp: stats.hp,
    maxHp: stats.hp,
    moves: set.moveIds.map((moveId) => ({ moveId, pp: getMove(moveId).pp, maxPp: getMove(moveId).pp })),
    abilityId: set.abilityId,
    status: null,
    sleepTurns: 0,
    toxicCount: 1,
    stages: newStages(),
    fainted: false,
    flinched: false,
    movedThisTurn: false,
    firstTurn: true,
    charging: null,
    recharging: false,
    loafing: false,
    flashFire: false,
    confused: 0,
    perish: 0,
    disabled: null,
    locked: null,
    slowStart: 0,
    charged: false,
    suppressed: false,
    disguiseBroken: false,
    iceFaceBroken: false,
    typeChanged: false,
    baseAbilityId: set.abilityId,
    transformBackup: null,
    boosted: null,
    lastMoveId: null,
    forceOut: false,
  };
}

/** Lo que se pierde al salir del campo (las mejoras, los estados volátiles…). El estado principal se conserva. */
export function resetVolatile(b: Battler): void {
  b.stages = newStages();
  b.flinched = false;
  b.movedThisTurn = false;
  b.firstTurn = true;
  b.charging = null;
  b.recharging = false;
  b.loafing = false;
  b.flashFire = false;
  b.toxicCount = 1;
  b.confused = 0;
  b.perish = 0;
  b.disabled = null;
  b.locked = null;
  b.slowStart = 0;
  b.charged = false;
  b.suppressed = false;
  b.typeChanged = false;
  b.boosted = null;
  b.lastMoveId = null;
  b.forceOut = false;
  // Impostor: vuelve a ser él mismo
  if (b.transformBackup) {
    const t = b.transformBackup;
    b.speciesId = t.speciesId;
    b.name = t.name;
    b.stats = t.stats;
    b.moves = t.moves;
    b.transformBackup = null;
  }
  b.abilityId = b.baseAbilityId;
  b.types = [...getSpecies(b.speciesId).types];
}

export function createBattle(team0: PokemonSet[], team1: PokemonSet[]): Battle {
  if (!team0.length || !team1.length) throw new Error('Cada bando necesita al menos un Pokémon');
  return {
    sides: [
      { team: team0.map(createBattler), active: 0, enteredTurn: 0, megaUsed: false, zUsed: false, faintedCount: 0 },
      { team: team1.map(createBattler), active: 0, enteredTurn: 0, megaUsed: false, zUsed: false, faintedCount: 0 },
    ],
    turn: 0,
    winner: null,
    field: newField(),
    pending: [false, false],
  };
}

export const activeOf = (battle: Battle, side: Side): Battler => {
  const s = battle.sides[side];
  return s.team[s.active]!;
};

export const sideOfBattler = (battle: Battle, b: Battler): Side => (battle.sides[0].team.includes(b) ? 0 : 1);

export const hasAlive = (battle: Battle, side: Side) => battle.sides[side].team.some((b) => b.hp > 0);
