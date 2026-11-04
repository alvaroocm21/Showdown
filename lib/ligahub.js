// Pantalla «Liga»: temporada, entrenadores y sus Pokémon, tienda de monedas, historial y ajustes.
// Usa los datos y funciones comunes que publica liga.js (api).
const LigaHub = (() => {
  let A, root, tab = "temporada", detail = null, scope = "all", openHist = null, shopP = null, newEmo = null, newCol = null;
  const TABS = [["temporada", "🏆 Temporada"], ["calendario", "📅 Calendario"], ["entrenadores", "👥 Entrenadores"], ["tienda", "🪙 Tienda"], ["historial", "📜 Historial"], ["ajustes", "⚙ Ajustes"]];
  const LB = { hp: "PS", atk: "Ata", def: "Def", spa: "AtE", spd: "DeE", spe: "Vel" }, KS = ["hp", "atk", "def", "spa", "spd", "spe"];
  const X = () => A.X(), L = () => A.L(), esc = s => A.esc(s);

  function init(api) {
    A = api; root = document.getElementById("ligaRoot");
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "lhNew") root.querySelector("#lhAdd").click(); });
    return { render };
  }

  // ---------- Utilidades ----------
  const part = id => L().parts.find(p => p.id === id);
  const fmtDate = t => { try { return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  const pav = (p, cls) => `<span class="lh-av ${cls || ""}" style="background:${p.color}">${p.emoji}</span>`;
  const rec = r => `${r.v}V ${r.e}E ${r.d}D`;
  function calcStat(k, base, iv, ev, lvl, nat) {
    const x = Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100);
    if (k === "hp") return base === 1 ? 1 : x + lvl + 10;
    const n = X().Dex.natures.get(nat);
    return Math.floor((x + 5) * (n.plus === k ? 1.1 : n.minus === k ? 0.9 : 1));
  }
  const natText = nat => { const n = X().Dex.natures.get(nat); return n && n.plus ? `${nat} (+${LB[n.plus]} −${LB[n.minus]})` : (nat || "—"); };

  // ---------- Dibujo ----------
  function render() {
    if (!root) return;
    const l = L();
    if (detail && !part(detail)) detail = null;
    if (!newEmo) { newEmo = A.EMOJIS[0]; newCol = A.COLORS[0]; }
    const nMatch = A.matches().length;
    root.innerHTML = `
    <div class="topbar"><button class="btn ghost" id="lhBack">← Inicio</button><h2>🏟 Liga</h2><button class="btn ghost" id="lhGoRom">🎮 Editor ROM</button></div>
    <header class="lh-hero">
      <div class="lh-trophy" aria-hidden="true">🏆</div>
      <div class="lh-ht"><small>LIGA POKÉMON</small>
        <input id="lhSeason" class="lh-season" value="${esc(l.season.name)}" maxlength="28" aria-label="Nombre de la temporada">
        <p>${l.parts.length} entrenador${l.parts.length === 1 ? "" : "es"} · ${nMatch} combate${nMatch === 1 ? "" : "s"} · ${esc(A.jor().name)} (${l.jornadas.findIndex(j => j.id === l.cur) + 1}/${l.jornadas.length})</p>${meChip()}</div>
    </header>
    <nav class="lh-tabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" class="lh-tab ${tab === k ? "on" : ""}" data-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join("")}</nav>
    <section class="lh-body">${tab === "temporada" ? temporada() : tab === "calendario" ? calendario() : tab === "entrenadores" ? (detail ? detalle(part(detail)) : entrenadores()) : tab === "tienda" ? tienda() : tab === "historial" ? historial() : ajustes()}</section>`;
    A.paintIcons(root);
  }

  function jornadaChips() {
    const l = L();
    return `<div class="lh-chips">${l.jornadas.map(j => `<button class="lh-chip ${j.id === l.cur ? "on" : ""}" data-j="${j.id}">${esc(j.name)}</button>`).join("")}<button class="lh-chip add" id="lhJnew">+ Nueva</button></div>`;
  }

  // ----- Tabla de clasificación con zonas de ascenso, playoff y descenso -----
  const zonesCfg = () => { const l = L(); if (!l.zones) l.zones = { asc: 2, po: 2, desc: 2 }; return l.zones; };
  const ZN = { asc: "Ascenso", po: "Playoff", desc: "Descenso" };
  function tabla(st, o) {
    o = o || {};
    const zc = LigaCal.zones(st.length, o.zones || zonesCfg()), meId = L().me;
    const used = ["asc", "po", "desc"].filter(z => zc.includes(z));
    return `<div class="lh-tw"><table class="lh-t lh-cl"><thead><tr><th>#</th><th>Entrenador</th><th>PJ</th><th>V</th><th>E</th><th>D</th><th>Pts</th></tr></thead><tbody>${st.map((r, i) => {
      const z = zc[i], p = o.noOpen ? null : part(r.id), res = o.resOf ? o.resOf(r.id) : LigaCal.results(A.matches(), r.id);
      const dots = res.length ? `<span class="lh-form">${res.slice(-5).map(x => `<i class="f${x}">${x}</i>`).join("")}</span>` : "";
      return `<tr class="${z ? "z-" + z : ""} ${i === 0 && r.pj ? "lead" : ""}" ${p ? `data-open="${r.id}"` : ""}><td><span class="lh-pos">${i === 0 && r.pj ? "🏆" : i + 1}</span></td>
        <td class="lh-nm"><b>${meId && r.id === meId ? "⭐ " : ""}${esc(r.name)}</b>${dots}</td><td>${r.pj}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td><b>${r.pts}</b></td></tr>`;
    }).join("")}</tbody></table></div>
    ${used.length ? `<div class="lh-leg">${used.map(z => `<span><i class="z-${z}"></i>${ZN[z]} <small>(${zc.filter(x => x === z).length})</small></span>`).join("")}</div>` : (st.length < 4 ? `<p class="lh-note">Con 4 o más entrenadores se marcan las zonas de ascenso, playoff y descenso.</p>` : "")}`;
  }

  // ----- Temporada -----
  function podium(st) {
    const top = st.filter(r => r.pj > 0).slice(0, 3);
    if (!top.length) return `<p class="lh-empty">Todavía no hay combates anotados. Anota el primero abajo.</p>`;
    const order = [top[1], top[0], top[2]], cls = ["s2", "s1", "s3"], medal = ["🥈", "🥇", "🥉"];
    return `<div class="lh-pod">${order.map((r, i) => r ? `<div class="lh-pd ${cls[i]}">${pav(part(r.id) || { color: "#6b7a90", emoji: "?" })}<b>${esc(r.name)}</b><small>${r.pts} pts · ${rec(r)}</small><div class="lh-step">${medal[i]}</div></div>` : `<div class="lh-pd ${cls[i]} none"></div>`).join("")}</div>`;
  }
  function temporada() {
    const l = L(), j = A.jor(), sc = scope === "j" ? l.cur : "", st = A.standings(sc);
    const cur = A.matches().filter(m => m.j === l.cur);
    const opt = sel => l.parts.map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    const h = A.headToHead();
    return `${jornadaChips()}
    <div class="lh-card"><div class="lh-ch"><b>Clasificación</b>
        <select id="lhScope" aria-label="Alcance"><option value="all" ${sc ? "" : "selected"}>Toda la temporada</option><option value="j" ${sc ? "selected" : ""}>Solo «${esc(j.name)}»</option></select></div>
      ${podium(st)}
      ${l.parts.length ? `${tabla(st)}
      <p class="lh-note">Victoria 3 puntos, empate 1. Toca un entrenador para ver su equipo.</p>` : `<p class="lh-empty">Añade entrenadores en la pestaña «Entrenadores».</p>`}</div>

    <div class="lh-card"><div class="lh-ch"><b>Combates de ${esc(j.name)}</b></div>
      <div class="lh-ml">${cur.length ? cur.map(m => matchRow(m, true)).join("") : `<p class="lh-empty">Sin combates anotados en esta jornada.</p>`}</div>
      ${l.parts.length >= 2 ? `<details class="lh-det"><summary>➕ Anotar un combate</summary>
        <p class="lh-note">Los combates se juegan en la ROM: al terminar, anota aquí quién ganó.</p>
        <div class="lh-row"><select id="lhMA" aria-label="Entrenador A">${opt(l.parts[0].id)}</select><span>vs</span><select id="lhMB" aria-label="Entrenador B">${opt(l.parts[1].id)}</select></div>
        <div class="lh-row"><select id="lhMR" aria-label="Resultado"><option value="a">Gana el primero</option><option value="b">Gana el segundo</option><option value="d">Empate</option></select><button class="btn sm gold" id="lhMAdd">Anotar</button></div></details>` : ""}
    </div>

    ${h.length ? `<details class="lh-card lh-det"><summary><b>Cara a cara</b></summary><div class="lh-ml">${h.map(o => `<div class="lh-m"><span><b>${esc(A.pName(o.x))}</b> ${o.vx} – ${o.vy} <b>${esc(A.pName(o.y))}</b>${o.e ? ` <small>(${o.e} empate${o.e === 1 ? "" : "s"})</small>` : ""}</span></div>`).join("")}</div></details>` : ""}

    <details class="lh-card lh-det"><summary><b>Opciones de la temporada</b></summary>
      <div class="lh-row"><input id="lhJn" value="${esc(j.name)}" maxlength="24" aria-label="Nombre de la jornada"><button class="btn sm ghost" id="lhJdel" ${l.jornadas.length > 1 ? "" : "disabled"}>Borrar esta jornada</button></div>
      <p class="lh-note">Al cerrar la temporada se guarda en el Historial (clasificación, combates y equipos) y empieza otra con los mismos entrenadores y sus últimos equipos. Las monedas se conservan.</p>
      <button class="btn sm danger" id="lhClose">🏁 Cerrar temporada y empezar otra</button></details>`;
  }
  function matchRow(m, del) {
    const a = part(m.a), b = part(m.b);
    return `<div class="lh-m ${m.w === "d" ? "d" : ""}"><span class="lh-ms"><span class="${m.w === "a" ? "win" : ""}">${a ? a.emoji : ""} <b>${esc(A.pName(m.a))}</b></span><i>${m.w === "d" ? "=" : "vs"}</i><span class="${m.w === "b" ? "win" : ""}">${b ? b.emoji : ""} <b>${esc(A.pName(m.b))}</b></span></span>${del ? `<button class="lh-x" data-mid="${m.id}" aria-label="Borrar combate">×</button>` : ""}</div>`;
  }

  // ----- Calendario y rachas -----
  const streakOf = pid => LigaCal.streak(LigaCal.results(A.matches(), pid));
  function formDots(pid) {
    const s = streakOf(pid);
    return s.last5.length ? `<div class="lh-form" title="Últimos partidos">${s.last5.map(r => `<i class="f${r}">${r}</i>`).join("")}</div>` : "";
  }
  function meChip() {
    const l = L(), me = l.me && part(l.me); if (!me) return "";
    const s = streakOf(me.id);
    return `<p class="lh-mechip">⭐ ${esc(me.name)} · ${s.kind === "V" && s.n >= 2 ? "🔥 " : ""}${esc(LigaCal.streakText(s))}</p>`;
  }
  const dayTxt = d => LigaCal.dayLabel(d);
  function fxRow(f, meId) {
    const a = part(f.a), b = part(f.b), l = L(), jn = (l.jornadas.find(j => j.id === f.j) || {}).name || "";
    if (!a || !b) return "";
    const mine = meId && (f.a === meId || f.b === meId), rival = mine ? (f.a === meId ? b : a) : null;
    const btns = mine
      ? `<button class="btn sm gold" data-fx="${f.id}" data-w="${f.a === meId ? "a" : "b"}">🏆 Gané</button><button class="btn sm ghost" data-fx="${f.id}" data-w="d">Empate</button><button class="btn sm ghost" data-fx="${f.id}" data-w="${f.a === meId ? "b" : "a"}">Perdí</button>`
      : `<button class="btn sm ghost" data-fx="${f.id}" data-w="a">Gana ${esc(a.name)}</button><button class="btn sm ghost" data-fx="${f.id}" data-w="d">Empate</button><button class="btn sm ghost" data-fx="${f.id}" data-w="b">Gana ${esc(b.name)}</button>`;
    return `<div class="lh-fx"><div class="lh-fxh"><span class="lh-day ${f.date && dayTxt(f.date) === "Hoy" ? "hoy" : ""}">${f.date ? esc(dayTxt(f.date)) : "Sin fecha"}</span><small>${esc(jn)}</small><button class="lh-x" data-fxdel="${f.id}" aria-label="Quitar partido">×</button></div>
      <div class="lh-vs">${mine ? `<span>${pav(part(meId))}<b>Tú</b></span><i>vs</i><span>${pav(rival)}<b>${esc(rival.name)}</b></span>` : `<span>${pav(a)}<b>${esc(a.name)}</b></span><i>vs</i><span>${pav(b)}<b>${esc(b.name)}</b></span>`}</div>
      <div class="lh-btns">${btns}</div></div>`;
  }
  function calendario() {
    const l = L(), j = A.jor(), me = l.me && part(l.me), pend = LigaCal.upcoming(l.fixtures || [], l.jornadas);
    const mine = me ? pend.filter(f => f.a === me.id || f.b === me.id) : [], opt = sel => l.parts.map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    const sm = me ? streakOf(me.id) : null, resMe = me ? LigaCal.results(A.matches(), me.id) : [];
    const myStreak = !me ? `<p class="lh-empty">Elige quién eres para ver tus próximos partidos y tu racha.</p>` :
      `<div class="lh-streak"><div class="lh-sbig ${sm.kind}"><b>${sm.n || 0}</b><small>${sm.kind === "V" ? "victorias" : sm.kind === "D" ? "derrotas" : sm.kind === "E" ? "empates" : ""}</small></div>
        <div class="lh-sinfo"><b>${sm.kind === "V" && sm.n >= 2 ? "🔥 " : ""}${esc(LigaCal.streakText(sm))}</b>
          <div class="lh-form big">${sm.last5.map(r => `<i class="f${r}">${r}</i>`).join("") || "<small>—</small>"}</div>
          <small>Mejor racha de victorias: ${sm.bestWins} · ${resMe.filter(r => r === "V").length}V ${resMe.filter(r => r === "E").length}E ${resMe.filter(r => r === "D").length}D</small></div></div>`;
    const byJ = {}; pend.forEach(f => (byJ[f.j] = byJ[f.j] || []).push(f));
    const all = l.jornadas.filter(x => byJ[x.id]).map(x => `<div class="lh-hj"><b>${esc(x.name)}${x.date ? " · " + esc(dayTxt(x.date)) : ""}</b>${byJ[x.id].map(f => fxRow(f, null)).join("")}</div>`).join("");
    const rows = l.parts.map(p => ({ p, s: streakOf(p.id) })).filter(r => r.s.kind).sort((x, y) => (y.s.kind === "V") - (x.s.kind === "V") || y.s.n - x.s.n);
    return `${jornadaChips()}
    <div class="lh-card"><div class="lh-ch"><b>⭐ ${me ? esc(me.name) : "¿Quién eres?"}</b>
        <select id="lhMe" aria-label="Quién eres"><option value="">— Elegir —</option>${opt(l.me)}</select></div>${myStreak}</div>

    <div class="lh-card"><div class="lh-ch"><b>Mis próximos partidos</b>${mine.length ? `<span class="lh-note">${mine.length} pendiente${mine.length === 1 ? "" : "s"}</span>` : ""}</div>
      ${me ? (mine.length ? mine.map(f => fxRow(f, me.id)).join("") : `<p class="lh-empty">No tienes partidos pendientes. Genera la jornada o añade uno abajo.</p>`) : `<p class="lh-empty">Elige quién eres arriba.</p>`}</div>

    <div class="lh-card"><div class="lh-ch"><b>Calendario de la liga</b></div>
      <div class="lh-row"><label class="lh-lab">Fecha de ${esc(j.name)}<input type="date" id="lhJdate" value="${esc(j.date || "")}"></label></div>
      <div class="lh-acts"><button class="btn sm gold" id="lhGen" ${l.parts.length >= 2 ? "" : "disabled"}>📅 Generar partidos de ${esc(j.name)}</button>
        <button class="btn sm ghost" id="lhFxClear" ${(l.fixtures || []).some(f => f.j === l.cur) ? "" : "disabled"}>Quitar los pendientes de esta jornada</button></div>
      <p class="lh-note">Cada jornada genera una ronda distinta de todos contra todos: nadie repite rival hasta completar la vuelta.</p>
      ${all || `<p class="lh-empty">No hay partidos pendientes.</p>`}
      ${l.parts.length >= 2 ? `<details class="lh-det"><summary>➕ Añadir un partido a mano</summary>
        <div class="lh-row"><select id="lhFA" aria-label="Entrenador A">${opt(l.parts[0].id)}</select><span>vs</span><select id="lhFB" aria-label="Entrenador B">${opt(l.parts[1].id)}</select></div>
        <div class="lh-row"><input type="date" id="lhFD" aria-label="Fecha"><button class="btn sm gold" id="lhFxAdd">Añadir a ${esc(j.name)}</button></div></details>` : ""}</div>

    ${rows.length ? `<details class="lh-card lh-det" open><summary><b>Rachas de todos</b></summary><div class="lh-ml">${rows.map(r => `<div class="lh-m"><span>${part(r.p.id) ? part(r.p.id).emoji : ""} <b>${esc(r.p.name)}</b></span><span>${r.s.kind === "V" && r.s.n >= 2 ? "🔥 " : ""}${esc(LigaCal.streakText(r.s))} ${formDots(r.p.id)}</span></div>`).join("")}</div></details>` : ""}`;
  }

  // ----- Entrenadores -----
  function entrenadores() {
    const l = L(), st = {}; A.standings("").forEach(r => st[r.id] = r);
    return `${jornadaChips()}
    <div class="lh-grid">${l.parts.map(p => {
      const r = st[p.id] || { v: 0, e: 0, d: 0, pts: 0 }, n = A.teamOf(p).length;
      return `<button class="lh-tc" data-open="${p.id}" style="--c:${p.color}"><div class="lh-tch">${pav(p)}<b>${esc(p.name)}</b></div>
        <div class="lh-rec">${rec(r)} · <b>${r.pts}</b> pts</div>${formDots(p.id)}
        ${n ? `<div class="lh-icons" data-icons="${p.id}"></div>` : `<div class="lh-empty sm">Sin Pokémon</div>`}
        <small>🪙 ${A.bal(p.id)}</small></button>`;
    }).join("") || `<p class="lh-empty">Aún no hay entrenadores. Añade el primero abajo.</p>`}</div>
    <div class="lh-card"><div class="lh-ch"><b>Añadir entrenador</b></div>
      <input id="lhNew" class="lh-in" maxlength="16" placeholder="Nombre del entrenador" autocomplete="off">
      <div class="lh-emo" id="lhEmo">${A.EMOJIS.map(e => `<span data-e="${e}" class="${e === newEmo ? "on" : ""}">${e}</span>`).join("")}</div>
      <div class="lh-emo col" id="lhCol">${A.COLORS.map(c => `<span data-c="${c}" style="background:${c}" class="${c === newCol ? "on" : ""}"></span>`).join("")}</div>
      <button class="btn gold sm" id="lhAdd">+ Añadir</button></div>`;
  }
  function monCard(m) {
    const Dex = X().Dex, sp = Dex.species.get(m.species), lvl = m.level || 50;
    const ivs = m.ivs || {}, evs = m.evs || {};
    const stats = KS.map(k => ({ k, v: calcStat(k, sp.baseStats[k], ivs[k] == null ? 31 : ivs[k], evs[k] || 0, lvl, m.nature) }));
    const ab = Dex.abilities.get(m.ability), it = m.item ? Dex.items.get(m.item) : null;
    const evTxt = KS.filter(k => evs[k]).map(k => `${evs[k]} ${LB[k]}`).join(" / ");
    const ivTxt = KS.filter(k => ivs[k] != null && ivs[k] !== 31).map(k => `${ivs[k]} ${LB[k]}`).join(" / ");
    return `<article class="lh-mon" style="--c:${X().tCol(sp.types[0])}">
      <div class="lh-mh"><div data-sp="${esc(m.species)}" data-size="64"></div>
        <div class="lh-mi"><b>${esc(X().nmSp(m.species))}</b><span>${sp.types.map(t => X().tchip(t)).join("")}</span><small>Nv. ${lvl}${m.shiny ? " · ✨" : ""}${m.teraType ? " · Tera " + esc(X().tES(m.teraType)) : ""}</small></div></div>
      <div class="lh-kv"><span>Habilidad</span><b>${esc(X().nmAb(m.ability))}</b><small>${esc(ab.shortDesc || "")}</small></div>
      <div class="lh-kv"><span>Objeto</span><b>${it ? esc(X().nmItem(m.item)) : "Ninguno"}</b><small>${it ? esc(it.shortDesc || "") : ""}</small></div>
      <div class="lh-kv"><span>Naturaleza</span><b>${esc(natText(m.nature))}</b></div>
      <div class="lh-mv">${(m.moves || []).map(mv => { const d = Dex.moves.get(mv); return `<span class="lh-mvp" style="--c:${X().tCol(d.type)}"><b>${esc(X().nmMove(mv))}</b><small>${esc(X().tES(d.type))}${d.basePower ? " · " + d.basePower : ""}</small></span>`; }).join("") || `<small>Sin ataques</small>`}</div>
      <div class="lh-st">${stats.map(s => `<div class="lh-sr"><span>${LB[s.k]}</span><div class="lh-bar"><i style="width:${Math.min(100, Math.round(s.v / (lvl * 2 + 110) * 100))}%"></i></div><b>${s.v}</b></div>`).join("")}</div>
      ${evTxt || ivTxt ? `<small class="lh-ev">${evTxt ? "EVs: " + esc(evTxt) : ""}${evTxt && ivTxt ? " · " : ""}${ivTxt ? "IVs: " + esc(ivTxt) : ""}</small>` : ""}
    </article>`;
  }
  function detalle(p) {
    const l = L(), st = A.standings("").find(r => r.id === p.id) || { v: 0, e: 0, d: 0, pts: 0, pj: 0 };
    const sets = A.teamOf(p), mine = A.matches().filter(m => m.a === p.id || m.b === p.id);
    const log = (l.log || []).filter(x => x.p === p.id).slice(0, 8), R = A.R();
    return `<button class="btn ghost sm" id="lhBackList">← Entrenadores</button>
    <div class="lh-card lh-dh" style="--c:${p.color}"><div class="lh-dhh">${pav(p, "big")}<div><input class="lh-rename" data-rename value="${esc(p.name)}" maxlength="16" aria-label="Nombre">
        ${formDots(p.id)}<div class="lh-pills"><span>${st.pj} PJ</span><span>${esc(LigaCal.streakText(streakOf(p.id)))}</span><span>${rec(st)}</span><span><b>${st.pts}</b> pts</span><span>🪙 ${A.bal(p.id)}</span></div></div></div>
      ${R.ready && A.slotOf(p) ? `<small class="lh-note">🎮 En la ROM: ${esc(A.trainerLabel(A.slotOf(p)))}</small>` : ""}</div>
    ${jornadaChips()}
    <div class="lh-card"><div class="lh-ch"><b>Equipo en ${esc(A.jor().name)}</b><span class="lh-note">${sets.length}/6</span></div>
      <div class="lh-acts"><button class="btn sm gold" data-act="team">✏ ${sets.length ? "Editar equipo" : "Elegir Pokémon"}</button>
        <button class="btn sm ghost" data-act="prev">↩ Copiar jornada anterior</button><button class="btn sm ghost" data-act="prof">👤 Traer de un jugador</button></div>
      <div class="lh-mons">${sets.map(monCard).join("") || `<p class="lh-empty">Este entrenador no tiene Pokémon en esta jornada.</p>`}</div></div>
    <div class="lh-card"><div class="lh-ch"><b>Combates</b></div><div class="lh-ml">${mine.length ? mine.slice().reverse().map(m => `<div class="lh-mj"><small>${esc((l.jornadas.find(j => j.id === m.j) || {}).name || "")}</small>${matchRow(m, false)}</div>`).join("") : `<p class="lh-empty">Sin combates todavía.</p>`}</div></div>
    ${log.length ? `<details class="lh-card lh-det"><summary><b>Movimientos de monedas</b></summary><ul class="lh-log">${log.map(x => `<li><b>${x.d > 0 ? "+" : ""}${x.d}</b> ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}
    <div class="lh-acts"><button class="btn sm ${l.me === p.id ? "gold" : "ghost"}" data-act="me">${l.me === p.id ? "⭐ Eres tú" : "⭐ Este soy yo"}</button></div>
    <button class="btn sm danger" data-act="del">🗑 Quitar a este entrenador de la liga</button>`;
  }

  // ----- Tienda -----
  function tienda() {
    const l = L();
    if (!l.parts.length) return `<p class="lh-empty">Añade entrenadores para darles monedas.</p>`;
    const p = l.parts.find(x => x.id === shopP) || l.parts[0], c = A.cfg(), env = shopEnv(), sets = A.teamOf(p);
    const mons = sets.map((m, i) => `<div class="lh-sm"><div class="lh-smh"><span data-sp="${esc(m.species)}" data-size="40"></span><div><b>${esc(X().nmSp(m.species))}</b><small>${esc(X().nmAb(m.ability))} · ${esc(m.nature || "—")} · ${m.item ? esc(X().nmItem(m.item)) : "sin objeto"}</small>
        <small>${(m.moves || []).map(v => esc(X().nmMove(v))).join(" / ") || "sin ataques"}</small></div></div>
      <div class="lh-btns">${["ab", "natR", "nat", "mvR", "mv", "itR", "iv"].map(k => {
        const price = c.prices[k], why = LigaShop.why(k, m, env), dis = A.bal(p.id) < price || why;
        return `<button class="btn sm ${dis ? "ghost" : ""}" data-shop="${k}" data-i="${i}" ${dis ? "disabled" : ""} title="${esc(why)}">${esc(LigaShop.LABELS[k])} · 🪙${price}</button>`;
      }).join("")}</div></div>`).join("");
    const log = (l.log || []).filter(x => x.p === p.id).slice(0, 12);
    return `<div class="lh-card"><div class="lh-ch"><b>Monedas</b></div>
      <p class="lh-note">Cada combate anotado da monedas. Con ellas se retocan los Pokémon de la jornada actual; los cambios pasan a las jornadas nuevas que copien el equipo.</p>
      <div class="lh-row"><select id="lhSP" aria-label="Entrenador">${l.parts.map(q => `<option value="${q.id}" ${q.id === p.id ? "selected" : ""}>${esc(q.name)} · 🪙${A.bal(q.id)}</option>`).join("")}</select></div>
      <div class="lh-row"><input id="lhCoinN" type="number" inputmode="numeric" min="1" value="50" aria-label="Cantidad"><button class="btn sm" id="lhCoinGive">Dar monedas</button><button class="btn sm ghost" id="lhCoinTake">Quitar</button></div></div>
    <div class="lh-card"><div class="lh-ch"><b>Retocar Pokémon de ${esc(p.name)}</b></div>${mons || `<p class="lh-empty">No tiene Pokémon en «${esc(A.jor().name)}».</p>`}</div>
    ${log.length ? `<details class="lh-card lh-det"><summary><b>Últimos movimientos</b></summary><ul class="lh-log">${log.map(x => `<li><b>${x.d > 0 ? "+" : ""}${x.d}</b> ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}`;
  }
  const shopEnv = () => { const R = A.R(); return { Dex: X().Dex, abils: X().ABILS, natures: X().NATURES, moves: X().MOVES, items: X().RITEMS, learnable: X().learnable,
    ok: (k, o) => !R.ready || (k === "ability" ? R.res.ability(o) : k === "move" ? R.res.move(o) : R.res.item(o)) >= 0 }; };

  // ----- Historial -----
  function historial() {
    const h = (L().history || []).slice().reverse();
    if (!h.length) return `<p class="lh-empty">Aquí aparecerán las temporadas cerradas, con su clasificación, combates y equipos.</p>`;
    return h.map(s => {
      const open = openHist === s.id, champ = s.standings[0];
      return `<div class="lh-card lh-hs"><button class="lh-hsh" data-hist="${s.id}"><span class="lh-hst">🏆</span><span><b>${esc(s.name)}</b><small>${champ && champ.pj ? "Campeón: " + esc(champ.name) + " · " + champ.pts + " pts" : "Sin combates"} · ${s.matches.length} combates · ${esc(fmtDate(s.closedAt))}</small></span><i>${open ? "▲" : "▼"}</i></button>
        ${open ? histBody(s) : ""}</div>`;
    }).join("");
  }
  function histBody(s) {
    const nm = id => (s.parts.find(p => p.id === id) || { name: "(borrado)" }).name;
    const em = id => (s.parts.find(p => p.id === id) || { emoji: "" }).emoji;
    return `${tabla(s.standings, { zones: s.zones, noOpen: true, resOf: id => LigaCal.results(s.matches, id) })}
      ${s.jornadas.map(j => {
        const ms = s.matches.filter(m => m.j === j.id);
        return `<div class="lh-hj"><b>${esc(j.name)}</b>
          ${ms.length ? ms.map(m => `<div class="lh-m"><span class="lh-ms"><span class="${m.w === "a" ? "win" : ""}">${em(m.a)} <b>${esc(nm(m.a))}</b></span><i>${m.w === "d" ? "=" : "vs"}</i><span class="${m.w === "b" ? "win" : ""}">${em(m.b)} <b>${esc(nm(m.b))}</b></span></span></div>`).join("") : `<small class="lh-note">Sin combates</small>`}
          <div class="lh-hteams">${s.parts.map(p => { const t = ((s.teams[p.id] || {})[j.id]) || []; return t.length ? `<div class="lh-ht2"><small>${p.emoji} ${esc(p.name)}</small><div data-spl="${esc(t.map(x => x.species).join(","))}"></div></div>` : ""; }).join("")}</div></div>`;
      }).join("")}`;
  }

  // ----- Ajustes -----
  function ajustes() {
    const c = A.cfg(), lab = { win: "Victoria", draw: "Empate", loss: "Derrota" }, pl = LigaShop.LABELS;
    const z = zonesCfg();
    return `<div class="lh-card"><div class="lh-ch"><b>Zonas de la clasificación</b></div>
      <div class="lh-cfg">${[["asc", "Plazas de ascenso"], ["po", "Plazas de playoff"], ["desc", "Plazas de descenso"]].map(([k, n]) => `<label>${n}<input type="number" inputmode="numeric" min="0" data-zone="${k}" value="${z[k]}"></label>`).join("")}</div>
      <p class="lh-note">Se aplican a partir de 4 entrenadores: ascenso arriba, playoff justo debajo y descenso abajo. Si no caben, se mantienen ascenso y descenso y se recorta el playoff. Ponlas a 0 para quitar una zona.</p></div>
    <div class="lh-card"><div class="lh-ch"><b>Premios y precios (monedas)</b></div>
      <div class="lh-cfg">${["win", "draw", "loss"].map(k => `<label>${lab[k]}<input type="number" inputmode="numeric" min="0" data-cfg="${k}" value="${c[k]}"></label>`).join("")}
      ${Object.keys(c.prices).map(k => `<label>${esc(pl[k])}<input type="number" inputmode="numeric" min="0" data-cfg="p.${k}" value="${c.prices[k]}"></label>`).join("")}</div></div>
    <div class="lh-card"><div class="lh-ch"><b>Copia de seguridad</b></div>
      <textarea id="lhBk" spellcheck="false" placeholder="Aquí aparece la copia de la liga para guardarla o pasarla a otro dispositivo"></textarea>
      <div class="lh-row"><button class="btn sm" id="lhBkOut">Generar copia</button><button class="btn sm ghost" id="lhBkIn">Restaurar desde el texto</button></div></div>`;
  }

  // ---------- Acciones ----------
  function closeSeason() {
    const l = L();
    if (!A.matches().length && !confirm("Todavía no hay combates anotados. ¿Cerrar la temporada de todas formas?")) return;
    if (!confirm(`¿Cerrar «${l.season.name}»? Se guarda en el Historial y empieza otra.`)) return;
    const teams = {}; l.parts.forEach(p => teams[p.id] = JSON.parse(JSON.stringify(p.teams || {})));
    l.history.push({ id: A.uid(), name: l.season.name, closedAt: Date.now(), jornadas: JSON.parse(JSON.stringify(l.jornadas)), matches: JSON.parse(JSON.stringify(A.matches())),
      standings: A.standings(""), zones: Object.assign({}, zonesCfg()), parts: l.parts.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color })), teams });
    const last = A.jor(), nj = { id: "j" + A.uid(), name: "Jornada 1" };
    l.parts.forEach(p => { const cur = A.teamOf(p, last.id); p.teams = cur.length ? { [nj.id]: JSON.parse(JSON.stringify(cur)) } : {}; });
    l.jornadas = [nj]; l.cur = nj.id; l.matches = []; l.fixtures = []; l.season = { name: "Temporada " + (l.season.n + 1), n: l.season.n + 1 };
    scope = "all"; A.save(); tab = "historial"; openHist = l.history[l.history.length - 1].id; A.refresh();
  }
  function onClick(e) {
    const t = e.target, id = t.id, l = L();
    if (id === "lhBack") return X().show("title");
    if (id === "lhGoRom") return X().show("rom");
    const tb = t.closest("[data-tab]"); if (tb) { tab = tb.dataset.tab; detail = null; return render(); }
    const jc = t.closest("[data-j]"); if (jc) { l.cur = jc.dataset.j; A.save(); return A.refresh(); }
    const op = t.closest("[data-open]"); if (op) { tab = "entrenadores"; detail = op.dataset.open; const sc = root.closest(".screen"); if (sc) sc.scrollTop = 0; return render(); }
    if (id === "lhBackList") { detail = null; return render(); }
    const hs = t.closest("[data-hist]"); if (hs) { openHist = openHist === hs.dataset.hist ? null : hs.dataset.hist; return render(); }
    if (t.dataset && t.dataset.mid) {
      const m = A.matches().find(x => x.id === t.dataset.mid);
      if (m && m.c) { A.addCoins(m.a, -m.c.a, "Combate borrado"); A.addCoins(m.b, -m.c.b, "Combate borrado"); }
      l.matches = A.matches().filter(x => x.id !== t.dataset.mid); A.save(); return A.refresh();
    }
    if (t.dataset && t.dataset.shop) return A.buy(t.dataset.shop, +t.dataset.i, (l.parts.find(x => x.id === shopP) || l.parts[0]).id);
    if (id === "lhCoinGive" || id === "lhCoinTake") {
      const n = Math.floor(+root.querySelector("#lhCoinN").value); if (!(n > 0)) return;
      A.addCoins((l.parts.find(x => x.id === shopP) || l.parts[0]).id, id === "lhCoinGive" ? n : -n, "Ajuste manual"); A.save(); return A.refresh();
    }
    if (id === "lhMAdd") {
      const a = root.querySelector("#lhMA").value, b = root.querySelector("#lhMB").value;
      if (a === b) { alert("Elige dos entrenadores distintos."); return; }
      A.recordMatch(a, b, root.querySelector("#lhMR").value); return A.refresh();
    }
    const em = t.closest("#lhEmo span"); if (em) { newEmo = em.dataset.e; const n = root.querySelector("#lhNew").value; render(); root.querySelector("#lhNew").value = n; return; }
    const co = t.closest("#lhCol span"); if (co) { newCol = co.dataset.c; const n = root.querySelector("#lhNew").value; render(); root.querySelector("#lhNew").value = n; return; }
    if (id === "lhAdd") {
      const inp = root.querySelector("#lhNew"), name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      l.parts.push({ id: A.uid(), name, emoji: newEmo, color: newCol, teams: {}, slots: {} }); A.save(); return A.refresh();
    }
    if (id === "lhJnew") {
      const nj = { id: "j" + A.uid(), name: "Jornada " + (l.jornadas.length + 1) };
      l.parts.forEach(p => { const cur = A.teamOf(p); if (cur.length) (p.teams = p.teams || {})[nj.id] = JSON.parse(JSON.stringify(cur)); });
      l.jornadas.push(nj); l.cur = nj.id; A.save(); return A.refresh();
    }
    if (id === "lhJdel") {
      if (!confirm(`¿Borrar «${A.jor().name}» y los equipos de esa jornada?`)) return;
      const gone = l.cur; l.fixtures = (l.fixtures || []).filter(f => f.j !== gone); l.matches = A.matches().filter(m => m.j !== gone); l.jornadas = l.jornadas.filter(x => x.id !== gone); l.parts.forEach(p => { if (p.teams) delete p.teams[gone]; });
      l.cur = l.jornadas[0].id; A.save(); return A.refresh();
    }
    if (id === "lhClose") return closeSeason();
    if (id === "lhBkOut") { root.querySelector("#lhBk").value = JSON.stringify(l); return; }
    if (id === "lhBkIn") {
      try {
        const d = JSON.parse(root.querySelector("#lhBk").value);
        if (!d || !Array.isArray(d.parts) || !Array.isArray(d.jornadas) || !d.jornadas.length) throw 0;
        if (!confirm("Esto sustituye la liga actual por la de la copia. ¿Continuar?")) return;
        A.setL(d); detail = null; A.refresh();
      } catch (_) { alert("El texto no es una copia válida de la liga."); }
      return;
    }
    const fx = t.closest("[data-fx]");
    if (fx) { const f = (l.fixtures || []).find(x => x.id === fx.dataset.fx); if (f) { A.recordMatch(f.a, f.b, fx.dataset.w, f.j); } return A.refresh(); }
    const fd = t.closest("[data-fxdel]"); if (fd) { l.fixtures = (l.fixtures || []).filter(x => x.id !== fd.dataset.fxdel); A.save(); return A.refresh(); }
    if (id === "lhFxAdd") {
      const a = root.querySelector("#lhFA").value, b = root.querySelector("#lhFB").value;
      if (a === b) { alert("Elige dos entrenadores distintos."); return; }
      (l.fixtures = l.fixtures || []).push({ id: A.uid(), j: l.cur, a, b, date: root.querySelector("#lhFD").value || "" }); A.save(); return A.refresh();
    }
    if (id === "lhFxClear") { l.fixtures = (l.fixtures || []).filter(f => f.j !== l.cur); A.save(); return A.refresh(); }
    if (id === "lhGen") {
      const ids = l.parts.map(p => p.id), r = l.jornadas.findIndex(x => x.id === l.cur), pairs = LigaCal.round(ids, r);
      const had = (l.fixtures || []).filter(f => f.j === l.cur).length;
      if (had && !confirm(`Esta jornada ya tiene ${had} partido${had === 1 ? "" : "s"} pendiente${had === 1 ? "" : "s"}. ¿Sustituirlos por los generados?`)) return;
      l.fixtures = (l.fixtures || []).filter(f => f.j !== l.cur);
      // no se vuelven a programar las parejas que ya jugaron en esta jornada
      const done = A.matches().filter(m => m.j === l.cur);
      pairs.filter(([a, b]) => !done.some(m => (m.a === a && m.b === b) || (m.a === b && m.b === a))).forEach(([a, b]) => l.fixtures.push({ id: A.uid(), j: l.cur, a, b, date: "" }));
      A.save(); return A.refresh();
    }
    // Acciones sobre el entrenador abierto
    const act = t.closest("[data-act]");
    if (act && detail) {
      const p = part(detail), a = act.dataset.act; if (!p) return;
      if (a === "me") { l.me = l.me === p.id ? null : p.id; A.save(); return A.refresh(); }
      if (a === "team") return A.editTeam(p);
      if (a === "del") { if (confirm(`¿Quitar a «${p.name}» y todos sus equipos de la liga?`)) { l.parts = l.parts.filter(x => x !== p); l.matches = A.matches().filter(m => m.a !== p.id && m.b !== p.id); if (l.coins) delete l.coins[p.id]; detail = null; A.save(); A.refresh(); } return; }
      if (a === "prev") {
        const k = l.jornadas.findIndex(x => x.id === l.cur), prev = k > 0 ? (p.teams || {})[l.jornadas[k - 1].id] : null;
        if (!prev || !prev.length) { alert("No hay equipo en la jornada anterior."); return; }
        (p.teams = p.teams || {})[l.cur] = JSON.parse(JSON.stringify(prev)); A.save(); return A.refresh();
      }
      if (a === "prof") {
        const profs = X().profileTeams().filter(q => q.team.length);
        if (!profs.length) { alert("Ningún jugador tiene equipo guardado todavía (se crea en «Elegir equipo»)."); return; }
        return A.pickSheet("Traer el equipo de un jugador", profs.map(q => ({ id: q.id, label: `${q.emoji} ${q.name}`, sub: q.team.map(s => X().nmSp(s.species)).join(", ") })), it => {
          const q = profs.find(z => z.id === it.id); (p.teams = p.teams || {})[l.cur] = JSON.parse(JSON.stringify(q.team.slice(0, 6))); A.save(); A.refresh();
        });
      }
    }
  }
  function onChange(e) {
    const t = e.target, l = L();
    if (t.id === "lhMe") { l.me = t.value || null; A.save(); return A.refresh(); }
    if (t.id === "lhJdate") { A.jor().date = t.value || ""; A.save(); return A.refresh(); }
    if (t.id === "lhSeason") { l.season.name = t.value.trim() || l.season.name; A.save(); return render(); }
    if (t.id === "lhScope") { scope = t.value === "j" ? "j" : "all"; return render(); }
    if (t.id === "lhSP") { shopP = t.value; return render(); }
    if (t.id === "lhJn") { A.jor().name = t.value.trim() || A.jor().name; A.save(); return A.refresh(); }
    if (t.dataset && t.dataset.zone) { zonesCfg()[t.dataset.zone] = Math.max(0, Math.floor(+t.value) || 0); A.save(); return render(); }
    if (t.dataset && t.dataset.cfg) {
      const v = Math.max(0, Math.floor(+t.value) || 0), k = t.dataset.cfg;
      if (k.startsWith("p.")) A.cfg().prices[k.slice(2)] = v; else A.cfg()[k] = v;
      A.save(); return render();
    }
    if (t.dataset && t.dataset.rename !== undefined) {
      const p = part(detail), v = t.value.trim();
      if (p && v) { p.name = v; A.save(); A.refresh(); }
    }
  }
  return { init };
})();
