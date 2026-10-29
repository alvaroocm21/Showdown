import { rollPokemon, rollTeam } from '../../core/generator';
import { moveTeamMember } from '../../core/game/profiles';
import { canRerollTeam, findProfile, inSeason, removeProfile, updateProfile } from '../../core/game/state';
import { renderPokemonCard } from '../pokemonCard';
import { esc, avatarHtml } from '../shared';
import type { AppCtx } from '../app';

export function mountProfile(ctx: AppCtx, id: string): void {
  const state = ctx.store.get();
  const p = findProfile(state, id);
  if (!p) return ctx.go({ name: 'profiles' });
  const canReroll = canRerollTeam(state);
  const locked = inSeason(state, id);

  const cards = p.team
    .map((set, i) =>
      renderPokemonCard(
        set,
        `<div class="cardbar">
          <button class="alt small" data-up="${i}" ${i === 0 ? 'disabled' : ''}>▲ Subir</button>
          <button class="alt small" data-down="${i}" ${i === p.team.length - 1 ? 'disabled' : ''}>▼ Bajar</button>
          ${canReroll ? `<button class="alt small" data-reroll="${i}">🎲 Cambiar</button>` : ''}
        </div>`,
        i === 0 ? ' · <b class="leadtag">Líder</b>' : '',
      ),
    )
    .join('');

  ctx.root.innerHTML = `
    <div class="btop"><button class="alt small" id="back">← Perfiles</button></div>
    <div class="phead big">
      ${avatarHtml(p.avatar, 'xl')}
      <div class="pname"><h1>${esc(p.name)}</h1>
        <small>${locked ? '🏆 Participa en la temporada actual' : 'Sin competir ahora'}</small></div>
      <button class="star${p.main ? ' on' : ''}" id="star" aria-label="Perfil principal">★</button>
    </div>
    <div class="toolbar wrap">
      <button class="main" id="friendly">⚔️ Combate amistoso</button>
      ${canReroll ? '<button class="alt" id="reroll">🎲 Nuevo equipo</button>' : '<span class="hint">Equipo bloqueado durante la temporada</span>'}
    </div>
    <p class="sub">El primero de la lista es el que sale al combate.</p>
    <section class="team">${cards}</section>
    ${locked ? '' : '<div class="danger"><button class="alt small" id="delete">🗑 Borrar perfil</button></div>'}`;

  const $ = (sel: string) => ctx.root.querySelector<HTMLElement>(sel);
  const redraw = () => mountProfile(ctx, id);
  $('#back')!.addEventListener('click', () => ctx.go({ name: 'profiles' }));
  $('#star')!.addEventListener('click', () => {
    ctx.store.commit(updateProfile(ctx.store.get(), id, (x) => ({ ...x, main: !x.main })));
    redraw();
  });

  const friendly = (): void =>
    ctx.battle({
      myTeam: p.team,
      foeTeam: rollTeam(ctx.rng()),
      title: `${p.name} · amistoso`,
      onExit: () => ctx.go({ name: 'profile', id }),
      onRematch: friendly,
    });
  $('#friendly')!.addEventListener('click', friendly);

  $('#reroll')?.addEventListener('click', () => {
    if (!window.confirm(`¿Sortear un equipo nuevo para ${p.name}? Se pierde el actual.`)) return;
    ctx.store.commit(updateProfile(ctx.store.get(), id, (x) => ({ ...x, team: rollTeam(ctx.rng()) })));
    redraw();
  });

  ctx.root.querySelectorAll<HTMLButtonElement>('[data-up],[data-down]').forEach((b) =>
    b.addEventListener('click', () => {
      const up = b.dataset.up !== undefined;
      const index = Number(up ? b.dataset.up : b.dataset.down);
      ctx.store.commit(updateProfile(ctx.store.get(), id, (x) => moveTeamMember(x, index, up ? -1 : 1)));
      redraw();
    }),
  );
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-reroll]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.reroll);
      const cur = ctx.store.get().profiles.find((x) => x.id === id)!;
      const others = new Set(cur.team.filter((_, j) => j !== i).map((s) => s.speciesId));
      const replacement = rollPokemon(ctx.rng(), others);
      ctx.store.commit(updateProfile(ctx.store.get(), id, (x) => ({ ...x, team: x.team.map((s, j) => (j === i ? replacement : s)) })));
      redraw();
    }),
  );

  $('#delete')?.addEventListener('click', () => {
    if (!window.confirm(`¿Borrar el perfil «${p.name}» y su equipo? No se puede deshacer.`)) return;
    try {
      ctx.store.commit(removeProfile(ctx.store.get(), id));
      ctx.toast(`Perfil «${p.name}» borrado`);
      ctx.go({ name: 'profiles' });
    } catch (e) {
      ctx.toast((e as Error).message);
    }
  });
}
