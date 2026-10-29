import type { BattleEvent } from './engine';
import type { Side } from './state';

/** Texto del registro de combate en español. `ownSide` es el bando del jugador (el otro se marca como rival). */
export function describeEvent(e: BattleEvent, ownSide: Side = 0): string | null {
  const who = (side: Side, name: string) => (side === ownSide ? name : `${name} rival`);
  switch (e.type) {
    case 'turn': return null;
    case 'move': return `${who(e.side, e.pokemon)} usó ${e.move}.`;
    case 'miss': return `¡El ataque de ${who(e.side, e.pokemon)} falló!`;
    case 'immune': return `No afecta a ${who(e.side, e.pokemon)}…`;
    case 'noEffect': return 'Pero no pasó nada.';
    case 'crit': return '¡Un golpe crítico!';
    case 'effectiveness':
      return e.multiplier > 1 ? '¡Es muy eficaz!' : 'No es muy eficaz…';
    case 'damage':
      return e.cause === 'recoil' ? `${who(e.side, e.pokemon)} se hirió por el retroceso.` : null;
    case 'faint': return `¡${who(e.side, e.pokemon)} se debilitó!`;
    case 'win': return e.side === ownSide ? '¡Has ganado el combate!' : 'Has perdido el combate…';
  }
}
