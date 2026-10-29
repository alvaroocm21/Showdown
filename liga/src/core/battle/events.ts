import type { PokeType, StageKey } from '../types';
import type { Side, StatusName } from './state';

export type DamageCause = 'move' | 'recoil' | 'burn' | 'poison' | 'rough-skin' | 'liquid-ooze' | 'selfdestruct';
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
  | { type: 'faint'; side: Side; pokemon: string }
  | { type: 'win'; side: Side };
