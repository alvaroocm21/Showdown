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
  disabled: '¡El ataque de {p} está anulado!',
  recharge: '{p} debe recuperarse de su ataque.',
  truant: '{p} está holgazaneando.',
};

const WEATHER_START: Record<string, string> = {
  sun: 'Hace mucho sol.', rain: 'Ha empezado a llover.', sand: 'Se levanta una tormenta de arena.', snow: 'Empieza a nevar.',
  'harsh-sun': '¡Los rayos del sol se vuelven abrasadores!', 'heavy-rain': '¡Ha empezado a caer un diluvio!',
  'strong-winds': '¡Soplan vientos misteriosos!',
};
const WEATHER_END: Record<string, string> = {
  sun: 'Se acabó el sol.', rain: 'Ha dejado de llover.', sand: 'La tormenta de arena se ha calmado.', snow: 'Ha dejado de nevar.',
  'harsh-sun': 'Los rayos del sol han vuelto a la normalidad.', 'heavy-rain': 'Ha dejado de caer el diluvio.',
  'strong-winds': 'Los vientos misteriosos se han calmado.',
};
const WEATHER_TEXT = (weather: string | null, was: string | null): string | null =>
  weather ? WEATHER_START[weather]! : was ? WEATHER_END[was]! : null;
const TERRAIN_START: Record<string, string> = {
  electric: 'Una corriente eléctrica recorre el campo.', grassy: 'Ha crecido hierba en el campo.',
  misty: 'La niebla se extiende por el campo.', psychic: 'El campo se llena de una extraña sensación.',
};
const TERRAIN_END: Record<string, string> = {
  electric: 'La corriente eléctrica se ha disipado.', grassy: 'La hierba ha desaparecido.',
  misty: 'La niebla se ha disipado.', psychic: 'La extraña sensación ha desaparecido.',
};
const TERRAIN_TEXT = (terrain: string | null, was: string | null): string | null =>
  terrain ? TERRAIN_START[terrain]! : was ? TERRAIN_END[was]! : null;

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
        case 'weather': return `${who(e.side, e.pokemon)} sufre la tormenta de arena.`;
        case 'confusion': return '¡Está tan confuso que se hirió a sí mismo!';
        case 'perish': return `${who(e.side, e.pokemon)} se debilita por la cuenta atrás.`;
        case 'bad-dreams': return `${who(e.side, e.pokemon)} sufre pesadillas.`;
        case 'ability': return `${who(e.side, e.pokemon)} sufrió daño.`;
        case 'disguise': return `${who(e.side, e.pokemon)} perdió su disfraz.`;
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
    case 'weather': return WEATHER_TEXT(e.weather, e.was);
    case 'terrain': return TERRAIN_TEXT(e.terrain, e.was);
    case 'volatile': {
      const name = who(e.side, e.pokemon);
      if (e.kind === 'confusion') return e.on ? `¡${name} está confuso!` : `¡${name} ya no está confuso!`;
      if (e.kind === 'perish') return e.on ? `La cuenta atrás de ${name}: ${e.turns}.` : null;
      return e.on ? `¡El último ataque de ${name} ha sido anulado!` : `${name} puede volver a usar su ataque.`;
    }
    case 'types': return `${who(e.side, e.pokemon)} cambió de tipo.`;
    case 'mega': return `¡${e.name}${e.side === ownSide ? '' : ' rival'} ha megaevolucionado!`;
    case 'transform': return `${who(e.side, e.pokemon)} se transformó en ${e.name}.`;
    case 'zmove': return `¡${who(e.side, e.pokemon)} se envuelve en un poder Z!`;
    case 'faint': return `¡${who(e.side, e.pokemon)} se debilitó!`;
    case 'win': return e.side === ownSide ? '¡Has ganado el combate!' : 'Has perdido el combate…';
  }
}
