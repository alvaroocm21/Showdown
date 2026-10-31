/* Service worker de la Liga Pokémon. Lo genera el build (vite.config.ts), que rellena la versión y la lista de ficheros. */
const VERSION = 'ea9cdfb3f2';
const SHELL_CACHE = `pokeliga-shell-${VERSION}`;
/** Sprites: se conserva entre versiones de la app. */
const SPRITE_CACHE = 'pokeliga-sprites';
const PRECACHE = ["./","assets/index-BxGAWGYi.css","assets/index-Dzbyg_SX.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","manifest.webmanifest"];
const SPRITE_HOST = 'raw.githubusercontent.com';

/* El servidor puede mandar `Vary: Origin`; las peticiones de módulos/CSS son CORS y llevan `Origin`, la copia guardada no.
   Los ficheros llevan hash en el nombre, así que es seguro ignorar Vary. */
const MATCH = { ignoreSearch: true, ignoreVary: true };

const abs = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(abs)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('pokeliga-shell-') && key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Sprites de PokéAPI: de la caché si están; si no, de la red (y se guardan para jugar sin conexión).
  if (url.hostname === SPRITE_HOST && url.pathname.includes('/PokeAPI/sprites/')) {
    event.respondWith(spriteFirst(req.url));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Navegación: siempre la página de la app (funciona sin conexión)
  if (req.mode === 'navigate') {
    event.respondWith(caches.match(abs('./'), MATCH).then((hit) => hit || fetch(req)));
    return;
  }
  // Resto de ficheros propios (con hash en el nombre): primero la caché
  event.respondWith(caches.match(req, MATCH).then((hit) => hit || fetch(req)));
});

async function spriteFirst(url) {
  const cache = await caches.open(SPRITE_CACHE);
  const hit = await cache.match(url, { ignoreVary: true });
  if (hit) return hit;
  try {
    // mode: 'cors' para que la respuesta se pueda guardar con su tamaño real (las opacas ocupan mucha cuota)
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) await cache.put(url, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}
