import { createRng, randomSeed, type Rng } from '../core/rng';
import { mountBattle, type BattleScreenOptions } from './screens/battle';
import { mountLeague } from './screens/league';
import { mountProfile } from './screens/profile';
import { mountProfiles } from './screens/profiles';
import { mountSettings } from './screens/settings';
import { watchInstall } from './install';
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

/** Poké Ball dibujada en SVG: se muestra cuando una imagen no está disponible (sin conexión y sin guardar). */
const BALL_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#f8fafc" stroke="#1f1235" stroke-width="4"/><path d="M4 32a28 28 0 0 1 56 0z" fill="#ef4444" stroke="#1f1235" stroke-width="4"/><path d="M4 32h56" stroke="#1f1235" stroke-width="5"/><circle cx="32" cy="32" r="8" fill="#f8fafc" stroke="#1f1235" stroke-width="4"/></svg>`,
  );

function registerServiceWorker(toast: (m: string) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Hay una versión nueva de la app: ciérrala y ábrela de nuevo para usarla.');
  });
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

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

  // Si una imagen no se puede cargar (sin conexión y sin guardar), se pone una Poké Ball
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (img instanceof HTMLImageElement && !img.dataset.fallback) {
        img.dataset.fallback = '1';
        img.src = BALL_SVG;
      }
    },
    true,
  );
  watchInstall();
  registerServiceWorker((m) => ctx.toast(m));

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
    screen.classList.remove('enter');
    void screen.offsetWidth; // reinicia la animación de entrada
    screen.classList.add('enter');
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
