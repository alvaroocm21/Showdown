import { createRng, randomSeed, type Rng } from '../core/rng';
import { mountBattle, type BattleScreenOptions } from './screens/battle';
import { mountLeague } from './screens/league';
import { mountProfile } from './screens/profile';
import { mountProfiles } from './screens/profiles';
import { mountSettings } from './screens/settings';
import type { Store } from './store';

export type View =
  | { name: 'league' }
  | { name: 'profiles' }
  | { name: 'profile'; id: string }
  | { name: 'settings' };

export interface AppCtx {
  store: Store;
  root: HTMLElement;
  go(view: View): void;
  toast(message: string): void;
  /** Muestra un combate a pantalla completa (sin barra de pestañas). */
  battle(options: BattleScreenOptions): void;
  rng(): Rng;
}

const TABS: { name: View['name']; icon: string; label: string }[] = [
  { name: 'league', icon: '🏆', label: 'Liga' },
  { name: 'profiles', icon: '👥', label: 'Perfiles' },
  { name: 'settings', icon: '⚙️', label: 'Ajustes' },
];

export function startApp(host: HTMLElement, store: Store): void {
  host.innerHTML = `<div id="banner"></div><main id="screen"></main><nav class="tabs" id="tabs"></nav><div class="toast" id="toast" hidden></div>`;
  const screen = host.querySelector<HTMLElement>('#screen')!;
  const tabs = host.querySelector<HTMLElement>('#tabs')!;
  const banner = host.querySelector<HTMLElement>('#banner')!;
  const toastEl = host.querySelector<HTMLElement>('#toast')!;
  let view: View = { name: 'league' };
  let toastTimer: number | undefined;

  const ctx: AppCtx = {
    store,
    root: screen,
    go(next) {
      view = next;
      render();
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => (toastEl.hidden = true), 3200);
    },
    battle(options) {
      document.body.classList.add('in-battle');
      banner.innerHTML = '';
      mountBattle(screen, options);
      window.scrollTo(0, 0);
    },
    rng: () => createRng(randomSeed()),
  };

  function renderBanner(): void {
    if (!store.problem) {
      banner.innerHTML = '';
      return;
    }
    banner.innerHTML = `<div class="warn"><span>⚠️ ${store.problem.replace(/</g, '&lt;')}</span><button class="alt small" id="dismiss">OK</button></div>`;
    banner.querySelector('#dismiss')!.addEventListener('click', () => {
      store.problem = null;
      renderBanner();
    });
  }

  function render(): void {
    document.body.classList.remove('in-battle');
    const active = view.name === 'profile' ? 'profiles' : view.name;
    tabs.innerHTML = TABS.map(
      (t) => `<button class="tab${t.name === active ? ' on' : ''}" data-tab="${t.name}"><span>${t.icon}</span>${t.label}</button>`,
    ).join('');
    tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => ctx.go({ name: b.dataset.tab as 'league' | 'profiles' | 'settings' })),
    );
    renderBanner();
    switch (view.name) {
      case 'league': return mountLeague(ctx);
      case 'profiles': return mountProfiles(ctx);
      case 'profile': return mountProfile(ctx, view.id);
      case 'settings': return mountSettings(ctx);
    }
  }

  render();
}
