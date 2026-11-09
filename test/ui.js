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
const TEAM8 = ["Pikachu", "Bulbasaur", "Charmander", "Squirtle", "Gengar", "Snorlax", "Eevee", "Mewtwo"].map(n => `${n}\n- Surf`).join("\n\n");
const MON = (species, ability, level, moves, item = "") => ({ species, level, ability, item, nature: "Timid", moves, evs: { hp: 4, spa: 252, spe: 252 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, teraType: "Normal", name: "", gender: "" });
const ANA = [MON("Pikachu", "Static", 42, ["Surf", "Thunder Shock"], "Leftovers"), MON("Bulbasaur", "Overgrow", 30, ["Vine Whip"], "Sitrus Berry")];
const EVA = ["Pikachu", "Bulbasaur", "Charmander", "Squirtle", "Gengar", "Snorlax", "Eevee", "Mewtwo"].map(n => MON(n, "Static", 50, ["Surf"]));
// La Liga ya no tiene editor: los equipos salen del sorteo. En la prueba se fijan en el almacenamiento para poder comprobar cosas concretas.
const setTeam = async (pg, name, sets) => {
  await pg.evaluate(([name, sets]) => { const d = JSON.parse(localStorage.getItem("liga.v1")), c = d.comps.find(x => x.id === d.cc), p = d.parts.find(x => x.name === name); p.teams = p.teams || {}; p.teams[c.cur] = sets; p.last = sets; localStorage.setItem("liga.v1", JSON.stringify(d)); }, [name, sets]);
  await pg.click("#lhBack"); await pg.click("#goLiga"); await pg.waitForSelector("#lhCompName");
};
const setRange = (pg, row, v) => pg.locator(`${row} [data-r]`).evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, v);
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const URL = `http://127.0.0.1:${srv.address().port}/index.html`;
  const br = await chromium.launch();
  const mk = async (init) => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());   // los sprites vienen de internet: no hacen falta
    if (init) await ctx.addInitScript(init);
    const pg = await ctx.newPage(); pg.errors = []; pg.on("pageerror", e => pg.errors.push(String(e))); pg.lastDialog = ""; pg.on("dialog", d => { pg.lastDialog = d.message(); d.accept(); });
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
  // el equipo que el jugador ya tenía en «Elegir equipo» debe verse en la Liga
  await pg.evaluate(() => { const id = JSON.parse(localStorage.getItem("zaf3.profiles")).find(p => p.name === "Álvaro").id; const iv = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    localStorage.setItem(`zaf3.${id}.team`, JSON.stringify([{ species: "Gengar", level: 50, ability: "Cursed Body", item: "Leftovers", nature: "Timid", moves: ["Shadow Ball", "Sludge Bomb"], evs: { hp: 4, spa: 252, spe: 252 }, ivs: iv, teraType: "Ghost", name: "", gender: "" },
      { species: "Snorlax", level: 50, ability: "Immunity", item: "", nature: "Adamant", moves: ["Body Slam"], evs: { hp: 252, atk: 252 }, ivs: iv, teraType: "Normal", name: "", gender: "" }])); });
  await pg.click("#goLiga"); await pg.waitForSelector("#lhCompName");
  assert.equal(await pg.inputValue("#lhCompName"), "Liga");
  await pg.click('[data-tab="equipo"]');
  assert.equal(await pg.locator(".lh-mon").count(), 2, "mi equipo de «Elegir equipo» sale en la pestaña Equipo");
  assert.match(await pg.innerText(".lh-mon >> nth=0"), /Gengar/); assert.match(await pg.innerText(".lh-mon >> nth=0"), /Cursed Body|Cuerpo Maldito/i);
  { const t = await pg.locator(".lh-mon >> nth=0").textContent(); assert.doesNotMatch(t, /[A-Za-z]+ing the |When this Pokemon/, "las descripciones no están en inglés"); assert.ok(await pg.evaluate(() => Object.keys(window.DESC_ES.a).length > 200 && /Ataque/.test(window.DESC_ES.a.intimidate)), "hay descripciones en español"); }
  // «Sortear mis Pokémon»: pide mi porcentaje y me da 12 (6 titulares + 6 suplentes)
  await pg.click("[data-eqdraw]"); await pg.waitForSelector(".lg-sheet .lh-rt");
  assert.equal(await pg.locator(".lg-sheet .lh-rt").count(), 1, "solo me pide mi porcentaje");
  await setRange(pg, ".lg-sheet .lh-rt", 90); assert.match(await pg.innerText(".lg-sheet .lh-rt"), /Élite/);
  await pg.click(".lg-sheet [data-ok]");
  assert.equal(await pg.locator('.lh-card:has(.lh-ch b:text-is("Plantilla")) .lh-mon').count(), 12, "salen los 12 en la plantilla");
  assert.equal(await pg.locator(".lh-strip .lh-slot.on").count(), 0, "arriba los 6 titulares empiezan vacíos");
  assert.equal(await pg.locator(".lh-strip .lh-slot").count(), 6);
  await pg.locator('[data-eq="up"]').first().click(); assert.equal(await pg.locator(".lh-strip .lh-slot.on").count(), 1, "al hacer titular entra arriba");
  await pg.locator(".lh-strip .lh-slot.on").first().click(); assert.equal(await pg.locator(".lh-strip .lh-slot.on").count(), 0, "y tocándolo sale");
  await pg.click('[data-tab="entrenadores"]');
  for (const n of ["Ana", "Beto", "Carla", "Dani", "Eva", "Fran"]) { await pg.fill("#lhNew", n); await pg.click("#lhAdd"); }
  assert.equal(await pg.locator(".lh-tc").count(), 7, "los 6 entrenadores y el jugador con el que entré");
  assert.match(await pg.innerText(".lh-hero"), /Álvaro/, "«tú» es el jugador con el que entré");
  // ---- quién controla a cada entrenador: a Ana la controla su jugador; a los demás, yo ----
  assert.equal(await pg.locator('.lh-tc:has-text("Ana") [data-ctl]').count(), 0);
  await pg.click('.lh-tc:has-text("Ana")'); await pg.waitForSelector(".lh-dh");
  assert.equal(await pg.locator('[data-ctl="mine"].gold').count(), 1, "por defecto lo controlo yo");
  await pg.click('[data-ctl="self"]'); assert.equal(await pg.locator('[data-ctl="self"].gold').count(), 1, "pasa a «lo controla su jugador»");
  assert.match(await pg.innerText(".lh-body"), /Lo controla su jugador: solo Ana puede elegir su equipo/);
  assert.equal(await pg.locator("[data-eqdraw]").count(), 0, "no puedo sortearle los Pokémon");
  await pg.click("#lhBackList"); assert.match(await pg.innerText('.lh-tc:has-text("Ana")'), /🔒/, "la tarjeta lo marca");
  assert.equal(await pg.locator("#lhSorteo").count(), 1, "el sorteo general sigue para los que controlo");
  await pg.click("#lhSorteo > summary"); assert.match(await pg.innerText("#lhSorteo"), /1 entrenador lo controla su jugador/); await pg.click("#lhSorteo > summary");
  await pg.click('[data-tab="equipo"]'); await pg.selectOption("#lhEqP", { label: "Ana" });
  assert.equal(await pg.locator("[data-eqdraw], [data-eq], [data-mega]").count(), 0, "el equipo de Ana lo ve pero no lo toca");
  await pg.selectOption("#lhEqP", { label: "Beto" }); assert.equal(await pg.locator("[data-eqdraw]").count(), 1, "pero el de Beto (que controlo yo) sí");
  await pg.selectOption("#lhEqP", { label: "⭐ Álvaro" }); assert.equal(await pg.locator("[data-eqdraw]").count(), 1, "y el propio también");
  await pg.click('[data-tab="tienda"]'); await pg.selectOption("#lhSP", { index: 1 }); assert.equal(await pg.locator("[data-shop]").count(), 0, "ni retocar los Pokémon de Ana");
  // la IA: a Fran lo dirige el ordenador
  await pg.click('[data-tab="entrenadores"]'); await pg.click('.lh-tc:has-text("Fran")'); await pg.waitForSelector(".lh-dh");
  assert.equal(await pg.locator('[data-ctl]').count(), 3, "tres formas de control: yo, su jugador o la IA");
  await pg.click('[data-ctl="ia"]'); assert.equal(await pg.locator('[data-ctl="ia"].gold').count(), 1);
  assert.match(await pg.innerText(".lh-body"), /La IA elige su alineación según la jornada, su rival y el siguiente rival/);
  assert.equal(await pg.locator("[data-eqdraw]").count(), 1, "al organizador sí le deja sortearle los Pokémon a la IA");
  assert.match(await pg.innerText(".lh-body"), /Sortear Pokémon/); assert.equal(await pg.locator('[data-act="inherit"], [data-act="prof"]').count(), 0, "pero no tocarle el equipo a mano");
  await pg.click("#lhBackList"); assert.match(await pg.innerText('.lh-tc:has-text("Fran")'), /🤖/, "la tarjeta lo marca");
  await pg.click('[data-tab="equipo"]'); await pg.selectOption("#lhEqP", { label: "Fran" });
  assert.match(await pg.innerText(".lh-body"), /La IA se sortea sola su plantilla/, "el texto de la IA sin Pokémon es el correcto");
  assert.equal(await pg.locator("[data-eqdraw]").count(), 1, "y hay botón para dárselos ya");
  await pg.click("[data-eqdraw]"); await pg.waitForSelector(".lg-sheet .lh-rt"); assert.equal(await pg.locator(".lg-sheet .lh-rt").count(), 1);
  await setRange(pg, ".lg-sheet .lh-rt", 40); await pg.click(".lg-sheet [data-ok]");
  assert.equal(await pg.locator('.lh-card:has(.lh-ch b:text-is("Plantilla")) .lh-mon').count(), 12, "la IA recibe sus 12 Pokémon");
  await pg.selectOption("#lhEqP", { label: "Ana" });
  assert.equal(await pg.locator("[data-eqdraw]").count(), 0, "a un entrenador de su jugador no se le sortea");
  assert.match(await pg.innerText(".lh-body"), /solo Ana puede elegir|Solo Ana puede sortearlos/);
  await pg.click('[data-tab="ajustes"]'); assert.equal(await pg.locator("[data-ctlp]").count(), 7, "Ajustes lista a todos con su control");
  assert.equal(await pg.locator("[data-ctlp].on").count(), 2, "Ana (su jugador) y Fran (IA) no son «míos»");
  await pg.click('[data-tab="entrenadores"]');
  await setTeam(pg, "Ana", ANA);
  await pg.click('.lh-tc:has-text("Ana")'); await pg.waitForSelector(".lh-dh");
  assert.equal(await pg.locator('[data-act="team"]').count(), 0, "ya no hay botón de editar el equipo");
  assert.equal(await pg.locator(".lh-mon").count(), 2);

  // escudo del entrenador: imagen y color
  const b64 = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 40; const g = c.getContext("2d"); g.fillStyle = "#d24a4a"; g.fillRect(0, 0, 40, 40); g.fillStyle = "#fff"; g.fillRect(10, 10, 20, 20); return c.toDataURL("image/png").split(",")[1]; });
  fs.writeFileSync(S + "/escudo.png", Buffer.from(b64, "base64"));
  await pg.setInputFiles("#lhImgP", S + "/escudo.png"); await pg.waitForSelector(".lh-dh .lh-av img");
  assert.ok(await pg.evaluate(() => JSON.parse(localStorage.getItem("liga.v1")).parts.find(p => p.name === "Ana").img.startsWith("data:image/png")), "la imagen se guarda");
  await pg.click('.lh-shield ~ .lh-emo [data-pc] >> nth=1');
  assert.match(await pg.locator(".lh-dh .lh-av").getAttribute("style"), /rgb\(232, 89, 12\)|#e8590c/i, "cambia el color");
  await pg.screenshot({ path: S + "/liga-escudo.png", fullPage: true });
  // sorteo: primero pide los porcentajes y luego reparte (3 Pokémon de nivel 40 a los 5 sin equipo); Ana conserva el suyo
  await pg.click("#lhBackList"); await pg.click("#lhSorteo > summary");
  assert.equal(await pg.inputValue('[data-so="size"]'), "12", "el sorteo reparte 12 por defecto");
  assert.equal(await pg.locator('[data-so="rating"], [data-rt], #lhRtRand').count(), 0, "los porcentajes ya no se ponen en la tarjeta: se piden al repartir");
  await pg.selectOption('[data-so="size"]', "3"); await pg.fill('[data-so="level"]', "40"); await pg.press('[data-so="level"]', "Enter");
  await pg.click("#lhSortear"); await pg.waitForSelector(".lg-sheet .lh-rt");
  assert.equal(await pg.locator(".lg-sheet .lh-rt").count(), 4, "pide el porcentaje de los 4 entrenadores sin equipo");
  assert.match(await pg.innerText(".lg-sheet"), /Antes de repartir/);
  await pg.click(".lg-sheet [data-x]");                                                     // cancelar: no reparte nada
  await pg.click('.lh-tc:has-text("Beto")'); assert.equal(await pg.locator(".lh-mon").count(), 0, "al cancelar no se reparte"); await pg.click("#lhBackList");
  await pg.click("#lhSortear"); await pg.waitForSelector(".lg-sheet .lh-rt");
  await setRange(pg, '.lg-sheet .lh-rt:has-text("Beto")', 95); await setRange(pg, '.lg-sheet .lh-rt:has-text("Carla")', 5);
  // cualquier número del 1 al 100, de 1 en 1: deslizador y casilla van juntos
  await setRange(pg, '.lg-sheet .lh-rt:has-text("Beto")', 93);
  assert.equal(await pg.inputValue('.lg-sheet .lh-rt:has-text("Beto") [data-n]'), "93", "el deslizador mueve la casilla de 1 en 1");
  await pg.fill('.lg-sheet .lh-rt:has-text("Dani") [data-n]', "37");
  assert.equal(await pg.inputValue('.lg-sheet .lh-rt:has-text("Dani") [data-r]'), "37", "la casilla mueve el deslizador");
  assert.match(await pg.innerText('.lg-sheet .lh-rt:has-text("Dani")'), /Bajo/);
  await pg.fill('.lg-sheet .lh-rt:has-text("Beto") [data-n]', "95");
  assert.match(await pg.innerText('.lg-sheet .lh-rt:has-text("Beto")'), /Élite/); assert.match(await pg.innerText('.lg-sheet .lh-rt:has-text("Carla")'), /Humilde/);
  await pg.screenshot({ path: S + "/liga-sorteo.png", fullPage: true });
  await pg.click(".lg-sheet [data-ok]");
  const bst = await pg.evaluate(() => { const d = JSON.parse(localStorage.getItem("liga.v1")); const avg = n => { const p = d.parts.find(x => x.name === n), tm = Object.values(p.teams)[0]; const l = tm.map(s => { const b = PKMN.Dex.species.get(s.species).baseStats; return b.hp + b.atk + b.def + b.spa + b.spd + b.spe; }); return l.reduce((x, y) => x + y, 0) / l.length; }; return [avg("Beto"), avg("Carla")]; });
  assert.ok(bst[0] > bst[1] + 100, `con 95% salen Pokémon más fuertes que con 5%: ${bst.map(Math.round)}`);
  await pg.click('.lh-tc:has-text("Beto")'); await pg.waitForSelector(".lh-dh");
  assert.equal(await pg.locator(".lh-mon").count(), 3, "el sorteo da 3 Pokémon");
  assert.match(await pg.innerText(".lh-mon >> nth=0"), /Nv\. 40/);
  assert.match(await pg.innerText(".lh-body"), /95% · Élite/, "la ficha muestra su porcentaje");
  assert.equal(await pg.getAttribute(".lh-range", "step"), "1", "el deslizador de la ficha va de 1 en 1");
  await pg.fill(".lh-rtnum", "62"); await pg.press(".lh-rtnum", "Enter");
  assert.match(await pg.innerText(".lh-body"), /62% · Medio/, "se puede escribir cualquier número");
  assert.equal(await pg.evaluate(() => { const d = JSON.parse(localStorage.getItem("liga.v1")); return d.parts.flatMap(p => Object.values(p.teams || {}).flat()).filter(s => (PKMN.Dex.items.get(s.item) || {}).megaStone).length; }), 0, "el sorteo no da megapiedras");
  await pg.click("#lhBackList"); await pg.click('.lh-tc:has-text("Ana")'); await pg.waitForSelector(".lh-dh");
  assert.equal(await pg.locator(".lh-mon").count(), 2, "Ana conserva su equipo");
  await pg.screenshot({ path: S + "/liga-detalle.png", fullPage: true });
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /\.team$/.test(k))) || "[]").length), 2, "editar equipos de la liga no cambia el equipo del jugador");

  // ---- Equipo: plantilla de 8, 6 titulares y 2 suplentes ----
  await pg.click("#lhBackList"); await setTeam(pg, "Eva", EVA);
  await pg.click('.lh-tc:has-text("Eva")'); await pg.waitForSelector(".lh-dh");
  assert.equal(await pg.locator(".lh-mon").count(), 8);
  assert.match(await pg.innerText('.lh-card:has(.lh-ch b:has-text("Equipo en")) .lh-ch'), /6 titulares \+ 2 suplentes/);
  await pg.click('[data-tab="equipo"]'); await pg.selectOption("#lhEqP", { label: "Eva" });
  assert.equal(await pg.locator("[data-eqedit]").count(), 0, "ya no hay «Editar plantilla»"); assert.equal(await pg.locator("[data-eqdraw]").count(), 1, "pero sí «Sortear»");
  const tit = pg.locator('.lh-card:has(.lh-ch b:text-is("Titulares"))'), ban = pg.locator('.lh-card:has(.lh-ch b:text-is("Banquillo"))');
  const pla = pg.locator('.lh-card:has(.lh-ch b:text-is("Plantilla"))');
  assert.equal(await pla.locator(".lh-mon").count(), 8, "al empezar no hay titulares elegidos");
  for (let i = 0; i < 6; i++) await pg.locator('[data-eq="up"]').first().click();
  assert.equal(await pg.locator(".lh-strip .lh-slot.on").count(), 6, "los 6 elegidos salen arriba");
  assert.equal(await pg.locator('[data-eq="up"]').count(), 2); await pg.locator('[data-eq="up"]').first().click(); const dlg = pg.lastDialog;
  assert.match(dlg, /6 titulares/, "no deja pasar de 6");
  assert.equal(await tit.locator(".lh-mon").count(), 6); assert.equal(await ban.locator(".lh-mon").count(), 2);
  assert.match(await tit.locator(".lh-mon >> nth=0").innerText(), /Titular 1/); assert.match(await tit.locator(".lh-mon >> nth=0").innerText(), /habilidad[\s\S]*naturaleza[\s\S]*objeto|objeto[\s\S]*naturaleza/i);
  await tit.locator('[data-eq="down"]').first().click();                                                       // quito uno de los titulares
  const firstBench = (await ban.locator(".lh-mon >> nth=1").locator(".lh-mi b").innerText()).trim();
  await ban.locator('[data-eq="up"]').nth(1).click();                                                          // y entra otro suplente
  assert.equal((await tit.locator(".lh-mon >> nth=5").locator(".lh-mi b").innerText()).trim(), firstBench, "el suplente pasa a titular");
  assert.equal(await tit.locator(".lh-mon").count(), 6); assert.equal(await ban.locator(".lh-mon").count(), 2);
  assert.match(await pg.locator(".lh-mon >> nth=0").textContent(), /Físico|Especial|Estado/, "cada ataque dice si es físico, especial o de estado");
  assert.equal(await pg.evaluate(() => document.querySelector("#dl-moves option") ? /Físico|Especial|Estado/.test(document.querySelector("#dl-moves option").label) : true), true);
  // pestaña Objetos: se le da a cada Pokémon el que se quiera, con imagen
  await pg.click('[data-tab="objetos"]');
  assert.equal(await pg.locator(".lh-orow").count(), 8, "salen todos los Pokémon de la plantilla");
  await pg.locator("[data-item]").first().click(); await pg.waitForSelector(".lg-sheet .lg-opt");
  assert.ok(await pg.locator(".lg-sheet .lg-chips [data-chip]").count() >= 4, "hay filtros");
  assert.ok(await pg.locator(".lg-sheet .lg-opt img.lh-ip").count() > 5, "los objetos salen con su imagen");
  await pg.fill(".lg-sheet input", "restos"); assert.match(await pg.innerText(".lg-sheet .lg-ul"), /Restos/i);
  await pg.locator(".lg-sheet .lg-opt").first().click();
  assert.match(await pg.innerText(".lh-orow >> nth=0"), /Restos/i, "el Pokémon lleva el objeto");
  assert.ok(await pg.locator(".lh-orow >> nth=0 >> img.lh-ip").count() === 1, "y se ve su imagen");
  await pg.locator("[data-itemx]").first().click(); assert.equal(await pg.locator("[data-itemx]").count(), 0, "se puede quitar");
  await pg.click('[data-tab="equipo"]');
  { const [dlb] = await Promise.all([pg.waitForEvent("download"), pg.click("[data-box]")]);
    const buf = require("fs").readFileSync(await dlb.path()); assert.match(dlb.suggestedFilename(), /^caja-.*\.zip$/);
    assert.ok((buf.toString("latin1").match(/\.pk[67]/g) || []).length >= 16, "el zip lleva los 8 Pokémon (titulares y banquillo)"); }
  // megas: no se sortean; se equipa la megapiedra a un Pokémon cuando se quiera
  assert.equal(await pg.locator('.lh-mon:has-text("Pikachu") [data-mega], .lh-mon:has-text("Bulbasaur") [data-mega]').count(), 0, "solo los Pokémon que megaevolucionan ofrecen megapiedra");
  const gen = tit.locator('.lh-mon:has-text("Gengar")'); await gen.locator("[data-mega]").click();
  assert.match(await pg.innerText(".lg-sheet"), /Gengarit/i); await pg.click(".lg-opt >> nth=0");
  assert.match(await gen.innerText(), /Gengarit/i, "queda equipada la megapiedra");
  await gen.locator("[data-mega]").click(); await pg.click('.lg-opt:has-text("Quitar")');
  assert.doesNotMatch(await gen.innerText(), /Gengarit/i, "y se puede quitar");
  await gen.locator("[data-mega]").click(); await pg.click(".lg-opt >> nth=0");                         // la deja puesta
  await pg.screenshot({ path: S + "/liga-equipo.png", fullPage: true });
  await pg.click('[data-tab="entrenadores"]');

  // ---- 2. Editor ROM ----
  await pg.click("#lhBack"); await pg.click("#goRom"); await pg.waitForSelector("#lgRom");
  assert.equal(await pg.locator("#romRoot .lg-p").count(), 7);
  await pg.setInputFiles("#lgRom", S + "/um.3ds"); await pg.setInputFiles("#lgMod", S + "/um.3ds.mod.zip");
  await pg.click("#lgOpen"); await pg.waitForSelector(".lg-ok", { timeout: 15000 });
  await pg.click('.lg-p:has-text("Ana") [data-act=slot]'); await pg.fill(".lg-in", "Liam"); await pg.click(".lg-opt");
  await pg.click("#lgBlock"); await pg.fill(".lg-in", "Kaudan");
  assert.match(await pg.innerText(".lg-opt"), /N\./, "se ve el equipo del entrenador"); await pg.click(".lg-opt");
  assert.equal(await pg.locator(".lg-slot.ok").count(), 2);
  const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click("#lgExp")]);
  assert.match(await pg.locator('.lg-steps:has-text("Alineaciones de la IA")').textContent(), /Fran/, "al exportar, la IA prepara sus alineaciones y el informe las lista");
  await dl.saveAs(S + "/liga-out.zip"); console.log("descarga:", dl.suggestedFilename(), "|", await pg.innerText(".lg-ok >> nth=1"));

  // ---- 3. Liga a 2 vueltas ----
  await pg.click("#lgGoLiga"); await pg.waitForSelector("#lhCompName");
  await pg.click('[data-tab="calendario"]');
  await pg.selectOption("#lhVueltas", "2"); await pg.click("#lhGenLiga");
  assert.equal(await pg.locator(".lh-chip[data-j]").count(), 14, "7 entrenadores a 2 vueltas = 14 jornadas");
  // la IA prepara las alineaciones de Fran según su rival de la jornada (Ana) y el siguiente
  // dinero de la IA: se le dan 2000 monedas y, al preparar sus alineaciones, las gasta en mejorar a sus Pokémon
  await pg.click('[data-tab="tienda"]'); await pg.selectOption("#lhSP", { index: 6 });
  await pg.fill("#lhCoinN", "2000"); await pg.click("#lhCoinGive");
  assert.match(await pg.innerText("#lhSP"), /Fran · 🪙2000/, "Fran tiene 2000 monedas");
  assert.equal(await pg.locator("[data-shop]").count(), 0, "y nadie las gasta por ella en la tienda");
  await pg.click('[data-tab="calendario"]');
  await pg.click("#lhAiPrep"); await pg.click('[data-tab="equipo"]'); await pg.selectOption("#lhEqP", { label: "Fran" });
  assert.match(await pg.innerText(".lh-body"), /La IA eligió esta jornada contra Ana/, "la IA ve quién es su rival");
  assert.match(await pg.innerText(".lh-body"), /Titulares:/); assert.equal(await pg.locator("[data-eq], [data-mega]").count(), 0, "y nadie le toca titulares ni megapiedras");
  assert.match(await pg.innerText(".lh-body"), /Gestiona su dinero/); assert.match(await pg.innerText(".lh-body"), /esta vez gastó en/, "la IA ha comprado mejoras con su dinero");
  await pg.click('[data-tab="tienda"]'); await pg.selectOption("#lhSP", { index: 6 });
  assert.doesNotMatch(await pg.innerText("#lhSP"), /Fran · 🪙2000/, "y su dinero ha bajado");
  assert.match(await pg.locator(".lh-body").textContent(), /🤖 IA ·/, "queda anotado en su historial de monedas");
  await pg.click('[data-tab="equipo"]'); await pg.selectOption("#lhEqP", { label: "Fran" });
  await pg.click('[data-tab="calendario"]');
  await pg.selectOption("#lhMe", { label: "Ana" });
  assert.match(await pg.innerText(".lh-body"), /Tú/, "salen mis próximos partidos");
  await pg.locator('.lh-fx [data-w]').first().click();                                // “Gané”
  assert.match(await pg.innerText(".lg-sheet"), /Marcador/);
  assert.equal(await pg.locator('.lg-sheet input[data-side="b"]:checked').count(), 6, "al ganar, por defecto caen los 6 titulares del rival");
  await pg.click('.lg-sheet input[data-side="a"] >> nth=0'); await pg.click(".lg-sheet [data-ok]");   // gana 3–1: cae el Pikachu de Ana
  assert.match(await pg.innerText(".lh-streak"), /1 victoria seguida/);
  assert.match(await pg.innerText(".lh-hero"), /Ana · .*victoria/);
  await pg.screenshot({ path: S + "/liga-calendario.png", fullPage: true });
  await pg.click('[data-tab="comp"]');
  assert.equal(await pg.locator(".lh-pod").count(), 0, "sin podio");
  assert.equal(await pg.locator(".lh-cl tr.z-po").first().evaluate(e => getComputedStyle(e).borderLeftColor), "rgb(240, 140, 0)", "el playoff es naranja");
  assert.equal(await pg.locator(".lh-leg i.z-po").evaluate(e => getComputedStyle(e).backgroundColor), "rgb(240, 140, 0)", "y también en la leyenda");
  assert.ok(await pg.locator(".lh-cl tbody tr .lh-av").count() >= 7, "cada fila de la clasificación lleva el escudo del entrenador");
  assert.equal(await pg.locator(".lh-cl tbody tr:has-text(\"Ana\") .lh-av img").count(), 1, "y se ve la imagen de Ana");
  assert.match(await pg.innerText(".lh-cl thead"), /GF[\s\S]*GC/, "la tabla tiene GF y GC");
  assert.match(await pg.innerText(".lh-cl tbody tr:first-child"), /Ana[\s\S]*\t1\t1\t0\t0\t6\t1\t3/, "Ana: 1 PJ, 1 V, GF 6, GC 1, 3 pts");
  await pg.click('[data-tab="calendario"]'); assert.match(await pg.innerText(".lh-body"), /6–1/, "el combate muestra su marcador");
  await pg.click(".lh-edit >> nth=0"); await pg.click('.lg-sheet input[data-side="b"] >> nth=0'); await pg.click(".lg-sheet [data-ok]");   // ahora 2–1
  await pg.click('[data-tab="comp"]'); assert.match(await pg.innerText(".lh-cl tbody tr:first-child"), /Ana[\s\S]*\t5\t1\t3/, "se puede corregir el marcador");
  // estadísticas: Pikachu de Ana jugó 1 partido y tiene 1 amarilla
  await pg.click('[data-tab="stats"]');
  assert.match(await pg.innerText(".lh-stt tbody"), /Pikachu\s*Ana\s*1\t1\t0\t/, "PJ 1 y 🟨 1");
  assert.equal(await pg.locator(".lh-stt tbody tr:has-text(\"Pikachu\"):has-text(\"Ana\") .lg-cd.y1").count(), 1, "una amarilla sobre el Pokémon");
  await pg.locator('.lh-stt tbody tr:has-text("Pikachu"):has-text("Ana")').screenshot({ path: S + "/tarjeta-amarilla.png" });
  // 2.º partido: vuelve a caer Pikachu → 2 amarillas → sancionado
  await pg.click('[data-tab="calendario"]'); await pg.locator('.lh-fx [data-w]').first().click();
  await pg.click('.lg-sheet input[data-side="a"] >> nth=0'); await pg.click(".lg-sheet [data-ok]");
  await pg.click('[data-tab="stats"]');
  assert.match(await pg.innerText(".lh-body"), /Sancionados ahora/); assert.match(await pg.innerText(".lh-stt tbody"), /Pikachu\s*Ana\s*2\t2\t1\t.*Sancionado/, "2 amarillas = 🟥");
  assert.equal(await pg.locator(".lh-stt tbody tr:has-text(\"Pikachu\"):has-text(\"Ana\") .lg-cd.r").count(), 1, "tarjeta roja sobre el sancionado");
  await pg.locator('.lh-stt tbody tr:has-text("Pikachu"):has-text("Ana")').screenshot({ path: S + "/tarjeta-roja.png" });
  // la ROM no recibe al sancionado
  await pg.click("#lhBack"); await pg.click("#goRom"); await pg.waitForSelector("#lgExp");
  const [dl2] = await Promise.all([pg.waitForEvent("download"), pg.click("#lgExp")]);
  assert.match(await pg.innerText(".lg-warn[open]"), /Pikachu sancionado/, "al exportar se avisa de que el sancionado no se incluye");
  await pg.click("#lgGoLiga"); await pg.click('[data-tab="calendario"]');
  // 3.er partido: Pikachu aparece sancionado y no puede jugar; al cumplirlo vuelve
  await pg.locator('.lh-fx [data-w]').first().click();
  await pg.waitForSelector(".lg-sheet");
  assert.equal(await pg.locator('.lg-sheet input[disabled][data-sp="Pikachu"]').count(), 1, "Pikachu no puede jugar este partido");
  await pg.click(".lg-sheet [data-skip]");
  await pg.click('[data-tab="stats"]'); assert.match(await pg.innerText(".lh-stt tbody"), /Pikachu\s*Ana\s*2\t2\t1\t—/, "cumple la sanción: sigue con 2 PJ y deja de estar sancionado");
  await pg.locator('.lh-stt tbody tr:has-text("Pikachu"):has-text("Ana")').screenshot({ path: S + "/liga-stats-tabla.png" });
  await pg.screenshot({ path: S + "/liga-stats.png", fullPage: true });
  await pg.click('[data-tab="comp"]');
  assert.equal(await pg.locator(".lh-body > .lh-card").count(), 1, "la pestaña solo lleva la clasificación");
  assert.equal(await pg.locator(".lh-cl tr.z-asc").count(), 2); assert.equal(await pg.locator(".lh-cl tr.z-po").count(), 2); assert.equal(await pg.locator(".lh-cl tr.z-desc").count(), 2);
  await pg.screenshot({ path: S + "/liga-clasificacion.png", fullPage: true });

  // ---- 4. Copa con sorteo ----
  await pg.click("#lhCompNew"); await pg.fill("#lhCName", "Copa de invierno"); await pg.selectOption("#lhCType", "copa"); await pg.click("#lhCCreate");
  assert.equal(await pg.inputValue("#lhCompName"), "Copa de invierno");
  await pg.click("#lhGenCup");
  assert.deepEqual(await pg.locator(".lh-card .lh-ch b").allInnerTexts().then(a => a.filter(x => /^(Cuartos de final|Semifinales|Final)$/.test(x))), ["Cuartos de final", "Semifinales", "Final"]);
  assert.equal(await pg.locator(".lh-tie .lh-note", { hasText: "Pasa directo" }).count(), 1, "con 7, uno descansa");
  await pg.screenshot({ path: S + "/liga-copa.png", fullPage: true });
  for (let i = 0; i < 12 && !(await pg.locator(".lh-champ").count()); i++) { await pg.locator('.lh-tie [data-fx][data-w="a"]').first().click(); await pg.click(".lg-sheet [data-skip]"); }
  assert.equal(await pg.locator(".lh-champ").count(), 1, "se juega la copa hasta tener campeón");
  await pg.screenshot({ path: S + "/liga-copa-final.png", fullPage: true });

  // ---- 5. Champions (nuevo formato) ----
  await pg.click("#lhCompNew"); await pg.fill("#lhCName", "Champions"); await pg.selectOption("#lhCType", "champions"); await pg.click("#lhCCreate");
  assert.match(await pg.innerText(".lh-body"), /fase de liga/i);
  await pg.selectOption("#lhRounds", "3"); await pg.click("#lhGenCL");
  assert.equal(await pg.locator(".lh-cl tbody tr").count(), 7);
  await pg.click('[data-tab="calendario"]'); await pg.locator('.lh-hj .lh-fx [data-w]').first().click();
  await pg.click(".lg-sheet [data-skip]");
  await pg.click('[data-tab="comp"]'); await pg.click("#lhGenCK");
  const rounds = await pg.locator(".lh-card .lh-ch b").allInnerTexts();
  assert.ok(rounds.includes("Playoff") && rounds.includes("Final"), "salen playoff y final: " + rounds.join("|"));
  assert.ok(await pg.locator(".lh-tie [data-fx]").count() >= 2, "playoff con partidos de ida");
  await pg.screenshot({ path: S + "/liga-champions.png", fullPage: true });

  // ---- 6. Entrenadores en varias competiciones ----
  await pg.click('[data-tab="entrenadores"]'); await pg.click('.lh-tc:has-text("Fran")');           // Fran
  assert.equal(await pg.locator('[data-member].on').count(), 3, "Fran está en las tres competiciones");
  await pg.click('[data-member]:not(.on), [data-member].on >> nth=2');                       // sale de la Champions
  assert.equal(await pg.locator('[data-member].on').count(), 2);
  await pg.click("#lhBackList");
  await pg.click(".lh-chip.comp >> nth=0"); assert.equal(await pg.inputValue("#lhCompName"), "Liga");
  await pg.click('[data-tab="ajustes"]'); await pg.click("#lhNone");
  assert.equal(await pg.locator('[data-pm].on').count(), 0); await pg.click("#lhAll");
  assert.equal(await pg.locator('[data-pm].on').count(), 7);
  await pg.setInputFiles("#lhImgC", S + "/escudo.png"); await pg.waitForSelector(".lh-hero .lh-trophy img");
  assert.ok(await pg.locator(".lh-chip.comp.on img").count() >= 1, "el escudo sale en la pestaña de la competición");
  await pg.click('.lh-emo.col [data-cc] >> nth=3'); await pg.click("#lhRmImgC");
  assert.equal(await pg.locator(".lh-hero .lh-trophy img").count(), 0, "se puede quitar la imagen y dejar solo el color");

  // ---- 7. Cerrar temporada de la liga → historial ----
  await pg.click('[data-tab="ajustes"]'); await pg.click("details.lh-det:has(#lhClose) > summary"); await pg.click("#lhClose");
  await pg.waitForSelector(".lh-hs"); assert.match(await pg.innerText(".lh-hs"), /Liga · Temporada 1/);
  await pg.screenshot({ path: S + "/liga-historial.png", fullPage: true });
  // ---- 8. Persistencia y ancho móvil ----
  await pg.reload(); await pg.waitForSelector("#pname", { timeout: 60000 });
  assert.equal(await pg.locator(".pcard").count(), 7, "la pantalla de entrada lista a los jugadores de la liga");
  assert.match(await pg.innerText("#plist"), /Ana[\s\S]*Fran/);
  assert.equal(await pg.locator("#pemo").count(), 0, "ya no hay emojis (gorra, trébol…) para elegir");
  assert.equal((await pg.locator('.pcard:has-text("Beto") .pav').innerText()).trim(), "", "el avatar es solo el color");
  assert.ok(await pg.locator("#pcol span").count() >= 24, "hay muchos colores"); assert.equal(await pg.locator("#pcc").count(), 1, "y un selector de color libre");
  assert.equal(await pg.locator("#plist .pcard .pav img").count(), 1, "el escudo de Ana sale en su tarjeta");
  await pg.screenshot({ path: S + "/entrada.png", fullPage: true });
  await pg.click('.pcard:has-text("Ana")'); assert.match(await pg.innerText("#whoami"), /Ana/);
  await pg.click("#goLiga"); await pg.waitForSelector("#lhCompName"); assert.match(await pg.innerText(".lh-hero"), /Ana/, "al entrar como Ana, «tú» es Ana");
  assert.equal(await pg.locator(".lh-chip.comp").count(), 3, "las tres competiciones se guardan");
  await pg.click('[data-tab="historial"]'); assert.match(await pg.innerText(".lh-hs"), /Temporada 1/);
  for (const tab of ["comp", "calendario", "equipo", "entrenadores", "tienda", "historial", "ajustes"]) {
    await pg.click(`[data-tab="${tab}"]`);
    const sw = await pg.evaluate(() => document.querySelector("#scr-liga").scrollWidth); assert.ok(sw <= 390, `scroll horizontal en ${tab}: ${sw}`);
  }
  errors.push(...pg.errors);
  await br.close(); srv.close();
  console.log("errores de página:", errors); assert.equal(errors.length, 0);
  console.log("UI OK");
})().catch(e => { console.error(e); process.exit(1); });
