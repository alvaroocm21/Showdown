// Prueba de la Liga ROM en Chromium (móvil 390 px). Uso: node test/ui.js test/out
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path"), assert = require("assert");
const S = path.resolve(process.argv[2]), ROOT = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/json" };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
const TEAM = `Pikachu @ Leftovers
Ability: Static
Level: 42
- Surf
- Thunder Shock

Bulbasaur @ Sitrus Berry
Level: 30
- Vine Whip`;
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const URL = `http://127.0.0.1:${srv.address().port}/index.html`;
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  // sprites e iconos vienen de internet: no hacen falta
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const pg = await ctx.newPage(); const errors = [];
  pg.on("pageerror", e => errors.push(String(e)));
  await pg.goto(URL); await pg.waitForSelector("#pname", { timeout: 60000 });
  await pg.fill("#pname", "Álvaro"); await pg.click("#pcreate"); await pg.waitForSelector("#goLiga");
  await pg.click("#goLiga"); await pg.waitForSelector("#lgNew");
  for (const n of ["Ana", "Beto"]) { await pg.fill("#lgNew", n); await pg.click("#lgAdd"); }
  assert.equal(await pg.locator(".lg-p").count(), 2);
  // equipo de Ana con el editor de equipos de la app
  await pg.click(".lg-p:nth-child(1) [data-act=team]"); await pg.waitForSelector("#scr-team.on");
  assert.match(await pg.innerText("#teamTitle"), /Ana · Jornada 1/);
  await pg.click("#ieBtn"); await pg.fill("#ieText", TEAM); await pg.click("#ieImport");
  await pg.click("#teamOk"); await pg.waitForSelector("#ligaRoot .lg-p");
  assert.match(await pg.innerText(".lg-p:nth-child(1) [data-act=team]"), /\(2\/6\)/);
  // el equipo del propio jugador no se toca
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /\.team$/.test(k))) || "[]").length), 0);
  // ROM + mod
  await pg.setInputFiles("#lgRom", S + "/um.3ds"); await pg.setInputFiles("#lgMod", S + "/um.3ds.mod.zip");
  await pg.click("#lgOpen"); await pg.waitForSelector(".lg-ok", { timeout: 15000 });
  console.log("rom:", await pg.innerText(".lg-ok"));
  await pg.click(".lg-p:nth-child(1) [data-act=slot]"); await pg.fill(".lg-in", "Liam"); await pg.click(".lg-opt");
  await pg.click("#lgBlock"); await pg.fill(".lg-in", "Kaudan");
  assert.match(await pg.innerText(".lg-opt"), /N\./, "se ve el equipo del entrenador");
  await pg.click(".lg-opt");
  assert.equal(await pg.locator(".lg-slot.ok").count(), 2, "el bloque asigna a todos");
  await pg.click("#lgSug");
  console.log("slots:", await pg.locator(".lg-slot").allInnerTexts());
  await pg.screenshot({ path: S + "/liga-rom.png", fullPage: true });
  const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click("#lgExp")]);
  await dl.saveAs(S + "/liga-out.zip"); console.log("descarga:", dl.suggestedFilename());
  console.log("informe:", (await pg.innerText(".lg-ok >> nth=1")));
  // persistencia
  await pg.reload(); await pg.waitForSelector("#pname", { timeout: 60000 });
  await pg.click(".pcard"); await pg.click("#goLiga"); await pg.waitForSelector("#lgNew");
  assert.equal(await pg.locator(".lg-p").count(), 2);
  // nueva jornada copia los equipos
  await pg.click("#lgJnew");
  assert.equal(await pg.locator("#lgJ option").count(), 2);
  assert.match(await pg.innerText(".lg-p:nth-child(1) [data-act=team]"), /\(2\/6\)/);
  // resultados: Ana gana a Beto en la jornada 2 y empatan en la 1
  await pg.selectOption("#lgMR", "a"); await pg.click("#lgMAdd");
  assert.equal(await pg.locator(".lg-m").count() >= 2, true);
  assert.match(await pg.innerText(".lg-t tbody tr:first-child"), /Ana\s+1\s+1\s+0\s+0\s+3/);
  await pg.selectOption("#lgJ", { index: 0 }); await pg.selectOption("#lgMR", "d"); await pg.click("#lgMAdd");
  assert.match(await pg.innerText(".lg-t tbody tr:first-child"), /Ana\s+2\s+1\s+1\s+0\s+4/);
  assert.match(await pg.innerText("#ligaRoot"), /Ana 1 – 0 Beto|Beto 0 – 1 Ana|Ana\s+1\s+–\s+0\s+Beto/);
  await pg.reload(); await pg.waitForSelector("#pname", { timeout: 60000 }); await pg.click(".pcard"); await pg.click("#goLiga");
  assert.match(await pg.innerText(".lg-t tbody tr:first-child"), /Ana\s+2/, "los resultados se guardan");
  // monedas: Ana ganó (100) y empató (50) → 150
  await pg.selectOption("#lgSP", { index: 0 });
  assert.match(await pg.innerText("#lgSP"), /Ana · 🪙150/);
  const mon = pg.locator(".lg-sm").first();
  await mon.locator("[data-shop=natR]").click();
  assert.match(await pg.innerText("#lgSP"), /Ana · 🪙100/);
  await pg.click("#lgCoinGive");                       // +50 manual → 150
  await pg.locator(".lg-sm").first().locator("[data-shop=mv]").click();
  await pg.fill(".lg-in", "Surf"); await pg.click(".lg-opt"); await pg.click(".lg-opt");
  assert.match(await pg.innerText("#lgSP"), /Ana · 🪙30/);
  assert.match(await pg.innerText(".lg-sm >> nth=0"), /Surf|Hidrobomba|Surfear/i, "el ataque elegido está en el equipo");
  assert.ok(await pg.locator(".lg-sm").first().locator("[data-shop=ab]").isDisabled(), "sin monedas no se compra");
  // borrar un combate devuelve el premio
  await pg.reload(); await pg.waitForSelector("#pname", { timeout: 60000 }); await pg.click(".pcard"); await pg.click("#goLiga");
  assert.match(await pg.innerText("#lgSP"), /Ana · 🪙/, "monedas guardadas");
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth); assert.ok(sw <= 390, "scroll horizontal " + sw);
  await pg.screenshot({ path: S + "/liga-j2.png", fullPage: true });
  await br.close(); srv.close();
  console.log("errores de página:", errors); assert.equal(errors.length, 0);
  console.log("UI OK");
})().catch(e => { console.error(e); process.exit(1); });
