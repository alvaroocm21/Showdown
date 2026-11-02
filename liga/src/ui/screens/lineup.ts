import { TYPE_NAMES_ES, getSpecies, spriteUrl } from '../../core/data';
import { LINEUP_SIZE, autoLineup } from '../../core/game/lineup';
import type { Profile } from '../../core/game/types';
import type { PokemonSet } from '../../core/types';
import type { AppCtx } from '../app';
import { avatarHtml, esc, typeChip } from '../shared';

export interface LineupOptions {
  profile: Profile;
  /** Pokémon (id de especie) que descansan y no se pueden elegir. */
  unavailable: ReadonlySet<number>;
  title: string;
  subtitle?: string;
  confirmLabel: string;
}

/** Pantalla para elegir los 6 Pokémon (y su orden: el primero sale al campo) entre los 15 de la plantilla. Devuelve null si se cancela. */
export function pickLineup(ctx: AppCtx, o: LineupOptions): Promise<PokemonSet[] | null> {
  return new Promise((resolve) => {
    const chosen: number[] = [];   // posiciones de la plantilla, en orden de elección
    const roster = o.profile.team;
    const resting = (s: PokemonSet) => o.unavailable.has(s.speciesId);
    const freeCount = roster.filter((s) => !resting(s)).length;
    const need = Math.min(LINEUP_SIZE, freeCount);

    const draw = (): void => {
      const cards = roster
        .map((s, i) => {
          const sp = getSpecies(s.speciesId);
          const pos = chosen.indexOf(i);
          const off = resting(s);
          return `<button class="lpk${pos >= 0 ? ' on' : ''}${off ? ' off' : ''}" data-i="${i}" ${off ? 'disabled' : ''}>
            ${pos >= 0 ? `<i class="lnum">${pos + 1}</i>` : ''}
            <img src="${spriteUrl(sp.id)}" alt="" loading="lazy" />
            <b>${esc(sp.name)}</b>
            <span class="chips">${sp.types.map(typeChip).join('')}</span>
            ${off ? '<small class="lrest">🤕 Descansa esta jornada</small>' : `<small>${sp.types.map((t) => TYPE_NAMES_ES[t]).join(' / ')}</small>`}
          </button>`;
        })
        .join('');
      ctx.root.innerHTML = `
        <div class="btop"><button class="alt small" id="lcancel">← Volver</button></div>
        <div class="phead">${avatarHtml(o.profile.avatar)}<div class="pname"><b>${esc(o.title)}</b>${o.subtitle ? `<small>${esc(o.subtitle)}</small>` : ''}</div></div>
        <p class="sub">Elige ${need} Pokémon de los ${roster.length} (el 1.º sale primero) · <b>${chosen.length}/${need}</b>${freeCount < roster.length ? ` · ${roster.length - freeCount} descansan` : ''}</p>
        <div class="toolbar wrap"><button class="alt small" id="lauto">🎲 Automático</button><button class="alt small" id="lclear" ${chosen.length ? '' : 'disabled'}>Quitar todos</button></div>
        <section class="lgrid">${cards}</section>
        <div class="lbar"><button class="main" id="lok" ${chosen.length === need ? '' : 'disabled'}>${esc(o.confirmLabel)}</button></div>`;
      ctx.root.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i);
          const at = chosen.indexOf(i);
          if (at >= 0) chosen.splice(at, 1);
          else if (chosen.length < need) chosen.push(i);
          draw();
        }),
      );
      ctx.root.querySelector('#lauto')!.addEventListener('click', () => {
        const pool = roster.filter((s) => !resting(s));
        chosen.length = 0;
        for (const s of autoLineup(pool, ctx.rng())) chosen.push(roster.indexOf(s));
        draw();
      });
      ctx.root.querySelector('#lclear')!.addEventListener('click', () => {
        chosen.length = 0;
        draw();
      });
      ctx.root.querySelector('#lok')!.addEventListener('click', () => resolve(chosen.map((i) => roster[i]!)));
      ctx.root.querySelector('#lcancel')!.addEventListener('click', () => resolve(null));
    };
    draw();
    window.scrollTo(0, 0);
  });
}
