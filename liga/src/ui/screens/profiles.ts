import { createProfile, validateName, MAX_NAME_LENGTH } from '../../core/game/profiles';
import { drawOptionsOf } from '../../core/game/settings';
import { addProfile, inSeason, updateProfile } from '../../core/game/state';
import { spriteUrl } from '../../core/data';
import { esc, avatarHtml } from '../shared';
import type { AppCtx } from '../app';

let formOpen = false;

export function mountProfiles(ctx: AppCtx): void {
  const state = ctx.store.get();
  const cards = state.profiles
    .map(
      (p) => `<article class="pcard${p.id === ctx.activeId ? ' current' : ''}" data-pick="${esc(p.id)}">
        <div class="phead">
          ${avatarHtml(p.avatar)}
          <div class="pname"><b>${esc(p.name)}</b>
            <small>${inSeason(state, p.id) ? '🏆 En la liga' : 'Sin competir'}</small></div>
          <span class="coins">🪙 ${p.coins}</span>
          <button class="star${p.main ? ' on' : ''}" data-star="${esc(p.id)}" aria-label="Perfil principal" title="Perfil principal">★</button>
        </div>
        <div class="minis">${p.team.map((s, i) => `<img src="${spriteUrl(s.speciesId)}" alt="" loading="lazy" class="${i === 0 ? 'lead' : ''}" />`).join('')}</div>
        <div class="cardbar"><button class="main small" data-pick="${esc(p.id)}">▶ Jugar con ${esc(p.name)}</button><button class="alt small" data-open="${esc(p.id)}">🎒 Ver equipo</button></div>
      </article>`,
    )
    .join('');

  ctx.root.innerHTML = `
    <h1>${ctx.activeId ? 'Cambiar de perfil' : '¿Quién juega?'}</h1>
    <p class="sub">${state.profiles.length} perfil${state.profiles.length === 1 ? '' : 'es'} · toca uno para jugar con él · ★ marca tus principales</p>
    <div class="toolbar"><button class="main" id="new">${formOpen ? '✕ Cerrar' : '＋ Nuevo perfil'}</button></div>
    ${
      formOpen
        ? `<form class="card form" id="form" autocomplete="off">
            <label>Nombre<input id="name" maxlength="${MAX_NAME_LENGTH}" placeholder="Por ejemplo, Ana" required /></label>
            <label class="check"><input type="checkbox" id="main" /> ★ Perfil principal</label>
            <small id="err" class="err"></small>
            <button class="main" type="submit">🎲 Crear con equipo aleatorio</button>
          </form>`
        : ''
    }
    ${state.profiles.length ? `<section class="plist2">${cards}</section>` : '<div class="card empty">Todavía no hay perfiles. Crea al menos 4 para empezar una liga.</div>'}`;

  ctx.root.querySelector('#new')!.addEventListener('click', () => {
    formOpen = !formOpen;
    mountProfiles(ctx);
    if (formOpen) ctx.root.querySelector<HTMLInputElement>('#name')?.focus();
  });

  ctx.root.querySelector<HTMLFormElement>('#form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = ctx.root.querySelector<HTMLInputElement>('#name')!.value;
    const main = ctx.root.querySelector<HTMLInputElement>('#main')!.checked;
    const error = validateName(name, ctx.store.get().profiles);
    if (error) {
      ctx.root.querySelector('#err')!.textContent = error;
      return;
    }
    const profile = createProfile(name, ctx.rng(), ctx.store.get().profiles, { main, generate: drawOptionsOf(ctx.store.get()) });
    ctx.store.commit(addProfile(ctx.store.get(), profile));
    formOpen = false;
    ctx.toast(`Perfil «${profile.name}» creado con su equipo aleatorio`);
    mountProfiles(ctx);
  });

  ctx.root.querySelectorAll<HTMLElement>('[data-pick]').forEach((el) =>
    el.addEventListener('click', () => {
      ctx.setActive(el.dataset.pick!);
      ctx.go({ name: 'league' });
    }),
  );
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.go({ name: 'profile', id: el.dataset.open! });
    }),
  );
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.store.commit(updateProfile(ctx.store.get(), b.dataset.star!, (p) => ({ ...p, main: !p.main })));
      mountProfiles(ctx);
    }),
  );
}
