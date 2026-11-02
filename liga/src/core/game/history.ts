import type { GameState, MatchLogEntry } from './types';

export interface HeadToHead {
  /** Combates entre las dos cuentas, el más reciente primero. */
  matches: MatchLogEntry[];
  winsA: number;
  winsB: number;
  /** Pokémon debilitados: los de B que derribó A y los de A que derribó B. */
  faintedCausedByA: number;
  faintedCausedByB: number;
}

/** Historial de combates de liga entre dos cuentas (en cualquier temporada). */
export function headToHead(state: GameState, idA: string, idB: string): HeadToHead {
  const matches = state.matchLog.filter((m) => (m.aId === idA && m.bId === idB) || (m.aId === idB && m.bId === idA)).reverse();
  const out: HeadToHead = { matches, winsA: 0, winsB: 0, faintedCausedByA: 0, faintedCausedByB: 0 };
  for (const m of matches) {
    if (m.winnerId === idA) out.winsA++;
    else out.winsB++;
    // faintedA = Pokémon de `m.aId` debilitados: los causó el otro
    if (m.aId === idA) {
      out.faintedCausedByB += m.faintedA;
      out.faintedCausedByA += m.faintedB;
    } else {
      out.faintedCausedByA += m.faintedA;
      out.faintedCausedByB += m.faintedB;
    }
  }
  return out;
}
