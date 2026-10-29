import type { PokeType, StageKey } from '../types';
import type { Side, StatusName, Terrain, Weather } from './state';

export type DamageCause =
  | 'move' | 'recoil' | 'burn' | 'poison' | 'rough-skin' | 'liquid-ooze' | 'selfdestruct'
  | 'weather' | 'confusion' | 'perish' | 'ability' | 'bad-dreams' | 'disguise';
export type CantMoveReason = 'sleep' | 'freeze' | 'paralysis' | 'flinch' | 'recharge' | 'truant';

export type BattleEvent =
  | { type: 'turn'; turn: number }
  | { type: 'move'; side: Side; pokemon: string; move: string; moveType: PokeType }
  | { type: 'charge'; side: Side; pokemon: string }
  | { type: 'cantMove'; side: Side; pokemon: string; reason: CantMoveReason }
  | { type: 'miss'; side: Side; pokemon: string }
  | { type: 'immune'; side: Side; pokemon: string }
  | { type: 'failed' }
  | { type: 'noEffect' }
  | { type: 'crit' }
  | { type: 'effectiveness'; multiplier: number }
  | { type: 'hits'; count: number }
  | { type: 'damage'; side: Side; pokemon: string; amount: number; hp: number; maxHp: number; cause: DamageCause }
  | { type: 'heal'; side: Side; pokemon: string; amount: number; hp: number; maxHp: number }
  /** status null = curado (was = el que tenía). */
  | { type: 'status'; side: Side; pokemon: string; status: StatusName | null; was?: StatusName }
  /** change 0 = no puede subir/bajar más (stage = nivel actual). */
  | { type: 'stage'; side: Side; pokemon: string; stat: StageKey; change: number; stage: number }
  | { type: 'ability'; side: Side; pokemon: string; ability: string; message?: string }
  | { type: 'recall'; side: Side; pokemon: string }
  | {
      type: 'switch';
      side: Side;
      index: number;
      pokemon: string;
      speciesId: number;
      level: number;
      types: PokeType[];
      hp: number;
      maxHp: number;
      status: StatusName | null;
    }
  | { type: 'weather'; weather: Weather | null; was: Weather | null }
  | { type: 'terrain'; terrain: Terrain | null; was: Terrain | null }
  /** Confusión, Canto Mortal o ataque bloqueado: on = empieza, !on = termina. */
  | { type: 'volatile'; side: Side; pokemon: string; kind: 'confusion' | 'perish' | 'disable'; on: boolean; turns?: number }
  /** Cambio de tipos (Cambio Color, Líbero, Mutatipo…). */
  | { type: 'types'; side: Side; pokemon: string; types: PokeType[] }
  /** Megaevolución: el Pokémon cambia de forma (sprite, tipos y PS máximos). */
  | { type: 'mega'; side: Side; pokemon: string; speciesId: number; name: string; types: PokeType[]; hp: number; maxHp: number }
  /** Impostor: se transforma en el rival. */
  | { type: 'transform'; side: Side; pokemon: string; speciesId: number; name: string; types: PokeType[] }
  /** Un Pokémon usa su movimiento Z. */
  | { type: 'zmove'; side: Side; pokemon: string }
  | { type: 'faint'; side: Side; pokemon: string }
  | { type: 'win'; side: Side };
