import type { StageKey } from '../types';
import type { BattleEvent } from './events';
import type { Side, StatusName } from './state';

const STAT_ES: Record<StageKey, string> = {
  atk: 'El Ataque', def: 'La Defensa', spa: 'El Ataque Esp.', spd: 'La Defensa Esp.',
  spe: 'La Velocidad', acc: 'La Precisión', eva: 'La Evasión',
};

export const STATUS_LABEL: Record<StatusName, string> = {
  burn: 'QUE', paralysis: 'PAR', poison: 'ENV', toxic: 'ENV+', sleep: 'DOR', freeze: 'CON',
};
export const STATUS_NAME_ES: Record<StatusName, string> = {
  burn: 'Quemado', paralysis: 'Paralizado', poison: 'Envenenado', toxic: 'Gravemente envenenado', sleep: 'Dormido', freeze: 'Congelado',
};

const STATUS_TEXT: Record<StatusName, string> = {
  burn: '{p} se quemó.',
  paralysis: '¡{p} está paralizado! Quizá no pueda moverse.',
  poison: '{p} fue envenenado.',
  toxic: '{p} fue gravemente envenenado.',
  sleep: '{p} se durmió.',
  freeze: '{p} se congeló.',
};

const CANT_MOVE: Record<string, string> = {
  sleep: '{p} está profundamente dormido.',
  freeze: '{p} está congelado y no puede moverse.',
  paralysis: '¡{p} está paralizado! ¡No se puede mover!',
  flinch: '¡{p} retrocedió y no pudo moverse!',
  recharge: '{p} debe recuperarse de su ataque.',
  truant: '{p} está holgazaneando.',
};

/** Texto del registro de combate en español. `ownSide` es el bando del jugador (el otro se marca como rival). */
export function describeEvent(e: BattleEvent, ownSide: Side = 0): string | null {
  const who = (side: Side, name: string) => (side === ownSide ? name : `${name} rival`);
  switch (e.type) {
    case 'turn': return null;
    case 'move': return `${who(e.side, e.pokemon)} usó ${e.move}.`;
    case 'charge': return `${who(e.side, e.pokemon)} se está preparando.`;
    case 'cantMove': return CANT_MOVE[e.reason]!.replace('{p}', who(e.side, e.pokemon));
    case 'miss': return `¡El ataque de ${who(e.side, e.pokemon)} falló!`;
    case 'immune': return `No afecta a ${who(e.side, e.pokemon)}…`;
    case 'failed': return '¡Pero falló!';
    case 'noEffect': return 'Pero no pasó nada.';
    case 'crit': return '¡Un golpe crítico!';
    case 'effectiveness': return e.multiplier > 1 ? '¡Es muy eficaz!' : e.multiplier < 1 ? 'No es muy eficaz…' : null;
    case 'hits': return `¡Golpeó ${e.count} veces!`;
    case 'damage':
      switch (e.cause) {
        case 'recoil': return `${who(e.side, e.pokemon)} se hirió por el retroceso.`;
        case 'burn': return `${who(e.side, e.pokemon)} sufrió quemaduras.`;
        case 'poison': return `${who(e.side, e.pokemon)} sufrió por el veneno.`;
        case 'rough-skin': return `${who(e.side, e.pokemon)} resultó herido.`;
        case 'liquid-ooze': return `${who(e.side, e.pokemon)} absorbió el líquido tóxico.`;
        default: return null;
      }
    case 'heal': return `${who(e.side, e.pokemon)} recuperó PS.`;
    case 'status': {
      const name = who(e.side, e.pokemon);
      if (e.status) return STATUS_TEXT[e.status].replace('{p}', name);
      if (e.was === 'sleep') return `¡${name} se despertó!`;
      if (e.was === 'freeze') return `¡${name} se descongeló!`;
      return `${name} se curó.`;
    }
    case 'stage': {
      const name = who(e.side, e.pokemon);
      if (e.change === 0) return `${STAT_ES[e.stat]} de ${name} no puede ${e.stage > 0 ? 'subir' : 'bajar'} más.`;
      const size = Math.abs(e.change);
      const adv = size === 1 ? '' : size === 2 ? ' mucho' : ' muchísimo';
      return `${STAT_ES[e.stat]} de ${name} ${e.change > 0 ? 'subió' : 'bajó'}${adv}.`;
    }
    case 'ability': return `¡${e.ability} de ${who(e.side, e.pokemon)}!${e.message ? ` ${e.message}` : ''}`;
    case 'recall': return e.side === ownSide ? `¡Vuelve, ${e.pokemon}!` : `El rival retiró a ${e.pokemon}.`;
    case 'switch': return e.side === ownSide ? `¡Adelante, ${e.pokemon}!` : `El rival sacó a ${e.pokemon}.`;
    case 'faint': return `¡${who(e.side, e.pokemon)} se debilitó!`;
    case 'win': return e.side === ownSide ? '¡Has ganado el combate!' : 'Has perdido el combate…';
  }
}
