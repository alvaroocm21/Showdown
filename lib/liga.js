// Liga ROM: junta entrenadores, elige los Pokémon de cada jornada y los lleva a la ROM de 3DS (ORAS / USUM).
// Los combates se juegan en la ROM; aquí solo se preparan los equipos.
const Liga = (() => {
  const KEY = "liga.v1";
  const EMOJIS = ["🧑", "👩", "🧔", "👧", "👦", "🧙", "🦸", "🥷", "🧛", "🤠", "👑", "🎩"];
  const COLORS = ["#2f7bff", "#e8590c", "#2fa84f", "#a040a0", "#d4a600", "#e84a8a", "#2ab7c9", "#6b7a90"];
  const BOSS = /lider|alto mando|campe|magma|aqua|leader|elite|champion|rival|admin|jefe|frente|cerebro|kahuna|capitan|skull|aether|presidenta|ultraguardia|lusamine|guzman|maestro|cima/;
  let X, L, root;
  // Estado de la ROM abierta (nunca se guarda: el archivo se vuelve a elegir cada vez)
  const R = { romFile: null, modFile: null, busy: "", err: "", ready: false, cfg: null, data: null, texts: [], t: null, byId: {}, res: null, titleId: "", modName: "" };
  let newEmo = EMOJIS[0], newCol = COLORS[0], report = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const fresh = () => ({ jornadas: [{ id: "j1", name: "Jornada 1" }], cur: "j1", parts: [] });
  function load() {
    L = X.store.get(KEY, null);
    if (!L || !Array.isArray(L.parts) || !Array.isArray(L.jornadas) || !L.jornadas.length) L = fresh();
    if (!L.jornadas.some(j => j.id === L.cur)) L.cur = L.jornadas[0].id;
  }
  const save = () => X.store.set(KEY, L);
  const jor = () => L.jornadas.find(j => j.id === L.cur);
  const teamOf = p => (p.teams && p.teams[L.cur]) || [];
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = s => X.esc(s);

  // ---------- ROM ----------
  const trainerLabel = id => {
    const t = R.t; if (!t) return "#" + id;
    const n = t.trainers[id] || "", c = t.classes[R.byId[id] ? R.byId[id].cls : -1] || "";
    return (c && n ? c + " " + n : n || c || "Entrenador") + " (#" + id + ")";
  };
  async function openRom() {
    if (!R.romFile) return;
    R.err = ""; R.ready = false; R.busy = "Leyendo la cabecera de la ROM…"; render();
    try {
      const base = await Core.openRom(Core.fileReader(R.romFile));
      let mod = null;
      if (R.modFile) { R.busy = "Leyendo el mod…"; render(); mod = await Core.openModZip(Core.fileReader(R.modFile)); }
      const rom = Core.overlay(base, mod);
      const cfg = await Core.detectGame(rom);
      R.busy = "Leyendo textos del juego…"; render();
      // Idioma de pantalla: español si lo hay; para casar nombres se usan además los de inglés.
      const texts = [];
      const ls = [];
      for (const l of [6, 2, 3, 4, 5, 1, 0, 7, 8, 9]) { const t = await Core.loadText(rom, cfg, l); if (t) { texts.push(t); ls.push(l); } if (texts.length >= 2 && l >= 2) break; }
      R.lang = ls[0];
      if (!texts.length) throw new Core.RomError("text", "No encuentro los textos del juego en la ROM.");
      R.busy = "Leyendo entrenadores y Pokémon…"; render();
      const data = await Core.loadGame(rom, cfg);
      const byId = {}; data.trainers.forEach(t => byId[t.id] = t);
      Object.assign(R, { base, mod, rom, cfg, data, texts, t: texts[0], byId, titleId: base.titleId, modName: R.modFile ? R.modFile.name : "", ready: true, busy: "",
        res: LigaMap.makeResolver({ Dex: X.Dex, texts, names: X.NAMES, data, gen: cfg.gen }) });
      report = null;
    } catch (e) {
      R.busy = ""; R.err = e && e.message ? e.message : "No se pudo leer el archivo.";
    }
    render();
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
    for (const p of L.parts) {
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
      if (!b.trainers.length) { render(); return; }
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
    render();
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
    pickSheet(`Entrenador de la ROM para ${p.name}`, slotItems(used), it => { (p.slots = p.slots || {})[R.titleId] = it.id; save(); render(); });
  }
  // Los entrenadores consecutivos del juego suelen estar en el mismo sitio: se asignan los siguientes al elegido.
  function pickBlock() {
    if (!R.ready) return;
    const todo = L.parts.filter(p => !slotOf(p));
    if (!todo.length) { alert("Todos los entrenadores de la liga ya tienen asignado uno de la ROM."); return; }
    const used = {}; L.parts.forEach(o => { const s = slotOf(o); if (s) used[s] = o.name; });
    const items = slotItems(used).sort((a, b) => a.id - b.id);
    pickSheet(`Primer entrenador del bloque (${todo.length} por asignar)`, items, it => {
      const taken = new Set(Object.keys(used).map(Number));
      const ids = R.data.trainers.filter(t => t.id >= it.id && t.team.length && !taken.has(t.id)).map(t => t.id);
      todo.forEach(p => { if (ids.length) (p.slots = p.slots || {})[R.titleId] = ids.shift(); });
      save(); render();
    });
  }
  function suggestSlots() {
    if (!R.ready) return;
    const used = new Set(L.parts.map(slotOf).filter(Boolean));
    const free = R.data.trainers.filter(t => !used.has(t.id) && t.team.length && BOSS.test(norm(trainerLabel(t.id)))).map(t => t.id);
    const pool = free.length >= L.parts.length ? free : R.data.trainers.filter(t => !used.has(t.id) && t.team.length).map(t => t.id);
    for (const p of L.parts) if (!slotOf(p) && pool.length) (p.slots = p.slots || {})[R.titleId] = pool.shift();
    save(); render();
  }

  // ---------- Resultados e histórico ----------
  const pName = id => (L.parts.find(p => p.id === id) || { name: "(borrado)" }).name;
  const matches = () => L.matches || (L.matches = []);
  function standings(jid) {
    const t = {}; L.parts.forEach(p => t[p.id] = { id: p.id, name: p.name, pj: 0, v: 0, e: 0, d: 0, pts: 0 });
    for (const m of matches()) {
      if (jid && m.j !== jid) continue;
      const a = t[m.a], b = t[m.b]; if (!a || !b) continue;
      a.pj++; b.pj++;
      if (m.w === "d") { a.e++; b.e++; a.pts++; b.pts++; } else if (m.w === "a") { a.v++; b.d++; a.pts += 3; } else { b.v++; a.d++; b.pts += 3; }
    }
    return Object.values(t).sort((x, y) => y.pts - x.pts || (y.v - x.v) || x.d - y.d || x.name.localeCompare(y.name));
  }
  function headToHead() {
    const r = {};
    for (const m of matches()) {
      if (!L.parts.some(p => p.id === m.a) || !L.parts.some(p => p.id === m.b)) continue;
      const [x, y] = m.a < m.b ? [m.a, m.b] : [m.b, m.a], k = x + "|" + y;
      const o = r[k] || (r[k] = { x, y, vx: 0, vy: 0, e: 0 });
      if (m.w === "d") o.e++; else if ((m.w === "a") === (m.a === x)) o.vx++; else o.vy++;
    }
    return Object.values(r);
  }
  function resultsPanel() {
    const j = jor(), cur = matches().filter(m => m.j === L.cur), opt = (sel) => L.parts.map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    if (L.parts.length < 2) return `<div class="panel lg-pan"><b>5 · Resultados e histórico</b><p class="lg-note">Añade al menos dos entrenadores para registrar combates.</p></div>`;
    const sc = L.view === "j" ? L.cur : "";
    const st = standings(sc), h = headToHead();
    return `<div class="panel lg-pan"><b>5 · Resultados e histórico</b>
      <p class="lg-note">Los combates se juegan en la ROM: al terminar, anota aquí quién ganó.</p>
      <div class="lg-row"><select id="lgMA" aria-label="Entrenador A">${opt(L.parts[0].id)}</select><span>vs</span><select id="lgMB" aria-label="Entrenador B">${opt(L.parts[1].id)}</select></div>
      <div class="lg-row"><select id="lgMR" aria-label="Resultado"><option value="a">Gana el primero</option><option value="b">Gana el segundo</option><option value="d">Empate</option></select><button class="btn sm gold" id="lgMAdd">Anotar en «${esc(j.name)}»</button></div>
      <div class="lg-mlist">${cur.length ? cur.map(m => `<div class="lg-m"><span>${m.w === "b" ? "" : "🏆 "}<b>${esc(pName(m.a))}</b> vs ${m.w === "a" ? "" : "🏆 "}<b>${esc(pName(m.b))}</b>${m.w === "d" ? " · empate" : ""}</span><button class="lg-x" data-mid="${m.id}" aria-label="Borrar combate">×</button></div>`).join("") : `<p class="lg-none">Sin combates anotados en esta jornada.</p>`}</div>
      <div class="lg-row"><b style="font-size:14px">Clasificación</b><select id="lgView" aria-label="Alcance"><option value="all" ${sc ? "" : "selected"}>Todas las jornadas</option><option value="j" ${sc ? "selected" : ""}>Solo «${esc(j.name)}»</option></select></div>
      <div class="lg-tw"><table class="lg-t"><thead><tr><th>#</th><th>Entrenador</th><th>PJ</th><th>V</th><th>E</th><th>D</th><th>Pts</th></tr></thead><tbody>${st.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.pj}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td><b>${r.pts}</b></td></tr>`).join("")}</tbody></table></div>
      <p class="lg-note">Victoria 3 puntos, empate 1.</p>
      ${h.length ? `<b style="font-size:14px">Cara a cara</b><div class="lg-mlist">${h.map(o => `<div class="lg-m"><span><b>${esc(pName(o.x))}</b> ${o.vx} – ${o.vy} <b>${esc(pName(o.y))}</b>${o.e ? ` (${o.e} empate${o.e === 1 ? "" : "s"})` : ""}</span></div>`).join("")}</div>` : ""}
    </div>`;
  }

  // ---------- Monedas y tienda ----------
  let shopP = null;
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
  function shopPanel() {
    if (!L.parts.length) return `<div class="panel lg-pan"><b>6 · Monedas y tienda</b><p class="lg-note">Añade entrenadores para darles monedas.</p></div>`;
    const p = L.parts.find(x => x.id === shopP) || L.parts[0], c = cfg(), env = shopEnv(), sets = teamOf(p);
    const mons = sets.map((m, i) => `<div class="lg-sm"><div class="lg-smh"><b>${esc(X.nmSp(m.species))}</b><small>${esc(X.nmAb(m.ability))} · ${esc(m.nature || "—")} · ${m.item ? esc(X.nmItem(m.item)) : "sin objeto"}</small>
        <small>${(m.moves || []).map(v => esc(X.nmMove(v))).join(" / ") || "sin ataques"}</small></div>
        <div class="lg-btns">${["ab", "natR", "nat", "mvR", "mv", "itR", "iv"].map(k => {
          const price = c.prices[k], why = LigaShop.why(k, m, env), dis = bal(p.id) < price || why;
          return `<button class="btn sm ${dis ? "ghost" : ""}" data-shop="${k}" data-i="${i}" ${dis ? "disabled" : ""} title="${esc(why)}">${esc(LigaShop.LABELS[k])} · 🪙${price}</button>`;
        }).join("")}</div></div>`).join("");
    const log = (L.log || []).filter(x => x.p === p.id).slice(0, 12);
    const lab = { win: "Victoria", draw: "Empate", loss: "Derrota" }, pl = LigaShop.LABELS;
    return `<div class="panel lg-pan"><b>6 · Monedas y tienda</b>
      <p class="lg-note">Cada combate anotado da monedas. Con ellas se retocan los Pokémon de la jornada actual; los cambios pasan a las jornadas nuevas que copien el equipo.</p>
      <div class="lg-row"><select id="lgSP" aria-label="Entrenador">${L.parts.map(q => `<option value="${q.id}" ${q.id === p.id ? "selected" : ""}>${esc(q.name)} · 🪙${bal(q.id)}</option>`).join("")}</select></div>
      <div class="lg-row"><input id="lgCoinN" type="number" inputmode="numeric" min="1" value="50" aria-label="Cantidad"><button class="btn sm" id="lgCoinGive">Dar monedas</button><button class="btn sm ghost" id="lgCoinTake">Quitar</button></div>
      ${mons || `<p class="lg-none">Este entrenador no tiene Pokémon en «${esc(jor().name)}».</p>`}
      ${log.length ? `<details><summary>Últimos movimientos de ${esc(p.name)}</summary><ul class="lg-log">${log.map(x => `<li><b>${x.d > 0 ? "+" : ""}${x.d}</b> ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}
      <details><summary>Premios y precios</summary>
        <div class="lg-cfg">${["win", "draw", "loss"].map(k => `<label>${lab[k]}<input type="number" inputmode="numeric" min="0" data-cfg="${k}" value="${c[k]}"></label>`).join("")}
        ${Object.keys(c.prices).map(k => `<label>${esc(pl[k])}<input type="number" inputmode="numeric" min="0" data-cfg="p.${k}" value="${c.prices[k]}"></label>`).join("")}</div></details>
    </div>`;
  }
  function buy(kind, i) {
    const p = L.parts.find(x => x.id === (shopP || L.parts[0].id)), set = teamOf(p)[i], price = cfg().prices[kind], env = shopEnv();
    if (!set || bal(p.id) < price) return;
    const done = arg => {
      const t = LigaShop.apply(kind, set, env, arg);
      if (!t) { alert("No se pudo aplicar el cambio."); return; }
      addCoins(p.id, -price, `${X.nmSp(set.species)} · ${t}`); save(); render();
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

  // ---------- Pantalla ----------
  function chipsFor(p) {
    const sets = teamOf(p);
    return sets.length ? `<div class="lg-team" data-icons="${p.id}"></div>` : `<div class="lg-none">Sin Pokémon en esta jornada</div>`;
  }
  function card(p) {
    const sets = teamOf(p), slot = slotOf(p), warns = validate(p);
    const slotTxt = !R.ready ? "Abre la ROM para elegir su entrenador" : slot ? trainerLabel(slot) : "Elegir entrenador de la ROM";
    return `<div class="lg-p" data-id="${p.id}">
      <div class="lg-ph"><div class="pav" style="background:${p.color}">${p.emoji}</div>
        <div class="lg-pm"><input class="lg-name" value="${esc(p.name)}" maxlength="16" aria-label="Nombre" data-act="rename">
          <button class="lg-slot ${slot ? "ok" : ""}" data-act="slot" ${R.ready ? "" : "disabled"}>🎮 ${esc(slotTxt)}</button><small class="lg-coin">🪙 ${bal(p.id)} monedas</small></div>
        <button class="lg-x" data-act="del" title="Quitar entrenador" aria-label="Quitar a ${esc(p.name)}">×</button></div>
      ${chipsFor(p)}
      <div class="lg-btns"><button class="btn sm gold" data-act="team">✏ ${sets.length ? "Editar equipo" : "Elegir Pokémon"} (${sets.length}/6)</button>
        <button class="btn sm ghost" data-act="prev">↩ Copiar jornada anterior</button>
        <button class="btn sm ghost" data-act="prof">👤 Traer de un jugador</button></div>
      ${warns.length ? `<details class="lg-warn"><summary>⚠ ${warns.length} aviso${warns.length === 1 ? "" : "s"} con esta ROM</summary><ul>${warns.map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
    </div>`;
  }
  function render() {
    if (!root) return;
    const j = jor(), canExport = R.ready && L.parts.length;
    const nAsg = R.ready ? L.parts.filter(p => slotOf(p) && teamOf(p).length).length : 0;
    root.innerHTML = `
    <div class="topbar"><button class="btn ghost" id="lgBack">← Inicio</button><h2>🏟 Liga ROM</h2></div>
    <p class="lg-intro">Prepara los equipos de cada jornada. Los combates se juegan en la ROM: aquí eliges a los entrenadores y sus Pokémon, y se exportan listos para que el juego los use.</p>

    <div class="panel lg-pan"><b>1 · Jornada</b>
      <div class="lg-row">
        <select id="lgJ" aria-label="Jornada">${L.jornadas.map(x => `<option value="${x.id}" ${x.id === L.cur ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <input id="lgJn" value="${esc(j.name)}" maxlength="24" aria-label="Nombre de la jornada">
      </div>
      <div class="lg-row"><button class="btn sm" id="lgJnew">+ Nueva jornada (copia los equipos)</button>
        ${L.jornadas.length > 1 ? `<button class="btn sm ghost" id="lgJdel">Borrar esta jornada</button>` : ""}</div>
    </div>

    <div class="panel lg-pan"><b>2 · Entrenadores y sus Pokémon</b>
      <div id="lgParts">${L.parts.length ? L.parts.map(card).join("") : `<p class="lg-none">Aún no hay entrenadores. Añade el primero abajo.</p>`}</div>
      <div class="lg-add"><input id="lgNew" maxlength="16" placeholder="Nombre del nuevo entrenador">
        <div class="emo" id="lgEmo">${EMOJIS.map(e => `<span data-e="${e}" class="${e === newEmo ? "on" : ""}">${e}</span>`).join("")}</div>
        <div class="emo col" id="lgCol">${COLORS.map(c => `<span data-c="${c}" style="background:${c}" class="${c === newCol ? "on" : ""}"></span>`).join("")}</div>
        <button class="btn gold sm" id="lgAdd">+ Añadir entrenador</button></div>
    </div>

    <div class="panel lg-pan"><b>3 · ROM</b>
      <p class="lg-note">Rubí Omega / Zafiro Alfa o Ultra Sol / Ultra Luna, descifrada (.3ds). Se lee en tu móvil, no se sube a ningún sitio. Opcional: el mod en .zip.</p>
      <label class="lg-f"><span>ROM (.3ds / .cci)${R.romFile ? " · elegida: " + esc(R.romFile.name) : ""}</span><input type="file" id="lgRom" accept=".3ds,.cci,.cxi,application/octet-stream" ${R.busy ? "disabled" : ""}></label>
      <label class="lg-f"><span>Mod (.zip, opcional)${R.modFile ? " · elegido: " + esc(R.modFile.name) : ""}</span><input type="file" id="lgMod" accept=".zip,application/zip" ${R.busy ? "disabled" : ""}></label>
      <div class="lg-row"><button class="btn sm" id="lgOpen" ${R.romFile && !R.busy ? "" : "disabled"}>${R.busy || (R.ready ? "Volver a leer la ROM" : "Abrir ROM")}</button></div>
      ${R.err ? `<p class="lg-err" role="alert">${esc(R.err)}</p>` : ""}
      ${R.ready ? `<p class="lg-ok">✅ ${esc(R.cfg.title)}${R.modName ? " + mod" : ""} · ${R.data.trainers.length} entrenadores · ${R.titleId}</p>
        <div class="lg-row"><button class="btn sm" id="lgBlock">📍 Asignar en bloque desde un entrenador</button><button class="btn sm ghost" id="lgSug">🎯 Sugerir líderes y jefes</button></div>
        <p class="lg-note">Para jugar los combates seguidos: busca en el juego un sitio con muchos entrenadores, elige al primero aquí y los demás participantes toman los siguientes de la lista del juego (suelen estar cerca unos de otros).</p>` : ""}
    </div>

    ${R.ready ? `<details class="panel lg-pan"><summary><b>Explorador de archivos de la ROM</b> (para pedir ayuda)</summary>
      <p class="lg-note">Descarga la lista de archivos de tu ROM (y del mod), o un archivo concreto por su ruta, por ejemplo <code>a/0/1/2</code>.</p>
      <div class="lg-row"><button class="btn sm" id="lgList">Descargar lista.txt</button></div>
      <div class="lg-row"><input id="lgPath" placeholder="Ruta del archivo, p. ej. a/0/1/2"><button class="btn sm" id="lgGet">Descargar archivo</button></div></details>` : ""}

    <div class="panel lg-pan"><b>4 · Llevar la jornada a la ROM</b>
      <p class="lg-note">${R.ready ? `Se escribirán ${nAsg} de ${L.parts.length} entrenadores de «${esc(j.name)}». Los demás entrenadores del juego no se tocan.` : "Abre la ROM en el paso 3 para poder exportar."}</p>
      <label class="lg-chk"><input type="checkbox" id="lgRen" ${L.rename !== false ? "checked" : ""}> Poner el nombre del entrenador de la liga al entrenador de la ROM (solo en español: el juego debe estar en español)</label>
      <div class="lg-row"><button class="btn gold" id="lgExp" ${canExport ? "" : "disabled"}>📦 Descargar mod de «${esc(j.name)}» (.zip)</button>
        ${canExport && window.showDirectoryPicker ? `<button class="btn" id="lgDir">📁 Guardar en una carpeta</button>` : ""}</div>
      ${reportHtml()}
      <details class="lg-steps"><summary>Cómo instalarlo</summary>
        <p><b>Azahar (Android / PC):</b> descomprime el .zip y copia la carpeta <code>${esc(R.titleId || "ID del juego")}</code> dentro de <code>load/mods/</code>, aceptando reemplazar. Si usas un mod aparte, cópiala encima de su carpeta.</p>
        <p><b>3DS con Luma:</b> copia esa carpeta en <code>luma/titles/</code> de la SD y activa «Enable game patching» (mantén SELECT al encender).</p>
        <p>Cada jornada: elige los Pokémon, exporta de nuevo y sustituye la carpeta. Los cambios se aplican a los combates que empiecen después.</p></details>
      ${R.ready && R.cfg.gen === 6 ? `<p class="lg-note">En Rubí Omega / Zafiro Alfa la ROM no guarda naturaleza ni EVs de los entrenadores (solo nivel, objeto, habilidad, ataques, sexo y una «fuerza» general). Ultra Sol / Luna sí lo guarda todo.</p>` : ""}
    </div>

    ${resultsPanel()}

    ${shopPanel()}

    <details class="panel lg-pan"><summary><b>Copia de seguridad</b></summary>
      <textarea id="lgBk" spellcheck="false" placeholder="Aquí aparece la copia de la liga para guardarla o pasarla a otro dispositivo"></textarea>
      <div class="lg-row"><button class="btn sm" id="lgBkOut">Generar copia</button><button class="btn sm ghost" id="lgBkIn">Restaurar desde el texto</button></div>
    </details>`;
    // Iconos de los Pokémon
    root.querySelectorAll("[data-icons]").forEach(el => {
      const p = L.parts.find(x => x.id === el.dataset.icons);
      teamOf(p).slice(0, 6).forEach(s => { const sp = X.Dex.species.get(s.species); if (sp.exists) el.append(X.iconEl(sp, 44)); });
    });
  }
  function reportHtml() {
    if (!report) return "";
    if (report.err) return `<p class="lg-err" role="alert">${esc(report.err)}</p>`;
    const head = !report.n ? `<p class="lg-err">No hay nada que exportar: ${report.warns.length ? "revisa los avisos." : ""}</p>`
      : `<p class="lg-ok">✅ ${report.done === "folder" ? "Guardado en la carpeta" : report.done === "zip" ? "Descargado" : "Listo"}: ${report.n} entrenador${report.n === 1 ? "" : "es"} de «${esc(report.jornada)}» (${report.names.map(esc).join(", ")}).</p>`;
    return head + (report.warns.length ? `<details class="lg-warn" open><summary>⚠ ${report.warns.length} aviso${report.warns.length === 1 ? "" : "s"}</summary><ul>${report.warns.map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>` : "");
  }

  // ---------- Eventos ----------
  function editTeam(p) {
    const jid = L.cur;
    X.editTeam(`${p.name} · ${jor().name}`, teamOf(p), sets => { (p.teams = p.teams || {})[jid] = sets.map(s => JSON.parse(JSON.stringify(s))); save(); }, () => { X.show("liga"); });
  }
  function onClick(e) {
    const t = e.target, id = t.id;
    const card = t.closest(".lg-p"), act = t.closest("[data-act]");
    if (t.dataset && t.dataset.mid) {
      const m = matches().find(x => x.id === t.dataset.mid);
      if (m && m.c) { addCoins(m.a, -m.c.a, "Combate borrado"); addCoins(m.b, -m.c.b, "Combate borrado"); }
      L.matches = matches().filter(x => x.id !== t.dataset.mid); save(); return render();
    }
    if (t.dataset && t.dataset.shop) return buy(t.dataset.shop, +t.dataset.i);
    if (id === "lgCoinGive" || id === "lgCoinTake") {
      const n = Math.floor(+root.querySelector("#lgCoinN").value); if (!(n > 0)) return;
      const pid = (L.parts.find(x => x.id === shopP) || L.parts[0]).id;
      addCoins(pid, id === "lgCoinGive" ? n : -n, "Ajuste manual"); save(); return render();
    }
    if (id === "lgMAdd") {
      const a = root.querySelector("#lgMA").value, b = root.querySelector("#lgMB").value;
      if (a === b) { alert("Elige dos entrenadores distintos."); return; }
      const w = root.querySelector("#lgMR").value, c = cfg(), pay = w === "d" ? { a: c.draw, b: c.draw } : w === "a" ? { a: c.win, b: c.loss } : { a: c.loss, b: c.win };
      matches().push({ id: uid(), j: L.cur, a, b, w, c: pay });
      const res = w === "d" ? "empate" : "ganó " + pName(w === "a" ? a : b);
      addCoins(a, pay.a, `Combate vs ${pName(b)} (${res})`); addCoins(b, pay.b, `Combate vs ${pName(a)} (${res})`);
      save(); return render();
    }
    if (card && act) {
      const p = L.parts.find(x => x.id === card.dataset.id), a = act.dataset.act;
      if (!p) return;
      if (a === "team") return editTeam(p);
      if (a === "slot") return pickSlot(p);
      if (a === "del") { if (confirm(`¿Quitar a «${p.name}» y todos sus equipos de la liga?`)) { L.parts = L.parts.filter(x => x !== p); L.matches = matches().filter(m => m.a !== p.id && m.b !== p.id); if (L.coins) delete L.coins[p.id]; save(); render(); } return; }
      if (a === "prev") {
        const k = L.jornadas.findIndex(x => x.id === L.cur), prev = k > 0 ? (p.teams || {})[L.jornadas[k - 1].id] : null;
        if (!prev || !prev.length) { alert("No hay equipo en la jornada anterior."); return; }
        (p.teams = p.teams || {})[L.cur] = JSON.parse(JSON.stringify(prev)); save(); return render();
      }
      if (a === "prof") {
        const profs = X.profileTeams().filter(q => q.team.length);
        if (!profs.length) { alert("Ningún jugador tiene equipo guardado todavía (se crea en «Elegir equipo»)."); return; }
        return pickSheet("Traer el equipo de un jugador", profs.map(q => ({ id: q.id, label: `${q.emoji} ${q.name}`, sub: q.team.map(s => X.nmSp(s.species)).join(", ") })), it => {
          const q = profs.find(z => z.id === it.id); (p.teams = p.teams || {})[L.cur] = JSON.parse(JSON.stringify(q.team.slice(0, 6))); save(); render();
        });
      }
      return;
    }
    const em = t.closest("#lgEmo span"); if (em) { newEmo = em.dataset.e; const n = root.querySelector("#lgNew").value; render(); root.querySelector("#lgNew").value = n; return; }
    const co = t.closest("#lgCol span"); if (co) { newCol = co.dataset.c; const n = root.querySelector("#lgNew").value; render(); root.querySelector("#lgNew").value = n; return; }
    if (id === "lgAdd") {
      const inp = root.querySelector("#lgNew"), name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      L.parts.push({ id: uid(), name, emoji: newEmo, color: newCol, teams: {}, slots: {} }); save(); return render();
    }
    if (id === "lgJnew") {
      const n = L.jornadas.length + 1, nj = { id: "j" + uid(), name: "Jornada " + n };
      L.parts.forEach(p => { const cur = teamOf(p); if (cur.length) (p.teams = p.teams || {})[nj.id] = JSON.parse(JSON.stringify(cur)); });
      L.jornadas.push(nj); L.cur = nj.id; report = null; save(); return render();
    }
    if (id === "lgJdel") {
      if (!confirm(`¿Borrar «${jor().name}» y los equipos de esa jornada?`)) return;
      const gone = L.cur; L.matches = matches().filter(m => m.j !== gone); L.jornadas = L.jornadas.filter(x => x.id !== gone); L.parts.forEach(p => { if (p.teams) delete p.teams[gone]; });
      L.cur = L.jornadas[0].id; report = null; save(); return render();
    }
    if (id === "lgList") return download(new Blob([listText()], { type: "text/plain" }), "lista-" + R.titleId + ".txt");
    if (id === "lgGet") { const v = root.querySelector("#lgPath").value; if (v.trim()) getFile(v); return; }
    if (id === "lgBack") return X.show("title");
    if (id === "lgOpen") return openRom();
    if (id === "lgSug") return suggestSlots();
    if (id === "lgBlock") return pickBlock();
    if (id === "lgExp") return doExport(false);
    if (id === "lgDir") return doExport(true);
    if (id === "lgBkOut") { root.querySelector("#lgBk").value = JSON.stringify(L); return; }
    if (id === "lgBkIn") {
      try {
        const d = JSON.parse(root.querySelector("#lgBk").value);
        if (!d || !Array.isArray(d.parts) || !Array.isArray(d.jornadas) || !d.jornadas.length) throw 0;
        if (!confirm("Esto sustituye la liga actual por la de la copia. ¿Continuar?")) return;
        L = d; if (!L.jornadas.some(x => x.id === L.cur)) L.cur = L.jornadas[0].id; save(); render();
      } catch (_) { alert("El texto no es una copia válida de la liga."); }
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "lgSP") { shopP = t.value; return render(); }
    if (t.dataset && t.dataset.cfg) {
      const v = Math.max(0, Math.floor(+t.value) || 0), k = t.dataset.cfg;
      if (k.startsWith("p.")) cfg().prices[k.slice(2)] = v; else cfg()[k] = v;
      save(); return render();
    }
    if (t.id === "lgView") { L.view = t.value === "j" ? "j" : "all"; save(); return render(); }
    if (t.id === "lgJ") { L.cur = t.value; report = null; save(); return render(); }
    if (t.id === "lgJn") { jor().name = t.value.trim() || jor().name; save(); return render(); }
    if (t.id === "lgRen") { L.rename = t.checked; save(); return; }
    if (t.id === "lgRom") { R.romFile = t.files[0] || null; R.ready = false; R.err = ""; return render(); }
    if (t.id === "lgMod") { R.modFile = t.files[0] || null; R.ready = false; R.err = ""; return render(); }
    if (t.dataset && t.dataset.act === "rename") {
      const p = L.parts.find(x => x.id === t.closest(".lg-p").dataset.id), v = t.value.trim();
      if (p && v) { p.name = v; save(); render(); }
    }
  }

  function init(ctx) {
    X = ctx; LigaMap.useCore(Core);
    root = document.getElementById("ligaRoot");
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "lgNew") root.querySelector("#lgAdd").click(); });
    load();
  }
  // Los selectores de archivo se pierden si se vuelve a pintar todo; se conservan los archivos elegidos en R.
  return { init, render: () => { load(); render(); }, _state: () => ({ L, R }) };
})();
