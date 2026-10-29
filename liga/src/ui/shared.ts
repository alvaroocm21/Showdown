import { TYPE_NAMES_ES } from '../core/data';
import type { PokeType } from '../core/types';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const typeVar = (t: PokeType) => `var(--t-${t})`;
export const typeChip = (t: PokeType) =>
  `<span class="chip" style="--tc:${typeVar(t)}">${esc(TYPE_NAMES_ES[t])}</span>`;

import { getMove } from '../core/data';
import { EFFECT, isMoveImplemented, moveKind, statusOf, targetsUser } from '../core/battle/moves';
import { STATUS_NAME_ES } from '../core/battle/log';
import type { Move, StageKey } from '../core/types';

export const STAGE_SHORT: Record<StageKey, string> = { atk: 'Atq', def: 'Def', spa: 'AtE', spd: 'DeE', spe: 'Vel', acc: 'Pre', eva: 'Eva' };

/** Descripción corta de lo que hace un ataque, o aviso de que aún no tiene efecto. */
export function moveEffectText(m: Move): string {
  switch (moveKind(m)) {
    case 'none': return 'sin efecto aún';
    case 'ohko': return 'KO de un golpe';
    case 'fixed': return 'daño fijo';
    case 'damage': {
      const bits: string[] = [];
      if (m.meta.minHits && m.meta.maxHits) bits.push(m.meta.minHits === m.meta.maxHits ? `${m.meta.minHits} golpes` : `${m.meta.minHits}-${m.meta.maxHits} golpes`);
      if (m.meta.drain > 0) bits.push('drena');
      if (m.meta.drain < 0) bits.push('retroceso');
      if (m.flags.charge) bits.push('2 turnos');
      if (m.flags.recharge) bits.push('recarga');
      if (m.effectId === EFFECT.selfDestruct) bits.push('se debilita');
      const st = statusOf(m);
      if (st && m.meta.ailmentChance) bits.push(`${m.meta.ailmentChance} % ${STATUS_NAME_ES[st].toLowerCase()}`);
      return bits.join(' · ');
    }
    case 'status': {
      if (m.effectId === EFFECT.rest) return 'cura todo y duerme';
      if (m.meta.category === 3) return `cura ${m.meta.healing} % PS`;
      if (m.meta.category === 1) return `provoca ${STATUS_NAME_ES[statusOf(m)!].toLowerCase()}`;
      const who = targetsUser(m) ? 'propio' : 'rival';
      return `${m.meta.statChanges.map((c) => `${STAGE_SHORT[c.stat]} ${c.change > 0 ? '+' : ''}${c.change}`).join(' ')} ${who}`;
    }
  }
}

export const moveNeedsWarning = (id: number) => !isMoveImplemented(getMove(id));
