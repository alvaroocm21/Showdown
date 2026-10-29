import { getAbility, getMove, getSpecies } from '../../core/data';
import { UPGRADE_COSTS } from '../../core/game/economy';
import { applyUpgrade, type Upgrade } from '../../core/game/shop';
import { rollPokemon, rollTeam } from '../../core/generator';
import { moveTeamMember } from '../../core/game/profiles';
import { canRerollTeam, findProfile, inSeason, removeProfile, updateProfile } from '../../core/game/state';
import { renderPokemonCard, type CardFlash } from '../pokemonCard';
import { esc, avatarHtml } from '../shared';
import type { AppCtx } from '../app';

/** Qué Pokémon tienen abierto el panel de mejoras, y lo último que cambió (se resalta una vez). */
const openShops = new Set<number>();
let lastChange: { index: number; flash: CardFlash } | null = null;

export function mountProfile(ctx: AppCtx, id: string): void {
  const state = ctx.store.get();
  const p = findProfile(state, id);
  if (!p) return ctx.go({ name: 'profiles' });
  const canReroll = canRerollTeam(state);
  const locked = inSeason(state, id);

  const change = lastChange;
  lastChange = null;
  const buy = (label: string, attrs: string, cost: number) =>
    `<button class="shopbtn" ${attrs} ${p.coins < cost ? 'disabled' : ''}><span>${label}</span><b>${cost} 🪙</b></button>`;

  const cards = p.team
    .map((set, i) =>
      renderPokemonCard(
        set,
        `<details class="shop" data-shop="${i}" ${openShops.has(i) ? 'open' : ''}>
          <summary>🛒 Mejorar con monedas</summary>
          <div class="shoplist">
            ${set.moveIds.map((m, s) => buy(`🎲 Ataque: ${esc(getMove(m).name)}`, `data-buy="move" data-p="${i}" data-slot="${s}"`, UPGRADE_COSTS.move)).join('')}
            ${buy(`🎲 Habilidad: ${esc(getAbility(set.abilityId).name)}`, `data-buy="ability" data-p="${i}"`, UPGRADE_COSTS.ability)}
            ${buy('🔄 Sustituir por otro Pokémon', `data-buy="pokemon" data-p="${i}"`, UPGRADE_COSTS.pokemon)}
          </div>
        </details>
        <div class="cardbar">
          <button class="alt small" data-up="${i}" ${i === 0 ? 'disabled' : ''}>▲ Subir</button>
          <button class="alt small" data-down="${i}" ${i === p.team.length - 1 ? 'disabled' : ''}>▼ Bajar</button>
          ${canReroll ? `<button class="alt small" data-reroll="${i}">🎲 Gratis</button>` : ''}
        </div>`,
        i === 0 ? ' · <b class="leadtag">Líder</b>' : '',
        change && change.index === i ? change.flash : {},
      ),
    )
    .join('');

  ctx.root.innerHTML = `
    <div class="btop"><button class="alt small" id="back">← Perfiles</button></div>
    <div class="phead big">
      ${avatarHtml(p.avatar, 'xl')}
      <div class="pname"><h1>${esc(p.name)}</h1>
        <small>${locked ? '🏆 Participa en la temporada actual' : 'Sin competir ahora'}</small></div>
      <span class="coins" title="Monedas">🪙 ${p.coins}</span>
      <button class="star${p.main ? ' on' : ''}" id="star" aria-label="Perfil principal">★</button>
    </div>
    <div class="toolbar wrap">
      <button class="main" id="friendly">⚔️ Combate amistoso</button>
      ${canReroll ? '<button class="alt" id="reroll">🎲 Nuevo equipo gratis</button>' : '<span class="hint">Sorteos gratis bloqueados durante la temporada; con monedas sí puedes mejorar</span>'}
    </div>
    <p class="sub">El primero de la lista es el que sale al combate. Ganar combates da monedas (100 + 10 por cada Pokémon que sobreviva).</p>
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

  ctx.root.querySelectorAll<HTMLDetailsElement>('[data-shop]').forEach((d) =>
    d.addEventListener('toggle', () => {
      const i = Number(d.dataset.shop);
      if (d.open) openShops.add(i);
      else openShops.delete(i);
    }),
  );
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) =>
    b.addEventListener('click', () => {
      const pokemon = Number(b.dataset.p);
      const kind = b.dataset.buy as 'move' | 'ability' | 'pokemon';
      const upgrade: Upgrade = kind === 'move' ? { kind, pokemon, slot: Number(b.dataset.slot) } : { kind, pokemon };
      const cur = ctx.store.get().profiles.find((x) => x.id === id)!;
      const set = cur.team[pokemon]!;
      const what =
        kind === 'move' ? `el ataque «${getMove(set.moveIds[upgrade.kind === 'move' ? upgrade.slot : 0]!).name}»`
        : kind === 'ability' ? `la habilidad «${getAbility(set.abilityId).name}»`
        : 'el Pokémon';
      const cost = UPGRADE_COSTS[kind];
      if (!window.confirm(`¿Gastar ${cost} 🪙 en re-sortear ${what} de ${getSpecies(set.speciesId).name}? El resultado es aleatorio y no se puede deshacer.`)) return;
      try {
        const res = applyUpgrade(ctx.store.get(), id, upgrade, ctx.rng());
        ctx.store.commit(res.state);
        lastChange = { index: pokemon, flash: kind === 'move' ? { slot: res.slot } : kind === 'ability' ? { ability: true } : { pokemon: true } };
        const label = kind === 'pokemon' ? `${res.before} → ${res.after}` : `${getSpecies(set.speciesId).name}: ${res.before} → ${res.after}`;
        ctx.toast(`${label} (−${res.cost} 🪙)`);
      } catch (e) {
        ctx.toast((e as Error).message);
      }
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
