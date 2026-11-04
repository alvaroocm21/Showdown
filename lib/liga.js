// Liga: datos comunes (jornadas, entrenadores, resultados, monedas) y pantalla «Editor ROM».
// La pantalla «Liga» (temporada, entrenadores, tienda, historial) está en ligahub.js.
// Los combates se juegan en la ROM; aquí solo se preparan los equipos.
const Liga = (() => {
  const KEY = "liga.v1";
  const EMOJIS = ["🧑", "👩", "🧔", "👧", "👦", "🧙", "🦸", "🥷", "🧛", "🤠", "👑", "🎩"];
  const COLORS = ["#2f7bff", "#e8590c", "#2fa84f", "#a040a0", "#d4a600", "#e84a8a", "#2ab7c9", "#6b7a90"];
  const BOSS = /lider|alto mando|campe|magma|aqua|leader|elite|champion|rival|admin|jefe|frente|cerebro|kahuna|capitan|skull|aether|presidenta|ultraguardia|lusamine|guzman|maestro|cima/;
  let X, L, root, hub = null;
  // Estado de la ROM abierta (nunca se guarda: el archivo se vuelve a elegir cada vez)
  const R = { romFile: null, modFile: null, busy: "", err: "", ready: false, cfg: null, data: null, texts: [], t: null, byId: {}, res: null, titleId: "", modName: "" };
  let report = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const TYPES = { liga: ["🏟", "Liga"], copa: ["🏆", "Copa"], champions: ["⭐", "Champions"] };
  const newComp = (type, name, partIds) => {
    const j = { id: "j" + uid(), name: "Jornada 1" };
    return { id: "c" + uid(), name: name || TYPES[type][1], type, partIds: partIds || [], jornadas: [j], cur: j.id, matches: [], fixtures: [], history: [],
      season: { name: (type === "copa" ? "Edición" : "Temporada") + " 1", n: 1 }, zones: { asc: 2, po: 2, desc: 2 },
      vueltas: 1, legs: 1, finalLegs: 1, seeding: "sorteo", rounds: 8, ko: null, phase: "liga" };
  };
  const fresh = () => { const c = newComp("liga", "Liga", []); return { v: 2, parts: [], comps: [c], cc: c.id }; };
  // Datos de la versión anterior (una sola liga) → una competición «Liga» con todos los entrenadores
  function migrate(d) {
    if (Array.isArray(d.comps) && d.comps.length) return d;
    const c = newComp("liga", "Liga", d.parts.map(p => p.id));
    Object.assign(c, { jornadas: d.jornadas, cur: d.cur, matches: d.matches || [], fixtures: d.fixtures || [], history: d.history || [], season: d.season || c.season, zones: d.zones || c.zones });
    d.comps = [c]; d.cc = c.id; d.v = 2;
    for (const k of ["jornadas", "cur", "matches", "fixtures", "history", "season", "zones", "view"]) delete d[k];
    return d;
  }
  function fixComp(c) {
    for (const k of ["matches", "fixtures", "history", "partIds", "jornadas"]) if (!Array.isArray(c[k])) c[k] = [];
    if (!c.jornadas.length) { const j = { id: "j" + uid(), name: "Jornada 1" }; c.jornadas.push(j); }
    if (!c.jornadas.some(j => j.id === c.cur)) c.cur = c.jornadas[0].id;
    if (!c.season) c.season = { name: "Temporada 1", n: 1 };
    if (!c.zones) c.zones = { asc: 2, po: 2, desc: 2 };
    if (!c.type) c.type = "liga";
    for (const [k, v] of [["vueltas", 1], ["legs", 1], ["finalLegs", 1], ["rounds", 8], ["seeding", "sorteo"], ["phase", "liga"]]) if (c[k] == null) c[k] = v;
  }
  function load() {
    L = X.store.get(KEY, null);
    if (!L || !Array.isArray(L.parts) || (!Array.isArray(L.jornadas) && !Array.isArray(L.comps))) L = fresh();
    L = migrate(L); L.comps.forEach(fixComp);
    if (!L.comps.some(c => c.id === L.cc)) L.cc = L.comps[0].id;
  }
  const save = () => X.store.set(KEY, L);
  // Competición activa y utilidades
  const C = () => L.comps.find(c => c.id === L.cc) || L.comps[0];
  const compOfJ = jid => L.comps.find(c => c.jornadas.some(j => j.id === jid)) || C();
  const jor = () => { const c = C(); return c.jornadas.find(j => j.id === c.cur); };
  const partsOf = c => (c || C()).partIds.map(id => L.parts.find(p => p.id === id)).filter(Boolean);
  const inComp = (p, c) => (c || C()).partIds.includes(p.id);
  // Equipo de un entrenador en una jornada: el suyo si lo editó; si no, hereda el de la jornada anterior de esa competición;
  // en la primera, su último equipo editado en cualquier competición.
  function teamOf(p, jid) {
    const c = jid ? compOfJ(jid) : C(); jid = jid || c.cur;
    const js = c.jornadas; let i = js.findIndex(j => j.id === jid);
    for (; i >= 0; i--) { const t = p.teams && p.teams[js[i].id]; if (t && t.length) return t; }
    return p.last || [];
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  function setTeam(p, jid, sets) { (p.teams = p.teams || {})[jid] = clone(sets); p.last = clone(sets); }
  // Copia propia del equipo en esa jornada (para poder modificarlo sin tocar las jornadas anteriores)
  function ownTeam(p, jid) { if (!p.teams || !p.teams[jid] || !p.teams[jid].length) setTeam(p, jid, teamOf(p, jid)); return p.teams[jid]; }
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const esc = s => X.esc(s);
  const refresh = () => { renderRom(); if (hub) hub.render(); };

  // ---------- ROM ----------
  const trainerLabel = id => {
    const t = R.t; if (!t) return "#" + id;
    const n = t.trainers[id] || "", c = t.classes[R.byId[id] ? R.byId[id].cls : -1] || "";
    return (c && n ? c + " " + n : n || c || "Entrenador") + " (#" + id + ")";
  };
  async function openRom() {
    if (!R.romFile) return;
    R.err = ""; R.ready = false; R.busy = "Leyendo la cabecera de la ROM…"; refresh();
    try {
      const base = await Core.openRom(Core.fileReader(R.romFile));
      let mod = null;
      if (R.modFile) { R.busy = "Leyendo el mod…"; refresh(); mod = await Core.openModZip(Core.fileReader(R.modFile)); }
      const rom = Core.overlay(base, mod);
      const cfg = await Core.detectGame(rom);
      R.busy = "Leyendo textos del juego…"; refresh();
      // Idioma de pantalla: español si lo hay; para casar nombres se usan además los de inglés.
      const texts = [];
      const ls = [];
      for (const l of [6, 2, 3, 4, 5, 1, 0, 7, 8, 9]) { const t = await Core.loadText(rom, cfg, l); if (t) { texts.push(t); ls.push(l); } if (texts.length >= 2 && l >= 2) break; }
      R.lang = ls[0];
      if (!texts.length) throw new Core.RomError("text", "No encuentro los textos del juego en la ROM.");
      R.busy = "Leyendo entrenadores y Pokémon…"; refresh();
      const data = await Core.loadGame(rom, cfg);
      const byId = {}; data.trainers.forEach(t => byId[t.id] = t);
      Object.assign(R, { base, mod, rom, cfg, data, texts, t: texts[0], byId, titleId: base.titleId, modName: R.modFile ? R.modFile.name : "", ready: true, busy: "",
        res: LigaMap.makeResolver({ Dex: X.Dex, texts, names: X.NAMES, data, gen: cfg.gen }) });
      report = null;
    } catch (e) {
      R.busy = ""; R.err = e && e.message ? e.message : "No se pudo leer el archivo.";
    }
    refresh();
  }
  function listText() {
    const rows = R.base.list().map(f => `${f.path} ${f.size}`);
    if (R.mod) for (const [p, f] of R.mod.files) rows.push(`MOD:${p} ${f.size}`);
    return rows.join("\n");
  }
  async function getFile(path) {
    const data = await R.rom.readFile(path.trim().replace(/^\/+/, ""));
    if (!data) { alert("Ese archivo no existe en la ROM (ni en el mod)."); return; }
    download(new Blob([data], { type: "application/octet-stream" }), path.trim().replace(/\//g, "_"));
  }
  const slotOf = p => (p.slots && R.ready ? p.slots[R.titleId] : null);

  function validate(p) {
    if (!R.ready) return [];
    const warns = [];
    teamOf(p).slice(0, 6).forEach(set => warns.push(...LigaMap.setToMon(set, R.res, null, set.species).warns));
    return warns;
  }

  // ---------- Exportar ----------
  async function build() {
    const assignments = [], missing = [];
    for (const p of partsOf()) {
      const sets = teamOf(p), slot = slotOf(p);
      if (!sets.length) { missing.push(`${p.name}: no tiene Pokémon en esta jornada`); continue; }
      if (!slot) { missing.push(`${p.name}: no tiene entrenador asignado en la ROM`); continue; }
      assignments.push({ slot, name: p.name, sets });
    }
    const r = LigaMap.applyLeague(assignments, R.res, R.byId);
    const files = r.trainers.length ? Core.buildMod(R.cfg, R.data, r.trainers) : {};
    if (r.trainers.length && L.rename !== false) {
      const names = {}; assignments.forEach(a => names[a.slot] = a.name);
      Object.assign(files, await Core.buildNames(R.rom, R.cfg, names, [R.lang]));
    }
    return { files, trainers: r.trainers, warns: [...missing, ...r.warns], assignments };
  }
  const fname = () => `liga-${R.titleId}-${norm(jor().name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jornada"}`;
  // En la APK de Android el guardado va por el puente nativo (a la carpeta Descargas); en el navegador, por un enlace.
  async function nativeSave(blob, name) {
    const A = window.AndroidApp;
    if (!A || !A.saveStart) return null;
    if (!A.saveStart(name)) return false;
    const CH = 3 * 512 * 1024;
    for (let off = 0; off < blob.size; off += CH) {
      const buf = new Uint8Array(await blob.slice(off, off + CH).arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      if (!A.saveChunk(btoa(bin))) return false;
    }
    return !!A.saveEnd();
  }
  async function download(blob, name) {
    const n = await nativeSave(blob, name);
    if (n === true) { alert(`Guardado en la carpeta Descargas: ${name}`); return; }
    if (n === false) { alert("No se pudo guardar el archivo en Descargas."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 5000);
  }
  async function doExport(toFolder) {
    try {
      const b = await build();
      report = { n: b.trainers.length, warns: b.warns, done: false, names: b.assignments.map(a => a.name), jornada: jor().name };
      if (!b.trainers.length) { refresh(); return; }
      if (toFolder) {
        // Escribe directamente en la carpeta elegida (Chrome de escritorio). Elige la carpeta «load/mods» de Azahar.
        const dir = await window.showDirectoryPicker({ mode: "readwrite" });
        for (const [p, d] of Object.entries(b.files)) {
          let h = await dir.getDirectoryHandle(R.titleId, { create: true });
          const parts = ("romfs/" + p).split("/");
          for (const s of parts.slice(0, -1)) h = await h.getDirectoryHandle(s, { create: true });
          const f = await (await h.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
          await f.write(d); await f.close();
        }
        report.done = "folder";
      } else {
        await download(Core.zip(Object.entries(b.files).map(([p, d]) => [`${R.titleId}/romfs/${p}`, d])), fname() + ".zip");
        report.done = "zip";
      }
    } catch (e) {
      report = { ...(report || {}), err: e && e.name === "AbortError" ? "Cancelado." : "No se pudo exportar: " + (e && e.message || "error desconocido") };
    }
    refresh();
  }

  // ---------- Selector con buscador ----------
  function pickSheet(title, items, onPick) {
    const ov = document.createElement("div");
    ov.className = "lg-ov";
    ov.innerHTML = `<div class="lg-sheet" role="dialog" aria-label="${esc(title)}"><div class="lg-sh"><b>${esc(title)}</b><button class="btn sm ghost" data-x>Cerrar</button></div>
      <input type="search" class="lg-in" placeholder="Buscar…" autocomplete="off"><ul class="lg-ul"></ul></div>`;
    document.body.append(ov);
    const ul = ov.querySelector("ul"), q = ov.querySelector("input");
    let shown = 60, list = items;
    const draw = () => {
      ul.innerHTML = list.slice(0, shown).map((it, i) => `<li><button class="lg-opt" data-i="${i}" ${it.disabled ? "disabled" : ""}><span>${esc(it.label)}</span><small>${esc(it.sub || "")}</small></button></li>`).join("")
        + (list.length > shown ? `<li><button class="btn sm ghost" data-more>Mostrar más (${list.length - shown})</button></li>` : "") || `<li class="lg-empty">Nada que mostrar</li>`;
    };
    const close = () => ov.remove();
    ov.onclick = e => {
      if (e.target === ov || e.target.hasAttribute("data-x")) return close();
      if (e.target.closest("[data-more]")) { shown += 60; return draw(); }
      const b = e.target.closest(".lg-opt"); if (!b || b.disabled) return;
      close(); onPick(list[+b.dataset.i]);
    };
    q.oninput = () => { const k = norm(q.value); list = k ? items.filter(it => norm(it.label + " " + (it.sub || "")).includes(k)) : items; shown = 60; draw(); };
    draw(); q.focus();
  }

  const teamPreview = t => t.team.length ? t.team.map(m => (R.t.species[m.species] || "?") + " N." + m.level).join(", ") : "sin Pokémon";
  function slotItems(used) {
    return R.data.trainers.map(t => {
      const label = trainerLabel(t.id), boss = BOSS.test(norm(label));
      return { id: t.id, label, boss, sub: `${teamPreview(t)}${t.battleType ? " · doble" : ""}${used[t.id] ? " · ya es de " + used[t.id] : ""}`, disabled: !!used[t.id] };
    }).sort((a, b) => (b.boss - a.boss) || (a.id - b.id));
  }
  function pickSlot(p) {
    if (!R.ready) return;
    const used = {}; L.parts.forEach(o => { const s = slotOf(o); if (s && o.id !== p.id) used[s] = o.name; });
    pickSheet(`Entrenador de la ROM para ${p.name}`, slotItems(used), it => { (p.slots = p.slots || {})[R.titleId] = it.id; save(); refresh(); });
  }
  // Los entrenadores consecutivos del juego suelen estar en el mismo sitio: se asignan los siguientes al elegido.
  function pickBlock() {
    if (!R.ready) return;
    const todo = partsOf().filter(p => !slotOf(p));
    if (!todo.length) { alert("Todos los entrenadores de la liga ya tienen asignado uno de la ROM."); return; }
    const used = {}; L.parts.forEach(o => { const s = slotOf(o); if (s) used[s] = o.name; });
    const items = slotItems(used).sort((a, b) => a.id - b.id);
    pickSheet(`Primer entrenador del bloque (${todo.length} por asignar)`, items, it => {
      const taken = new Set(Object.keys(used).map(Number));
      const ids = R.data.trainers.filter(t => t.id >= it.id && t.team.length && !taken.has(t.id)).map(t => t.id);
      todo.forEach(p => { if (ids.length) (p.slots = p.slots || {})[R.titleId] = ids.shift(); });
      save(); refresh();
    });
  }
  function suggestSlots() {
    if (!R.ready) return;
    const used = new Set(L.parts.map(slotOf).filter(Boolean));
    const free = R.data.trainers.filter(t => !used.has(t.id) && t.team.length && BOSS.test(norm(trainerLabel(t.id)))).map(t => t.id);
    const pool = free.length >= partsOf().length ? free : R.data.trainers.filter(t => !used.has(t.id) && t.team.length).map(t => t.id);
    for (const p of partsOf()) if (!slotOf(p) && pool.length) (p.slots = p.slots || {})[R.titleId] = pool.shift();
    save(); refresh();
  }

  // ---------- Resultados e histórico ----------
  const pName = id => (L.parts.find(p => p.id === id) || { name: "(borrado)" }).name;
  const matches = c => (c || C()).matches;
  // Clasificación de una competición (solo partidos de liga; las eliminatorias llevan t y no cuentan).
  function standings(jid, c) {
    c = c || C(); const t = {};
    partsOf(c).forEach(p => t[p.id] = { id: p.id, name: p.name, pj: 0, v: 0, e: 0, d: 0, pts: 0 });
    for (const m of c.matches) {
      if (m.t || (jid && m.j !== jid)) continue;
      const a = t[m.a], b = t[m.b]; if (!a || !b) continue;
      a.pj++; b.pj++;
      if (m.w === "d") { a.e++; b.e++; a.pts++; b.pts++; } else if (m.w === "a") { a.v++; b.d++; a.pts += 3; } else { b.v++; a.d++; b.pts += 3; }
    }
    return Object.values(t).sort((x, y) => y.pts - x.pts || (y.v - x.v) || x.d - y.d || x.name.localeCompare(y.name));
  }
  function headToHead(c) {
    c = c || C(); const r = {};
    for (const m of c.matches) {
      if (!L.parts.some(p => p.id === m.a) || !L.parts.some(p => p.id === m.b)) continue;
      const [x, y] = m.a < m.b ? [m.a, m.b] : [m.b, m.a], k = x + "|" + y;
      const o = r[k] || (r[k] = { x, y, vx: 0, vy: 0, e: 0 });
      if (m.w === "d") o.e++; else if ((m.w === "a") === (m.a === x)) o.vx++; else o.vy++;
    }
    return Object.values(r);
  }
  // Todos los resultados de un entrenador en todas las competiciones, por orden de fecha.
  function allResults(pid) {
    const ms = [];
    L.comps.forEach((c, ci) => c.matches.forEach((m, i) => { if (m.a === pid || m.b === pid) ms.push({ m, k: [m.ts || 0, ci, i] }); }));
    ms.sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2]);
    return LigaCal.results(ms.map(x => x.m), pid);
  }
  // Zonas de la tabla: en la Champions salen del formato (directos / playoff / fuera); en la liga, de los ajustes.
  function zonesOf(c) {
    if (c.type === "champions") { const pr = LigaCal.champParams(partsOf(c).length); return pr ? { asc: pr.direct, po: pr.playoff, desc: pr.out } : { asc: 0, po: 0, desc: 0 }; }
    return c.zones;
  }

  // ---------- Monedas y tienda ----------
  const cfg = () => {
    const d = LigaShop.DEFAULTS(); if (!L.cfg) L.cfg = d;
    L.cfg.prices = Object.fromEntries(Object.keys(d.prices).map(k => [k, L.cfg.prices && L.cfg.prices[k] != null ? L.cfg.prices[k] : d.prices[k]]));
    return L.cfg;
  };
  const bal = id => (L.coins && L.coins[id]) || 0;
  function addCoins(id, n, text) {
    L.coins = L.coins || {}; L.coins[id] = bal(id) + n;
    (L.log = L.log || []).unshift({ t: Date.now(), p: id, d: n, text }); L.log = L.log.slice(0, 200);
  }
  const shopEnv = () => ({ Dex: X.Dex, abils: X.ABILS, natures: X.NATURES, moves: X.MOVES, items: X.RITEMS, learnable: X.learnable,
    ok: (k, o) => !R.ready || (k === "ability" ? R.res.ability(o) : k === "move" ? R.res.move(o) : R.res.item(o)) >= 0 });

  // ---------- Eliminatorias ----------
  // Crea las jornadas de cada ronda (una por partido de ida y otra por vuelta) y las apunta en la ronda.
  function koJornadas(c, rounds, prefix) {
    for (const r of rounds) {
      r.jids = [];
      for (let l = 0; l < r.legs; l++) {
        const j = { id: "j" + uid(), name: r.name + (r.legs === 2 ? (l ? " · vuelta" : " · ida") : "") };
        c.jornadas.push(j); r.jids.push(j.id);
      }
    }
  }
  // Pone al día el cuadro: coloca a los ganadores y crea los partidos pendientes de las eliminatorias ya definidas.
  function syncKO(c) {
    if (!c.ko) return;
    LigaCal.advance(c.ko, c.matches);
    for (const r of c.ko.rounds) for (const t of r.ties) {
      if (!t.a || !t.b || t.bye) continue;
      if (LigaCal.tieInfo(t, r.legs, c.matches).winner) continue;
      for (let l = 0; l < r.legs; l++) {
        if (c.matches.some(m => m.t === t.id && m.leg === l) || c.fixtures.some(f => f.t === t.id && f.leg === l)) continue;
        c.fixtures.push({ id: uid(), j: r.jids[l], a: l % 2 ? t.b : t.a, b: l % 2 ? t.a : t.b, t: t.id, leg: l, date: "" });
      }
    }
  }
  // Anota un combate jugado (da monedas y quita el partido pendiente correspondiente).
  // opts: { comp, t, leg, fx }  (t y leg si es de una eliminatoria; fx = id del partido pendiente)
  function recordMatch(a, b, w, jid, opts) {
    opts = opts || {}; const c = opts.comp || C(); jid = jid || c.cur;
    const cf = cfg(), pay = w === "d" ? { a: cf.draw, b: cf.draw } : w === "a" ? { a: cf.win, b: cf.loss } : { a: cf.loss, b: cf.win };
    const m = { id: uid(), ts: Date.now(), j: jid, a, b, w, c: pay };
    if (opts.t) { m.t = opts.t; m.leg = opts.leg || 0; }
    c.matches.push(m);
    c.fixtures = c.fixtures.filter(f => opts.fx ? f.id !== opts.fx : !(f.j === jid && !f.t && ((f.a === a && f.b === b) || (f.a === b && f.b === a))));
    const res = w === "d" ? "empate" : "ganó " + pName(w === "a" ? a : b);
    addCoins(a, pay.a, `${c.name}: combate vs ${pName(b)} (${res})`); addCoins(b, pay.b, `${c.name}: combate vs ${pName(a)} (${res})`);
    syncKO(c); save();
  }
  // Borra un combate (devuelve las monedas y vuelve a crear el partido pendiente de una eliminatoria).
  function deleteMatch(c, mid) {
    const m = c.matches.find(x => x.id === mid); if (!m) return;
    if (m.c) { addCoins(m.a, -m.c.a, `${c.name}: combate borrado`); addCoins(m.b, -m.c.b, `${c.name}: combate borrado`); }
    c.matches = c.matches.filter(x => x.id !== mid);
    if (c.ko) { for (const r of c.ko.rounds) for (const t of r.ties) if (t.id === m.t) delete t.manual; syncKO(c); }
    save();
  }
  const playFixture = (c, fid, w) => { const f = c.fixtures.find(x => x.id === fid); if (f) recordMatch(f.a, f.b, w, f.j, { comp: c, t: f.t, leg: f.leg, fx: f.id }); };
  // Elige quién pasa una eliminatoria empatada (penaltis, por ejemplo).
  function setTiebreak(c, tieId, winner) { for (const r of c.ko.rounds) for (const t of r.ties) if (t.id === tieId) t.manual = winner; syncKO(c); save(); }

  // ---------- Generadores de calendario ----------
  const hasPlayed = c => c.matches.length > 0;
  function genLeague(c, vueltas) {
    if (hasPlayed(c)) return "Ya hay combates anotados: cierra la temporada para generar un calendario nuevo.";
    const ids = c.partIds; if (ids.length < 2) return "Hacen falta al menos 2 entrenadores.";
    const rounds = LigaCal.schedule(ids, vueltas);
    c.jornadas = rounds.map((_, i) => ({ id: "j" + uid(), name: `Jornada ${i + 1}` })); c.fixtures = [];
    rounds.forEach((pairs, i) => pairs.forEach(([a, b]) => c.fixtures.push({ id: uid(), j: c.jornadas[i].id, a, b, date: "" })));
    c.vueltas = vueltas; c.cur = c.jornadas[0].id; c.ko = null; save(); return "";
  }
  function genChampLeague(c, n) {
    if (hasPlayed(c)) return "Ya hay combates anotados: cierra la temporada para generar la fase de liga de nuevo.";
    const ids = c.partIds; if (ids.length < 3) return "La Champions necesita al menos 3 entrenadores.";
    const rounds = LigaCal.schedule(ids, 1, n);
    c.jornadas = rounds.map((_, i) => ({ id: "j" + uid(), name: `Fase de liga · J${i + 1}` })); c.fixtures = [];
    rounds.forEach((pairs, i) => pairs.forEach(([a, b]) => c.fixtures.push({ id: uid(), j: c.jornadas[i].id, a, b, date: "" })));
    c.rounds = n; c.cur = c.jornadas[0].id; c.ko = null; c.phase = "liga"; save(); return "";
  }
  function genChampKO(c) {
    const order = standings("", c).map(r => r.id), ko = LigaCal.buildChampKO(order, { legs: c.legs === 1 ? 1 : 2, finalLegs: c.finalLegs });
    if (!ko) return "Hacen falta más entrenadores para las eliminatorias.";
    c.fixtures = c.fixtures.filter(f => f.t);   // se descartan los partidos de la fase de liga que quedaban sin jugar
    c.ko = ko; koJornadas(c, ko.rounds); c.phase = "ko"; c.cur = ko.rounds[0].jids[0]; syncKO(c); save(); return "";
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function genCup(c) {
    if (hasPlayed(c)) return "Ya hay combates anotados: cierra la edición para sortear un cuadro nuevo.";
    if (c.partIds.length < 2) return "Hacen falta al menos 2 entrenadores.";
    const seeds = c.seeding === "sorteo" ? shuffle(c.partIds) : c.partIds.slice();
    c.draw = seeds; c.jornadas = []; c.fixtures = [];
    c.ko = LigaCal.buildKO(seeds, { legs: c.legs, finalLegs: c.finalLegs }); koJornadas(c, c.ko.rounds);
    c.cur = c.jornadas[0].id; syncKO(c); save(); return "";
  }

  // ---------- Competiciones ----------
  function addComp(type, name) { const c = newComp(type, name, L.parts.map(p => p.id)); if (type === "champions") { c.legs = 2; c.finalLegs = 1; } L.comps.push(c); L.cc = c.id; save(); return c; }
  function delComp(id) { if (L.comps.length < 2) return false; L.comps = L.comps.filter(c => c.id !== id); if (L.cc === id) L.cc = L.comps[0].id; save(); return true; }
  function toggleMember(c, pid, on) { c.partIds = c.partIds.filter(x => x !== pid); if (on) c.partIds.push(pid); save(); }
  // Foto de la temporada para el historial: los equipos se guardan solo cuando cambian de una jornada a la siguiente.
  function snapTeams(c) {
    const out = {};
    partsOf(c).forEach(p => { const o = {}; let prev = ""; c.jornadas.forEach(j => { const t = teamOf(p, j.id), js = JSON.stringify(t); if (js !== prev) { o[j.id] = clone(t); prev = js; } }); out[p.id] = o; });
    return out;
  }
  function closeSeason(c) {
    const champId = c.ko ? LigaCal.champion(c.ko, c.matches) : null;
    c.history.push({ id: uid(), name: c.season.name, type: c.type, closedAt: Date.now(), jornadas: clone(c.jornadas), matches: clone(c.matches),
      standings: standings("", c), zones: clone(zonesOf(c)), ko: c.ko ? clone(c.ko) : null, champion: champId,
      parts: partsOf(c).map(p => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, img: p.img || "" })), teams: snapTeams(c) });
    const last = c.jornadas.find(j => j.id === c.cur) || c.jornadas[0], nj = { id: "j" + uid(), name: "Jornada 1" };
    partsOf(c).forEach(p => { const cur = teamOf(p, last.id); if (cur.length) setTeam(p, nj.id, cur); });
    c.jornadas = [nj]; c.cur = nj.id; c.matches = []; c.fixtures = []; c.ko = null; c.phase = "liga"; c.draw = null;
    c.season = { name: (c.type === "copa" ? "Edición " : "Temporada ") + (c.season.n + 1), n: c.season.n + 1 }; save();
  }
  function buy(kind, i, pid) {
    const p = L.parts.find(x => x.id === pid), set = (p ? ownTeam(p, C().cur) : [])[i], price = cfg().prices[kind], env = shopEnv();
    if (!set || bal(p.id) < price) return;
    const done = arg => {
      const t = LigaShop.apply(kind, set, env, arg);
      if (!t) { alert("No se pudo aplicar el cambio."); return; }
      addCoins(p.id, -price, `${X.nmSp(set.species)} · ${t}`); save(); refresh();
    };
    if (kind === "nat") return pickSheet("Elegir naturaleza", X.NATURES.map(n => ({ label: n.name, sub: n.plus ? `+${n.plus} −${n.minus}` : "neutra", n: n.name })), it => done({ nature: it.n }));
    if (kind === "mv") {
      const learn = X.learnable(X.Dex.species.get(set.species));
      const items = X.MOVES.map(m => {
        const inRom = !R.ready || R.res.move(m) >= 0, l = learn.has(m.id);
        return { label: X.nmMove(m), sub: `${l ? "lo aprende" : "no lo aprende"} · ${m.type}${inRom ? "" : " · no está en la ROM"}`, name: m.name, l, disabled: !inRom };
      }).sort((a, b) => (b.l - a.l) || a.label.localeCompare(b.label));
      return pickSheet("Elegir el ataque nuevo", items, it => {
        const slots = (set.moves || []).map((m, k) => ({ label: X.nmMove(m), sub: "se sustituye", slot: k }));
        if (slots.length < 4) slots.push({ label: "Hueco libre", sub: "se añade", slot: slots.length });
        pickSheet("¿A qué ataque sustituye?", slots, sl => done({ move: it.name, slot: sl.slot }));
      });
    }
    done();
  }


  // ---------- Pantalla «Editor ROM» ----------
  function romRow(p) {
    const sets = teamOf(p), slot = slotOf(p), warns = validate(p);
    const slotTxt = !R.ready ? "Abre la ROM para elegir su entrenador" : slot ? trainerLabel(slot) : "Elegir entrenador de la ROM";
    return `<div class="lg-p" data-id="${p.id}">
      <div class="lg-ph"><div class="pav" style="background:${p.color}">${p.img ? `<img class="lh-img" src="${p.img}" alt="">` : p.emoji}</div>
        <div class="lg-pm"><b class="lg-pn">${esc(p.name)}</b>
          <button class="lg-slot ${slot ? "ok" : ""}" data-act="slot" ${R.ready ? "" : "disabled"}>🎮 ${esc(slotTxt)}</button></div></div>
      ${sets.length ? `<div class="lg-team" data-icons="${p.id}"></div>` : `<div class="lg-none">Sin Pokémon en esta jornada (se eligen en la Liga)</div>`}
      ${warns.length ? `<details class="lg-warn"><summary>⚠ ${warns.length} aviso${warns.length === 1 ? "" : "s"} con esta ROM</summary><ul>${warns.map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
    </div>`;
  }
  function renderRom() {
    if (!root) return;
    const c = C(), j = jor(), ps = partsOf(c), canExport = R.ready && ps.length;
    const nAsg = R.ready ? ps.filter(p => slotOf(p) && teamOf(p).length).length : 0;
    root.innerHTML = `
    <div class="topbar"><button class="btn ghost" id="lgBack">← Inicio</button><h2>🎮 Editor ROM</h2><button class="btn ghost" id="lgGoLiga">🏟 Liga</button></div>
    <p class="lg-intro">Lleva a la ROM de 3DS los equipos de tu liga. Los combates se juegan en el juego: aquí eliges la ROM, asignas a cada entrenador de la liga uno del juego y descargas el mod.</p>

    <div class="panel lg-pan"><b>1 · ROM</b>
      <p class="lg-note">Rubí Omega / Zafiro Alfa o Ultra Sol / Ultra Luna, descifrada (.3ds). Se lee en tu móvil, no se sube a ningún sitio. Opcional: el mod en .zip.</p>
      <label class="lg-f"><span>ROM (.3ds / .cci)${R.romFile ? " · elegida: " + esc(R.romFile.name) : ""}</span><input type="file" id="lgRom" accept=".3ds,.cci,.cxi,application/octet-stream" ${R.busy ? "disabled" : ""}></label>
      <label class="lg-f"><span>Mod (.zip, opcional)${R.modFile ? " · elegido: " + esc(R.modFile.name) : ""}</span><input type="file" id="lgMod" accept=".zip,application/zip" ${R.busy ? "disabled" : ""}></label>
      <div class="lg-row"><button class="btn sm" id="lgOpen" ${R.romFile && !R.busy ? "" : "disabled"}>${R.busy || (R.ready ? "Volver a leer la ROM" : "Abrir ROM")}</button></div>
      ${R.err ? `<p class="lg-err" role="alert">${esc(R.err)}</p>` : ""}
      ${R.ready ? `<p class="lg-ok">✅ ${esc(R.cfg.title)}${R.modName ? " + mod" : ""} · ${R.data.trainers.length} entrenadores · ${R.titleId}</p>` : ""}
    </div>

    <div class="panel lg-pan"><b>2 · Jornada y entrenadores</b>
      ${ps.length ? `<div class="lg-row">${L.comps.length > 1 ? `<select id="lgC" aria-label="Competición">${L.comps.map(x => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${TYPES[x.type][0]} ${esc(x.name)}</option>`).join("")}</select>` : ""}<select id="lgJ" aria-label="Jornada">${c.jornadas.map(x => `<option value="${x.id}" ${x.id === c.cur ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        ${R.ready ? `<div class="lg-row"><button class="btn sm" id="lgBlock">📍 Asignar en bloque desde un entrenador</button><button class="btn sm ghost" id="lgSug">🎯 Sugerir líderes y jefes</button></div>
        <p class="lg-note">Para jugar los combates seguidos: busca en el juego un sitio con muchos entrenadores, elige al primero aquí y los demás toman los siguientes de la lista del juego (suelen estar cerca).</p>` : ""}
        <div>${ps.map(romRow).join("")}</div>`
      : `<p class="lg-note">«${esc(c.name)}» todavía no tiene entrenadores. Añádelos en la Liga (pestaña Entrenadores) y elige quién participa en la competición (Ajustes).</p><div class="lg-row"><button class="btn sm gold" id="lgGoLiga2">🏟 Ir a la Liga</button></div>`}
    </div>

    <div class="panel lg-pan"><b>3 · Llevar «${esc(j.name)}» a la ROM</b>
      <p class="lg-note">${R.ready ? `Se escribirán ${nAsg} de ${ps.length} entrenadores. Los demás entrenadores del juego no se tocan.` : "Abre la ROM en el paso 1 para poder exportar."}</p>
      <label class="lg-chk"><input type="checkbox" id="lgRen" ${L.rename !== false ? "checked" : ""}> Poner el nombre del entrenador de la liga al entrenador de la ROM (solo en español: el juego debe estar en español)</label>
      <div class="lg-row"><button class="btn gold" id="lgExp" ${canExport ? "" : "disabled"}>📦 Descargar mod de «${esc(j.name)}» (.zip)</button>
        ${canExport && window.showDirectoryPicker ? `<button class="btn" id="lgDir">📁 Guardar en una carpeta</button>` : ""}</div>
      ${reportHtml()}
      <details class="lg-steps"><summary>Cómo instalarlo</summary>
        <p><b>Azahar / Citra:</b> descomprime el .zip y copia la carpeta <code>${esc(R.titleId || "ID del juego")}</code> dentro de <code>load/mods/</code>, aceptando reemplazar. Si usas un mod aparte, cópiala encima de su carpeta.</p>
        <p><b>3DS con Luma:</b> copia esa carpeta en <code>luma/titles/</code> de la SD y activa «Enable game patching» (mantén SELECT al encender).</p>
        <p>Cada jornada: elige los Pokémon, exporta de nuevo y sustituye la carpeta. Los cambios se aplican a los combates que empiecen después.</p></details>
      ${R.ready && R.cfg.gen === 6 ? `<p class="lg-note">En Rubí Omega / Zafiro Alfa la ROM no guarda naturaleza ni EVs de los entrenadores (solo nivel, objeto, habilidad, ataques, sexo y una «fuerza» general). Ultra Sol / Luna sí lo guarda todo.</p>` : ""}
    </div>

    ${R.ready ? `<details class="panel lg-pan"><summary><b>Explorador de archivos de la ROM</b> (para pedir ayuda)</summary>
      <p class="lg-note">Descarga la lista de archivos de tu ROM (y del mod), o un archivo concreto por su ruta, por ejemplo <code>a/0/1/2</code>.</p>
      <div class="lg-row"><button class="btn sm" id="lgList">Descargar lista.txt</button></div>
      <div class="lg-row"><input id="lgPath" placeholder="Ruta del archivo, p. ej. a/0/1/2"><button class="btn sm" id="lgGet">Descargar archivo</button></div></details>` : ""}`;
    paintIcons(root);
  }
  // Iconos de Pokémon: [data-icons=id] (equipo de un entrenador), [data-sp=Especie] y [data-spl=Esp1,Esp2]
  function paintIcons(r, size) {
    r.querySelectorAll("[data-icons]").forEach(el => {
      const p = L.parts.find(x => x.id === el.dataset.icons);
      if (p) teamOf(p).slice(0, 6).forEach(s => { const sp = X.Dex.species.get(s.species); if (sp.exists) el.append(X.iconEl(sp, size || 44)); });
    });
    r.querySelectorAll("[data-sp]").forEach(el => { const sp = X.Dex.species.get(el.dataset.sp); if (sp.exists) el.append(X.iconEl(sp, +el.dataset.size || 64)); });
    r.querySelectorAll("[data-spl]").forEach(el => el.dataset.spl.split(",").filter(Boolean).forEach(n => { const sp = X.Dex.species.get(n); if (sp.exists) el.append(X.iconEl(sp, 36)); }));
  }
  function reportHtml() {
    if (!report) return "";
    if (report.err) return `<p class="lg-err" role="alert">${esc(report.err)}</p>`;
    const head = !report.n ? `<p class="lg-err">No hay nada que exportar: ${report.warns.length ? "revisa los avisos." : ""}</p>`
      : `<p class="lg-ok">✅ ${report.done === "folder" ? "Guardado en la carpeta" : report.done === "zip" ? "Descargado" : "Listo"}: ${report.n} entrenador${report.n === 1 ? "" : "es"} de «${esc(report.jornada)}» (${report.names.map(esc).join(", ")}).</p>`;
    return head + (report.warns.length ? `<details class="lg-warn" open><summary>⚠ ${report.warns.length} aviso${report.warns.length === 1 ? "" : "s"}</summary><ul>${report.warns.map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>` : "");
  }

  // ---------- Eventos del Editor ROM ----------
  function editTeam(p, jid) {
    jid = jid || C().cur;
    const c = compOfJ(jid), jn = (c.jornadas.find(j => j.id === jid) || {}).name;
    X.editTeam(`${p.name} · ${c.name} · ${jn}`, teamOf(p, jid), sets => { setTeam(p, jid, sets); save(); }, () => { X.show("liga"); });
  }
  function onClick(e) {
    const t = e.target, id = t.id, act = t.closest("[data-act]"), card = t.closest(".lg-p");
    if (card && act && act.dataset.act === "slot") { const p = L.parts.find(x => x.id === card.dataset.id); if (p) pickSlot(p); return; }
    if (id === "lgBack") return X.show("title");
    if (id === "lgGoLiga" || id === "lgGoLiga2") return X.show("liga");
    if (id === "lgList") return download(new Blob([listText()], { type: "text/plain" }), "lista-" + R.titleId + ".txt");
    if (id === "lgGet") { const v = root.querySelector("#lgPath").value; if (v.trim()) getFile(v); return; }
    if (id === "lgOpen") return openRom();
    if (id === "lgSug") return suggestSlots();
    if (id === "lgBlock") return pickBlock();
    if (id === "lgExp") return doExport(false);
    if (id === "lgDir") return doExport(true);
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "lgC") { L.cc = t.value; report = null; save(); return refresh(); }
    if (t.id === "lgJ") { C().cur = t.value; report = null; save(); return refresh(); }
    if (t.id === "lgRen") { L.rename = t.checked; save(); return; }
    if (t.id === "lgRom") { R.romFile = t.files[0] || null; R.ready = false; R.err = ""; return renderRom(); }
    if (t.id === "lgMod") { R.modFile = t.files[0] || null; R.ready = false; R.err = ""; return renderRom(); }
  }

  // ---------- API para la pantalla Liga ----------
  const api = {
    X: () => X, L: () => L, C, TYPES, compOfJ, partsOf, inComp, setTeam, ownTeam, clone,
    setL: v => { L = migrate(v); L.comps.forEach(fixComp); if (!L.comps.some(c => c.id === L.cc)) L.cc = L.comps[0].id; save(); },
    save, jor, teamOf, standings, matches, headToHead, allResults, zonesOf, pName, uid, esc, norm, cfg, bal, addCoins,
    recordMatch, deleteMatch, playFixture, setTiebreak, syncKO, genLeague, genChampLeague, genChampKO, genCup, addComp, delComp, toggleMember, closeSeason, newComp,
    buy, pickSheet, editTeam, refresh, paintIcons, R: () => R, slotOf, trainerLabel, EMOJIS, COLORS
  };
  function init(ctx) {
    X = ctx; LigaMap.useCore(Core);
    root = document.getElementById("romRoot");
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    load();
    if (typeof LigaHub !== "undefined") hub = LigaHub.init(api);
  }
  return { init, renderRom: () => { load(); renderRom(); }, renderHub: () => { load(); if (hub) hub.render(); }, _state: () => ({ L, R }) };
})();
