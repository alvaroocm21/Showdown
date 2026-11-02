import type { AppCtx } from './app';
import { avatarHtml, esc } from './shared';

/** Cabecera con el perfil activo, acceso a su equipo y el botón de cambiar de perfil. */
export function renderWhoAmI(ctx: AppCtx): void {
  const p = ctx.store.get().profiles.find((x) => x.id === ctx.activeId);
  if (!p) return;
  ctx.root.insertAdjacentHTML(
    'afterbegin',
    `<div class="whoami">${avatarHtml(p.avatar, 'sm')}<b>${esc(p.name)}</b><span class="coins">🪙 ${p.coins}</span>
      <button class="alt small" id="myteam">🎒 Mi equipo</button><button class="alt small" id="switchprofile">🔄 Cambiar perfil</button></div>`,
  );
  ctx.root.querySelector('#myteam')!.addEventListener('click', () => ctx.go({ name: 'profile', id: p.id }));
  ctx.root.querySelector('#switchprofile')!.addEventListener('click', () => ctx.go({ name: 'profiles' }));
}
