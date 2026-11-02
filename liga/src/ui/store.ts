import { emptyGame, type GameState } from '../core/game/types';
import { browserStore, loadGame, saveGame, type KeyValueStore } from '../storage/save';

/** La partida en memoria, con guardado automático en cada cambio. */
export interface Store {
  get(): GameState;
  /** Sustituye el estado y lo guarda. */
  commit(next: GameState): void;
  /** Sustituye el estado sin contarlo como un cambio del usuario (al recuperar la partida de la nube). */
  restore(next: GameState): void;
  /** Se avisa tras cada cambio guardado por el usuario. */
  onSaved(f: () => void): void;
  /** Mensaje de problema al cargar o guardar (null si todo va bien). */
  problem: string | null;
  /** ¿Se está pudiendo guardar en el navegador? */
  persisted: boolean;
}

export function createStore(backend: KeyValueStore | null = browserStore()): Store {
  const loaded = loadGame(backend);
  let state: GameState = loaded.state ?? emptyGame();
  const saved: (() => void)[] = [];
  const store: Store = {
    problem: loaded.problem ?? (backend ? null : 'No se puede guardar en este navegador (almacenamiento bloqueado).'),
    persisted: backend !== null,
    get: () => state,
    commit(next) {
      state = next;
      const ok = saveGame(backend, state);
      store.persisted = ok;
      if (!ok && backend) store.problem = 'No se pudo guardar la partida (¿almacenamiento lleno?). Exporta una copia desde Ajustes.';
      saved.forEach((f) => f());
    },
    restore(next) {
      state = next;
      store.persisted = saveGame(backend, state);
    },
    onSaved: (f) => void saved.push(f),
  };
  return store;
}
