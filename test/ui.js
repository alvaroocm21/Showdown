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
  // ---- Liga ----
  await pg.click("#goLiga"); await pg.waitForSelector("#lhSeason");
  assert.equal(await pg.inputValue("#lhSeason"), "Temporada 1");
  await pg.click('[data-tab="entrenadores"]');
  for (const n of ["Ana", "Beto"]) { await pg.fill("#lhNew", n); await pg.click("#lhAdd"); }
  assert.equal(await pg.locator(".lh-tc").count(), 2);
  // detalle de Ana + equipo con el editor de equipos de la app
  await pg.click('.lh-tc >> nth=0'); await pg.waitForSelector(".lh-dh");
  await pg.click('[data-act="team"]'); await pg.waitForSelector("#scr-team.on");
  assert.match(await pg.innerText("#teamTitle"), /Ana · Jornada 1/);
  await pg.click("#ieBtn"); await pg.fill("#ieText", TEAM); await pg.click("#ieImport");
  await pg.click("#teamOk"); await pg.waitForSelector(".lh-mon");
  assert.equal(await pg.locator(".lh-mon").count(), 2, "vuelve al detalle con los Pokémon");
  await pg.screenshot({ path: S + "/liga-detalle.png", fullPage: true });
  const det = await pg.innerText(".lh-mon >> nth=0");
  assert.match(det, /habilidad/i); assert.match(det, /naturaleza/i); assert.match(det, /PS|Vel/);
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /\.team$/.test(k))) || "[]").length), 0, "no toca el equipo del jugador");
  // ---- Editor ROM ----
  await pg.click("#lhBack"); await pg.waitForSelector("#goRom"); await pg.click("#goRom"); await pg.waitForSelector("#lgRom");
  assert.equal(await pg.locator("#romRoot .lg-p").count(), 2);
  await pg.setInputFiles("#lgRom", S + "/um.3ds"); await pg.setInputFiles("#lgMod", S + "/um.3ds.mod.zip");
  await pg.click("#lgOpen"); await pg.waitForSelector(".lg-ok", { timeout: 15000 });
  console.log("rom:", await pg.innerText(".lg-ok"));
  await pg.click(".lg-p:nth-child(1) [data-act=slot]"); await pg.fill(".lg-in", "Liam"); await pg.click(".lg-opt");
  await pg.click("#lgBlock"); await pg.fill(".lg-in", "Kaudan");
  assert.match(await pg.innerText(".lg-opt"), /N\./, "se ve el equipo del entrenador");
  await pg.click(".lg-opt");
  assert.equal(await pg.locator(".lg-slot.ok").count(), 2, "el bloque asigna a todos");
  const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click("#lgExp")]);
  await dl.saveAs(S + "/liga-out.zip"); console.log("descarga:", dl.suggestedFilename());
  console.log("informe:", (await pg.innerText(".lg-ok >> nth=1")));
  await pg.screenshot({ path: S + "/rom.png", fullPage: true });
  // ---- Temporada: nueva jornada, resultados, monedas ----
  await pg.click("#lgGoLiga"); await pg.waitForSelector("#lhSeason");
  assert.equal(await pg.locator(".lh-mon").count(), 2, "vuelve donde estaba (detalle de Ana)");
  await pg.click('[data-tab="temporada"]');
  await pg.click("#lhJnew");
  assert.equal(await pg.locator(".lh-chip[data-j]").count(), 2);
  await pg.click(".lh-det summary >> nth=0"); await pg.selectOption("#lhMR", "a"); await pg.click("#lhMAdd");
  assert.match(await pg.innerText(".lh-t tbody tr:first-child"), /Ana\s+1\s+1\s+0\s+0\s+3/);
  assert.match(await pg.innerText(".lh-pod"), /Ana/);
  await pg.click('.lh-chip[data-j] >> nth=0'); await pg.click(".lh-det summary >> nth=0"); await pg.selectOption("#lhMR", "d"); await pg.click("#lhMAdd");
  assert.match(await pg.innerText(".lh-t tbody tr:first-child"), /Ana\s+2\s+1\s+1\s+0\s+4/);
  await pg.screenshot({ path: S + "/liga-temporada.png", fullPage: true });
  // monedas: 100 + 50 = 150
  await pg.click('[data-tab="tienda"]');
  assert.match(await pg.innerText("#lhSP"), /Ana · 🪙150/);
  await pg.locator(".lh-sm").first().locator("[data-shop=natR]").click();
  assert.match(await pg.innerText("#lhSP"), /Ana · 🪙100/);
  await pg.click("#lhCoinGive");
  await pg.locator(".lh-sm").first().locator("[data-shop=mv]").click();
  await pg.fill(".lg-in", "Surf"); await pg.click(".lg-opt"); await pg.click(".lg-opt");
  assert.match(await pg.innerText("#lhSP"), /Ana · 🪙30/);
  assert.ok(await pg.locator(".lh-sm").first().locator("[data-shop=ab]").isDisabled(), "sin monedas no se compra");
  // ---- Calendario y racha ----
  await pg.click('[data-tab="entrenadores"]'); await pg.click(".lh-tc >> nth=0");   // detalle de Ana
  await pg.click('[data-act="me"]'); assert.match(await pg.innerText(".lh-hero"), /Ana · .*seguida/, "la racha sale en la cabecera");
  await pg.click("#lhBackList"); await pg.fill("#lhNew", "Carla"); await pg.click("#lhAdd");
  await pg.click('[data-tab="calendario"]');
  assert.match(await pg.innerText(".lh-streak"), /1 empate seguida/);
  await pg.click("#lhJnew");                                                         // jornada 3
  await pg.fill("#lhJdate", "2099-01-02");
  await pg.click("#lhGen");
  assert.ok(await pg.locator(".lh-fx").count() >= 1, "se generan partidos");
  assert.match(await pg.innerText(".lh-body"), /Tú/, "salen mis próximos partidos");
  await pg.screenshot({ path: S + "/liga-calendario.png", fullPage: true });
  await pg.locator('.lh-fx [data-w]').first().click();                                // “Gané”
  assert.match(await pg.innerText(".lh-streak"), /1 victoria seguida/);
  assert.match(await pg.innerText("#lhSP, .lh-hero"), /victoria seguida/);
  // cerrar temporada → historial
  pg.on("dialog", d => d.accept());
  await pg.click('[data-tab="temporada"]'); await pg.click(".lh-det summary >> nth=-1"); await pg.click("#lhClose");
  await pg.waitForSelector(".lh-hs");
  assert.match(await pg.innerText(".lh-hs"), /Temporada 1/); assert.match(await pg.innerText(".lh-hs"), /Campeón: Ana/);
  assert.equal(await pg.inputValue("#lhSeason"), "Temporada 2");
  await pg.screenshot({ path: S + "/liga-historial.png", fullPage: true });
  // persistencia
  await pg.reload(); await pg.waitForSelector("#pname", { timeout: 60000 }); await pg.click(".pcard"); await pg.click("#goLiga"); await pg.waitForSelector("#lhSeason");
  assert.equal(await pg.inputValue("#lhSeason"), "Temporada 2");
  await pg.click('[data-tab="historial"]'); assert.match(await pg.innerText(".lh-hs"), /Temporada 1/, "el historial se guarda");
  await pg.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["temporada", "calendario", "entrenadores", "tienda", "historial", "ajustes"]) {
    await pg.click(`[data-tab="${tab}"]`);
    const sw = await pg.evaluate(() => document.querySelector("#scr-liga").scrollWidth); assert.ok(sw <= 390, `scroll horizontal en ${tab}: ${sw}`);
  }
  await br.close(); srv.close();
  console.log("errores de página:", errors); assert.equal(errors.length, 0);
  console.log("UI OK");
})().catch(e => { console.error(e); process.exit(1); });
