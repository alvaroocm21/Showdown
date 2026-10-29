import { TYPE_NAMES_ES } from '../core/data';
import type { PokeType } from '../core/types';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const typeVar = (t: PokeType) => `var(--t-${t})`;
export const typeChip = (t: PokeType) =>
  `<span class="chip" style="--tc:${typeVar(t)}">${esc(TYPE_NAMES_ES[t])}</span>`;
