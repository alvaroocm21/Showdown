// Service worker: la app funciona sin conexión una vez cargada y guarda los sprites ya vistos.
const VER='duelos-v37';
const SHELL=['./','index.html','manifest.webmanifest','lib/pkmn.bundle.js','lib/desc-es.js','lib/item-ids.js','lib/romcore.js','lib/ligamap.js','lib/ligapk.js','lib/ligashop.js','lib/liga.js','lib/ligacal.js','lib/ligasorteo.js','lib/ligaia.js','lib/ligahub.js','lib/liga.css','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VER).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VER&&k.startsWith('duelos-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url),same=url.origin===location.origin;
  if(same){
    // app: red primero (para recibir actualizaciones) y caché si no hay conexión
    e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(VER).then(c=>c.put(req,cp))}return r}).catch(()=>caches.match(req).then(r=>r||caches.match('index.html'))));
    return}
  if(/\.(png|gif|webp|jpg|jpeg)$/i.test(url.pathname)){
    // sprites: caché primero
    e.respondWith(caches.open(VER+'-img').then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque')c.put(req,r.clone());return r}))))}});
