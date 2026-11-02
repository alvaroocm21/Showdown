import { cloud, type CloudUser } from '../storage/cloud';
import { deserialize, serialize } from '../storage/save';
import type { Store } from './store';

const LAST_SYNC = 'pokeliga:lastsync';
const LOCAL_UPD = 'pokeliga:localupd';

const get = (k: string): number => {
  try {
    return Number(window.localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};
const set = (k: string, v: number): void => {
  try {
    window.localStorage.setItem(k, String(v));
  } catch {
    /* sin almacenamiento */
  }
};

export type SyncStatus = 'off' | 'sync' | 'ok' | 'error';

export interface Sync {
  status(): SyncStatus;
  /** Aviso de cambio de estado (para repintar Ajustes). */
  onStatus(f: () => void): () => void;
  /** Sube o baja lo que haga falta ahora mismo. */
  now(): Promise<void>;
}

/** Copia de la partida en la cuenta: sube los cambios al guardar y, al entrar, recupera la nube o sube lo de este móvil. */
export function startSync(store: Store, toast: (m: string) => void, onApplied: () => void): Sync {
  let status: SyncStatus = 'off';
  let timer: number | undefined;
  const subs = new Set<() => void>();
  const setStatus = (s: SyncStatus) => {
    status = s;
    subs.forEach((f) => f());
  };

  async function push(): Promise<void> {
    if (!cloud.user()) return;
    setStatus('sync');
    const upd = Date.now();
    const ok = await cloud.push({ json: serialize(store.get()), upd });
    if (ok) set(LAST_SYNC, upd);
    setStatus(ok ? 'ok' : 'error');
  }

  function applyCloud(json: string, upd: number): void {
    try {
      store.restore(deserialize(json));
      set(LAST_SYNC, upd);
      set(LOCAL_UPD, upd);
      onApplied();
      toast('Partida recuperada de tu cuenta');
    } catch {
      toast('La copia de la nube no es válida; se mantiene la de este móvil');
    }
  }

  async function reconcile(): Promise<void> {
    if (!cloud.user()) return setStatus('off');
    setStatus('sync');
    const remote = await cloud.pull();
    if (remote === undefined) return setStatus('error');
    const hasLocal = store.get().profiles.length > 0;
    const lastSync = get(LAST_SYNC);
    const localChanged = get(LOCAL_UPD) > lastSync;
    if (!remote) {
      if (hasLocal) await push();
      else setStatus('ok');
      return;
    }
    if (!hasLocal || (remote.upd > lastSync && !localChanged)) {
      applyCloud(remote.json, remote.upd);
      return setStatus('ok');
    }
    if (remote.upd <= lastSync && localChanged) return push();
    if (remote.json === serialize(store.get())) {
      set(LAST_SYNC, remote.upd);
      return setStatus('ok');
    }
    const when = new Date(remote.upd).toLocaleString('es-ES');
    const useCloud = window.confirm(`Hay una partida guardada en tu cuenta (${when}) distinta de la de este móvil.\n\nAceptar: usar la de tu cuenta.\nCancelar: subir la de este móvil y sustituir la de la cuenta.`);
    if (useCloud) applyCloud(remote.json, remote.upd);
    else await push();
    setStatus('ok');
  }

  store.onSaved(() => {
    set(LOCAL_UPD, Date.now());
    if (!cloud.user()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void push(), 1500);
  });
  let lastUid: string | null = null;
  cloud.onChange((u: CloudUser) => {
    if (u?.uid === lastUid) return;
    lastUid = u?.uid ?? null;
    void reconcile();
  });

  return {
    status: () => status,
    onStatus(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
    now: reconcile,
  };
}
