import { SPECIES, spriteUrl } from '../core/data';

/** Misma caché que usa el service worker (sw.template.js) para los sprites. */
export const SPRITE_CACHE = 'pokeliga-sprites';
/** Peso medio aproximado de un sprite 3D de HOME (KB), para avisar del tamaño de la descarga. */
const AVG_SPRITE_KB = 144;

export const offlineSupported = (): boolean => typeof caches !== 'undefined';

/** Sprites que hacen falta para jugar: todos los Pokémon que se pueden sortear (última etapa). */
export const neededSpriteIds = (): number[] => SPECIES.filter((s) => s.finalStage).map((s) => s.id);
export const estimatedMegabytes = (count = neededSpriteIds().length): number => Math.round((count * AVG_SPRITE_KB) / 1024);

export async function cachedSpriteCount(): Promise<{ cached: number; total: number }> {
  const ids = neededSpriteIds();
  if (!offlineSupported()) return { cached: 0, total: ids.length };
  const cache = await caches.open(SPRITE_CACHE);
  let cached = 0;
  for (const id of ids) if (await cache.match(spriteUrl(id))) cached++;
  return { cached, total: ids.length };
}

/** Descarga (de 6 en 6) los sprites que faltan. Devuelve cuántos se guardaron y cuántos fallaron. */
export async function downloadSprites(
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ saved: number; failed: number }> {
  const cache = await caches.open(SPRITE_CACHE);
  const missing: number[] = [];
  for (const id of neededSpriteIds()) if (!(await cache.match(spriteUrl(id)))) missing.push(id);
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
