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
  const mk = async (init) => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());   // los sprites vienen de internet: no hacen falta
    if (init) await ctx.addInitScript(init);
    const pg = await ctx.newPage(); pg.errors = []; pg.on("pageerror", e => pg.errors.push(String(e))); pg.on("dialog", d => d.accept());
    await pg.goto(URL); await pg.waitForSelector("#pname", { timeout: 60000 });
    await pg.fill("#pname", "Álvaro"); await pg.click("#pcreate"); await pg.waitForSelector("#goLiga");
    return pg;
  };
  const errors = [];

  // ---- 0. Datos de la versión anterior (una sola liga) → competición «Liga» ----
  {
    const old = { parts: [{ id: "a", name: "Vieja", emoji: "🧑", color: "#2f7bff", teams: { j1: [{ species: "Pikachu", level: 50, ability: "Static", item: "", nature: "Timid", moves: ["Surf"], evs: {}, ivs: {}, teraType: "Electric", name: "", gender: "" }] }, slots: {} },
      { id: "b", name: "Viejo", emoji: "👩", color: "#e8590c", teams: {}, slots: {} }], jornadas: [{ id: "j1", name: "Jornada 1" }], cur: "j1",
      matches: [{ id: "m1", j: "j1", a: "a", b: "b", w: "a", c: { a: 100, b: 25 } }], coins: { a: 100, b: 25 }, fixtures: [], season: { name: "Temporada 7", n: 7 }, history: [] };
    const pg = await mk(`if(!localStorage.getItem('liga.v1'))localStorage.setItem('liga.v1', ${JSON.stringify(JSON.stringify(old))})`);
    await pg.click("#goLiga"); await pg.waitForSelector("#lhCompName");
    assert.equal(await pg.inputValue("#lhCompName"), "Liga");
    assert.match(await pg.innerText(".lh-hero"), /Temporada 7/);
    assert.match(await pg.innerText(".lh-cl tbody tr:first-child"), /Vieja/, "la clasificación antigua se conserva");
    await pg.click('[data-tab="entrenadores"]'); await pg.click('.lh-tc >> nth=0');
    assert.equal(await pg.locator(".lh-mon").count(), 1, "el equipo antiguo se conserva");
    errors.push(...pg.errors); await pg.context().close();
  }

  const pg = await mk();
  // ---- 1. Entrenadores y equipo ----
  await pg.click("#goLiga"); await pg.waitForSelector("#lhCompName");
  assert.equal(await pg.inputValue("#lhCompName"), "Liga");
  await pg.click('[data-tab="entrenadores"]');
  for (const n of ["Ana", "Beto", "Carla", "Dani", "Eva", "Fran"]) { await pg.fill("#lhNew", n); await pg.click("#lhAdd"); }
  assert.equal(await pg.locator(".lh-tc").count(), 6);
  await pg.click(".lh-tc >> nth=0"); await pg.waitForSelector(".lh-dh");
  await pg.click('[data-act="team"]'); await pg.waitForSelector("#scr-team.on");
  assert.match(await pg.innerText("#teamTitle"), /Ana · Liga · Jornada 1/);
  await pg.click("#ieBtn"); await pg.fill("#ieText", TEAM); await pg.click("#ieImport");
  await pg.click("#teamOk"); await pg.waitForSelector(".lh-mon");
  assert.equal(await pg.locator(".lh-mon").count(), 2);
  assert.match(await pg.innerText(".lh-mon >> nth=0"), /habilidad/i);
  await pg.screenshot({ path: S + "/liga-detalle.png", fullPage: true });
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /\.team$/.test(k))) || "[]").length), 0, "no toca el equipo del jugador");

  // ---- 2. Editor ROM ----
  await pg.click("#lhBack"); await pg.click("#goRom"); await pg.waitForSelector("#lgRom");
  assert.equal(await pg.locator("#romRoot .lg-p").count(), 6);
  await pg.setInputFiles("#lgRom", S + "/um.3ds"); await pg.setInputFiles("#lgMod", S + "/um.3ds.mod.zip");
  await pg.click("#lgOpen"); await pg.waitForSelector(".lg-ok", { timeout: 15000 });
  await pg.click(".lg-p:nth-child(1) [data-act=slot]"); await pg.fill(".lg-in", "Liam"); await pg.click(".lg-opt");
  await pg.click("#lgBlock"); await pg.fill(".lg-in", "Kaudan");
  assert.match(await pg.innerText(".lg-opt"), /N\./, "se ve el equipo del entrenador"); await pg.click(".lg-opt");
  assert.equal(await pg.locator(".lg-slot.ok").count(), 2);
  const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click("#lgExp")]);
  await dl.saveAs(S + "/liga-out.zip"); console.log("descarga:", dl.suggestedFilename(), "|", await pg.innerText(".lg-ok >> nth=1"));

  // ---- 3. Liga a 2 vueltas ----
  await pg.click("#lgGoLiga"); await pg.waitForSelector("#lhCompName");
  await pg.click('[data-tab="calendario"]');
  await pg.selectOption("#lhVueltas", "2"); await pg.click("#lhGenLiga");
  assert.equal(await pg.locator(".lh-chip[data-j]").count(), 10, "6 entrenadores a 2 vueltas = 10 jornadas");
  await pg.selectOption("#lhMe", { label: "Ana" });
  assert.match(await pg.innerText(".lh-body"), /Tú/, "salen mis próximos partidos");
  await pg.locator('.lh-fx [data-w]').first().click();                                // “Gané”
  assert.match(await pg.innerText(".lh-streak"), /1 victoria seguida/);
  assert.match(await pg.innerText(".lh-hero"), /Ana · .*victoria/);
  await pg.screenshot({ path: S + "/liga-calendario.png", fullPage: true });
  await pg.click('[data-tab="comp"]');
  assert.equal(await pg.locator(".lh-cl tr.z-asc").count(), 2); assert.equal(await pg.locator(".lh-cl tr.z-po").count(), 2); assert.equal(await pg.locator(".lh-cl tr.z-desc").count(), 2);
  await pg.screenshot({ path: S + "/liga-clasificacion.png", fullPage: true });

  // ---- 4. Copa con sorteo ----
  await pg.click("#lhCompNew"); await pg.fill("#lhCName", "Copa de invierno"); await pg.selectOption("#lhCType", "copa"); await pg.click("#lhCCreate");
  assert.equal(await pg.inputValue("#lhCompName"), "Copa de invierno");
  await pg.click("#lhGenCup");
  assert.deepEqual(await pg.locator(".lh-card .lh-ch b").allInnerTexts().then(a => a.filter(x => /^(Cuartos de final|Semifinales|Final)$/.test(x))), ["Cuartos de final", "Semifinales", "Final"]);
  assert.equal(await pg.locator(".lh-tie .lh-note", { hasText: "Pasa directo" }).count(), 2, "con 6, dos descansan");
  await pg.screenshot({ path: S + "/liga-copa.png", fullPage: true });
  for (let i = 0; i < 12 && !(await pg.locator(".lh-champ").count()); i++) await pg.locator('.lh-tie [data-fx][data-w="a"]').first().click();
  assert.equal(await pg.locator(".lh-champ").count(), 1, "se juega la copa hasta tener campeón");
  await pg.screenshot({ path: S + "/liga-copa-final.png", fullPage: true });

  // ---- 5. Champions (nuevo formato) ----
  await pg.click("#lhCompNew"); await pg.fill("#lhCName", "Champions"); await pg.selectOption("#lhCType", "champions"); await pg.click("#lhCCreate");
  assert.match(await pg.innerText(".lh-body"), /fase de liga/i);
  await pg.selectOption("#lhRounds", "3"); await pg.click("#lhGenCL");
  assert.equal(await pg.locator(".lh-cl tbody tr").count(), 6);
  await pg.click('[data-tab="calendario"]'); await pg.locator('.lh-hj .lh-fx [data-w]').first().click();
  await pg.click('[data-tab="comp"]'); await pg.click("#lhGenCK");
  const rounds = await pg.locator(".lh-card .lh-ch b").allInnerTexts();
  assert.ok(rounds.includes("Playoff") && rounds.includes("Final"), "salen playoff y final: " + rounds.join("|"));
  assert.ok(await pg.locator(".lh-tie [data-fx]").count() >= 2, "playoff con partidos de ida");
  await pg.screenshot({ path: S + "/liga-champions.png", fullPage: true });

  // ---- 6. Entrenadores en varias competiciones ----
  await pg.click('[data-tab="entrenadores"]'); await pg.click(".lh-tc >> nth=5");           // Fran
  assert.equal(await pg.locator('[data-member].on').count(), 3, "Fran está en las tres competiciones");
  await pg.click('[data-member]:not(.on), [data-member].on >> nth=2');                       // sale de la Champions
  assert.equal(await pg.locator('[data-member].on').count(), 2);
  await pg.click("#lhBackList");
  await pg.click(".lh-chip.comp >> nth=0"); assert.equal(await pg.inputValue("#lhCompName"), "Liga");
  await pg.click('[data-tab="ajustes"]'); await pg.click("#lhNone");
  assert.equal(await pg.locator('[data-pm].on').count(), 0); await pg.click("#lhAll");
  assert.equal(await pg.locator('[data-pm].on').count(), 6);

  // ---- 7. Cerrar temporada de la liga → historial ----
  await pg.click('[data-tab="comp"]'); await pg.click(".lh-det summary >> nth=-1"); await pg.click("#lhClose");
  await pg.waitForSelector(".lh-hs"); assert.match(await pg.innerText(".lh-hs"), /Liga · Temporada 1/);
  await pg.screenshot({ path: S + "/liga-historial.png", fullPage: true });
  // ---- 8. Persistencia y ancho móvil ----
  await pg.reload(); await pg.waitForSelector("#pname", { timeout: 60000 }); await pg.click(".pcard"); await pg.click("#goLiga"); await pg.waitForSelector("#lhCompName");
  assert.equal(await pg.locator(".lh-chip.comp").count(), 3, "las tres competiciones se guardan");
  await pg.click('[data-tab="historial"]'); assert.match(await pg.innerText(".lh-hs"), /Temporada 1/);
  for (const tab of ["comp", "calendario", "entrenadores", "tienda", "historial", "ajustes"]) {
    await pg.click(`[data-tab="${tab}"]`);
    const sw = await pg.evaluate(() => document.querySelector("#scr-liga").scrollWidth); assert.ok(sw <= 390, `scroll horizontal en ${tab}: ${sw}`);
  }
  errors.push(...pg.errors);
  await br.close(); srv.close();
  console.log("errores de página:", errors); assert.equal(errors.length, 0);
  console.log("UI OK");
})().catch(e => { console.error(e); process.exit(1); });
