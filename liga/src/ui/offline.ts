import { spriteUrl } from '../core/data';
import { drawOptionsOf } from '../core/game/settings';
import type { GameState } from '../core/game/types';
import { speciesPool } from '../core/generator';

/** Misma caché que usa el service worker (sw.template.js) para los sprites. */
export const SPRITE_CACHE = 'pokeliga-sprites';
/** Peso medio aproximado de un sprite 3D de HOME (KB), para avisar del tamaño de la descarga. */
const AVG_SPRITE_KB = 144;

export const offlineSupported = (): boolean => typeof caches !== 'undefined';

/** Sprites que hacen falta para jugar: los Pokémon que pueden salir en el sorteo y los que ya están en algún equipo. */
export function neededSpriteIds(state: GameState): number[] {
  const ids = new Set(speciesPool(drawOptionsOf(state)).map((s) => s.id));
  for (const p of state.profiles) for (const set of p.team) ids.add(set.speciesId);
  return [...ids].sort((a, b) => a - b);
}
export const estimatedMegabytes = (count: number): number => Math.max(1, Math.round((count * AVG_SPRITE_KB) / 1024));

export async function cachedSpriteCount(state: GameState): Promise<{ cached: number; total: number }> {
  const ids = neededSpriteIds(state);
  if (!offlineSupported()) return { cached: 0, total: ids.length };
  const cache = await caches.open(SPRITE_CACHE);
  let cached = 0;
  for (const id of ids) if (await cache.match(spriteUrl(id))) cached++;
  return { cached, total: ids.length };
}

/** Descarga (de 6 en 6) los sprites que faltan. Devuelve cuántos se guardaron y cuántos fallaron. */
export async function downloadSprites(
  state: GameState,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ saved: number; failed: number }> {
  const cache = await caches.open(SPRITE_CACHE);
  const missing: number[] = [];
  for (const id of neededSpriteIds(state)) if (!(await cache.match(spriteUrl(id)))) missing.push(id);
  let done = 0;
  let saved = 0;
  let failed = 0;
  onProgress(0, missing.length);
  for (let i = 0; i < missing.length && !signal?.aborted; i += 6) {
    await Promise.all(
      missing.slice(i, i + 6).map(async (id) => {
        try {
          const res = await fetch(spriteUrl(id), { mode: 'cors', signal });
          if (!res.ok) throw new Error(String(res.status));
          await cache.put(spriteUrl(id), res);
          saved++;
        } catch {
          failed++;
        }
        onProgress(++done, missing.length);
      }),
    );
  }
  return { saved, failed };
}
