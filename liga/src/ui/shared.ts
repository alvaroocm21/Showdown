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
      if (m.meta.category === 1) {
        const st = statusOf(m);
        if (st) return `provoca ${STATUS_NAME_ES[st].toLowerCase()}`;
        if (m.meta.ailmentId === 6) return 'provoca confusión';
        return 'efecto de estado';
      }
      const who = targetsUser(m) ? 'propio' : 'rival';
      return `${m.meta.statChanges.map((c) => `${STAGE_SHORT[c.stat]} ${c.change > 0 ? '+' : ''}${c.change}`).join(' ')} ${who}`;
    }
  }
}

export const moveNeedsWarning = (id: number) => !isMoveImplemented(getMove(id));

import type { Avatar } from '../core/game/types';

export const avatarHtml = (a: Avatar, cls = '') => `<span class="avatar ${cls}" style="--h:${Math.round(a.hue)}">${esc(a.emoji)}</span>`;

const CONFETTI_COLORS = ['#fde047', '#f472b6', '#60a5fa', '#4ade80', '#fb923c', '#c084fc'];

/** Lluvia de confeti (solo CSS) dentro de `parent`. Se limpia sola al terminar. */
export function confetti(parent: HTMLElement, pieces = 42): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('i');
    piece.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
    piece.style.setProperty('--d', `${(Math.random() * 1.2).toFixed(2)}s`);
    piece.style.setProperty('--t', `${(2.2 + Math.random() * 1.6).toFixed(2)}s`);
    piece.style.setProperty('--r', `${Math.round(Math.random() * 360)}deg`);
    piece.style.setProperty('--c', CONFETTI_COLORS[i % CONFETTI_COLORS.length]!);
    box.appendChild(piece);
  }
  parent.appendChild(box);
  setTimeout(() => box.remove(), 4500);
}
