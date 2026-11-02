import { createRng, randomSeed, type Rng } from '../core/rng';
import { mountBattle, type BattleScreenOptions } from './screens/battle';
import { mountLeague } from './screens/league';
import { mountProfile } from './screens/profile';
import { mountProfiles } from './screens/profiles';
import { mountSettings } from './screens/settings';
import { watchInstall } from './install';
import type { Store } from './store';
import { startSync, type Sync } from './sync';

export type View =
  | { name: 'league' }
  | { name: 'calendar' }
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
  sync: Sync;
  /** Perfil con el que se está jugando (null si aún no se ha elegido ninguno). */
  activeId: string | null;
  setActive(id: string | null): void;
}

type TabName = 'league' | 'calendar' | 'profiles' | 'settings';
const TAB_DEFS: Record<TabName, { icon: string; label: string }> = {
  league: { icon: '🏆', label: 'Liga' },
  calendar: { icon: '📅', label: 'Calendario' },
  profiles: { icon: '👥', label: 'Perfiles' },
  settings: { icon: '⚙️', label: 'Ajustes' },
};
/** Con un perfil elegido: Liga, Calendario y Ajustes. Sin perfil: solo elegirlo (o los Ajustes). */
const TABS_WITH_PROFILE: TabName[] = ['league', 'calendar', 'settings'];
const TABS_NO_PROFILE: TabName[] = ['profiles', 'settings'];
const ACTIVE_KEY = 'pokeliga:active';

function loadActive(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function saveActive(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* sin almacenamiento: se elegirá de nuevo al abrir */
  }
}

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
  let activeId = loadActive();
  if (!store.get().profiles.some((p) => p.id === activeId)) activeId = null;
  let view: View = activeId ? { name: 'league' } : { name: 'profiles' };
  let toastTimer: number | undefined;

  const sync = startSync(store, (m) => ctx.toast(m), () => ctx.go(activeId && store.get().profiles.some((p) => p.id === activeId) ? { name: 'league' } : { name: 'profiles' }));
  const ctx: AppCtx = {
    store,
    sync,
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
    get activeId() {
      return activeId;
    },
    setActive(id) {
      activeId = id;
      saveActive(id);
    },
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
    // Si el perfil activo ya no existe (borrado o partida importada), hay que elegir otro
    if (activeId && !store.get().profiles.some((p) => p.id === activeId)) ctx.setActive(null);
    if (!activeId && (view.name === 'league' || view.name === 'calendar')) view = { name: 'profiles' };
    const tabNames = activeId ? TABS_WITH_PROFILE : TABS_NO_PROFILE;
    const active = view.name === 'profile' ? (view.id === activeId ? 'league' : 'profiles') : view.name;
    tabs.innerHTML = tabNames
      .map((n) => `<button class="tab${n === active ? ' on' : ''}" data-tab="${n}"><span>${TAB_DEFS[n].icon}</span>${TAB_DEFS[n].label}</button>`)
      .join('');
    tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => ctx.go({ name: b.dataset.tab as TabName } as View)),
    );
    renderBanner();
    switch (view.name) {
      case 'league': return mountLeague(ctx, 'league');
      case 'calendar': return mountLeague(ctx, 'calendar');
      case 'profiles': return mountProfiles(ctx);
      case 'profile': return mountProfile(ctx, view.id);
      case 'settings': return mountSettings(ctx);
    }
  }

  render();
}
