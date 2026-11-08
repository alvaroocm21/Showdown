// Pantalla «Liga»: varias competiciones a la vez (ligas, copas y Champions), con los mismos entrenadores en todas.
// Pestañas: competición, calendario, entrenadores, tienda, historial y ajustes. Usa lo que publica liga.js (api).
const LigaHub = (() => {
  let A, root, eqP = null, soOpen = false, stScope = "comp", stSort = "pj", tab = "comp", detail = null, scope = "all", openHist = null, shopP = null, newEmo = null, newCol = null, creating = false, ncType = "liga";
  const LB = { hp: "PS", atk: "Ata", def: "Def", spa: "AtE", spd: "DeE", spe: "Vel" }, KS = ["hp", "atk", "def", "spa", "spd", "spe"];
  const X = () => A.X(), L = () => A.L(), C = () => A.C(), esc = s => A.esc(s), TY = () => A.TYPES;
  const ICON = t => TY()[t][0];

  function init(api) {
    A = api; root = document.getElementById("ligaRoot");
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "lhNew") root.querySelector("#lhAdd").click(); });
    return { render };
  }

  // ---------- Utilidades ----------
  const part = id => L().parts.find(p => p.id === id);
  // Con el bloqueo (por defecto), nadie controla los equipos de los demás: cada jugador sortea y elige los suyos entrando con su jugador.
  const shopPlayer = () => { const l = L(); return l.parts.find(x => x.id === shopP) || (l.me && l.parts.find(x => x.id === l.me)) || l.parts[0]; };
  // Quién controla a cada entrenador: «🎮 lo controlo yo» (cualquiera que use la app gestiona su equipo), «🔒 lo controla su jugador»
  // (solo se toca entrando con ese jugador) o «🤖 la IA» (el ordenador elige su alineación según el rival).
  const ctl = p => A.ctlOf(p);
  const selfCtl = p => ctl(p) === "self";
  const canEdit = p => ctl(p) === "mine" || (ctl(p) === "self" && !!p && L().me === p.id);
  const canDraw = p => canEdit(p) || ctl(p) === "ia";
  const emptyMsg = p => ctl(p) === "ia" ? "La IA se sortea sola su plantilla de 12 al preparar sus alineaciones; también puedes pulsar «Sortear Pokémon» para dársela ya (te pedirá su porcentaje de calidad)." : ctl(p) === "self" ? `Todavía no hay Pokémon. Solo ${esc(p.name)} puede sortearlos, entrando con su jugador.` : "Todavía no hay Pokémon. Pulsa «Sortear Pokémon»: primero te pedirá el porcentaje de calidad y luego te dará los 12.";
  const controllable = p => ctl(p) !== "self";   // entran en el sorteo general (los míos y los de la IA)
  const CTL = { mine: ["🎮", "Lo controlo yo"], self: ["🔒", "Lo controla su jugador"], ia: ["🤖", "La controla la IA"] };
  const aiInfo = (p, c) => {
    const lg = p.aiLog && p.aiLog[c.cur], n = id => id ? esc(nm(id)) : "";
    if (!lg) return `<p class="lh-lock">🤖 La IA elige su alineación según la jornada, su rival y el siguiente rival, y <b>gestiona su dinero</b> (🪙 ${A.bal(p.id)}): compra naturaleza, IVs, un buen ataque de su tipo u objeto. Se prepara sola al exportar a la ROM y al anotar un combate; también puedes pulsar «Preparar la IA».</p>`;
    return `<p class="lh-lock">🤖 <b>La IA eligió esta jornada</b>${lg.rival ? ` contra <b>${n(lg.rival)}</b>` : " (sin rival todavía: los más fuertes)"}${lg.next ? `; siguiente rival: <b>${n(lg.next)}</b>${lg.rested ? " (más duro: guarda a sus dos Pokémon más fuertes)" : ""}` : ""}.<br>Titulares: ${lg.picks.map(x => esc(X().nmSp(x))).join(", ")}.${lg.bench.length ? `<br>Banquillo: ${lg.bench.map(x => esc(X().nmSp(x))).join(", ")}.` : ""}<br>💰 <b>Gestiona su dinero</b> (🪙 ${A.bal(p.id)}): ${lg.spent && lg.spent.length ? "esta vez gastó en " + lg.spent.map(esc).join("; ") + "." : "esta vez no ha gastado (ahorra hasta poder pagar una mejora)."}</p>`;
  };
  const lockNote = (p, c) => ctl(p) === "ia" ? aiInfo(p, c || A.C()) : selfCtl(p) && !canEdit(p) ? `<p class="lh-lock">🔒 ${L().me ? `Lo controla su jugador: solo ${esc(p.name)} puede elegir su equipo (entrando con su jugador).` : "Lo controla su jugador: entra con tu jugador para elegir tu equipo."}</p>` : "";
  const fmtDate = t => { try { return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  // Escudo de un entrenador (imagen) o, si no tiene, su emoji sobre su color; y el de una competición.
  const ic = p => p.img ? `<img class="lh-img" src="${p.img}" alt="">` : "";   // el avatar es la imagen del escudo o, sin ella, solo el color
  const pav = (p, cls) => `<span class="lh-av ${cls || ""}" style="background:${p.color}">${ic(p)}</span>`;
  const compIc = c => c.img ? `<img class="lh-img sq" src="${c.img}" alt="">` : ICON(c.type);
  const compColor = c => c.color || { liga: "#2f7bff", copa: "#e8a417", champions: "#7a5cff" }[c.type];
  // Reduce la imagen elegida a un cuadrado de 96 px (PNG) para que ocupe poco al guardarla
  function shieldFromFile(file) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const S = 96, cv = document.createElement("canvas"); cv.width = cv.height = S;
        const g = cv.getContext("2d"), k = Math.min(im.width, im.height), sx = (im.width - k) / 2, sy = (im.height - k) / 2;
        g.drawImage(im, sx, sy, k, k, 0, 0, S, S); URL.revokeObjectURL(url); ok(cv.toDataURL("image/png"));
      };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error("No se pudo leer la imagen.")); };
      im.src = url;
    });
  }
  const swatches = (attr, cur) => A.COLORS.map(x => `<span ${attr}="${x}" style="background:${x}" class="${x === cur ? "on" : ""}"></span>`).join("");
  const rec = r => `${r.v}V ${r.e}E ${r.d}D`;
  const dayTxt = d => LigaCal.dayLabel(d);
  const nm = id => (part(id) || { name: "Por definir" }).name;
  const streakOf = pid => LigaCal.streak(A.allResults(pid));
  function calcStat(k, base, iv, ev, lvl, nat) {
    const x = Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100);
    if (k === "hp") return base === 1 ? 1 : x + lvl + 10;
    const n = X().Dex.natures.get(nat);
    return Math.floor((x + 5) * (n.plus === k ? 1.1 : n.minus === k ? 0.9 : 1));
  }
  const natText = nat => { const n = X().Dex.natures.get(nat); return n && n.plus ? `${nat} (+${LB[n.plus]} −${LB[n.minus]})` : (nat || "—"); };
  // Bolita de color por resultado (verde ganado, gris empate, rojo perdido), sin letra; el texto va en el título para accesibilidad
  const WORD = { V: "Victoria", E: "Empate", D: "Derrota" };
  const dot = r => `<i class="f${r}" title="${WORD[r]}" aria-label="${WORD[r]}"></i>`;
  const formDots = pid => { const s = streakOf(pid); return s.last5.length ? `<div class="lh-form" title="Últimos partidos">${s.last5.map(r => `${dot(r)}`).join("")}</div>` : ""; };
  const optParts = (c, sel) => A.partsOf(c).map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const roundOf = (c, tieId) => c.ko && c.ko.rounds.find(r => r.ties.some(t => t.id === tieId));

  // ---------- Dibujo general ----------
  function render() {
    if (!root) return;
    const l = L(), c = C();
    if (detail && !part(detail)) detail = null;
    if (!newCol) newCol = A.COLORS[0];
    const tabs = [["comp", c.type === "liga" ? "🏆 Clasificación" : c.type === "copa" ? "🏆 Cuadro" : "🏆 Competición"], ["calendario", "📅 Calendario"], ["equipo", "🛡 Equipo"], ["objetos", "🎒 Objetos"], ["entrenadores", "👥 Entrenadores"], ["stats", "📊 Estadísticas"], ["tienda", "🪙 Tienda"], ["historial", "📜 Historial"], ["ajustes", "⚙ Ajustes"]];
    const ps = A.partsOf(c);
    root.innerHTML = `
    <div class="topbar"><button class="btn ghost" id="lhBack">← Inicio</button><h2>🏟 Liga</h2><button class="btn ghost" id="lhGoRom">🎮 Editor ROM</button></div>
    <div class="lh-chips comps">${l.comps.map(x => `<button class="lh-chip comp ${x.id === c.id ? "on" : ""}" data-comp="${x.id}">${compIc(x)} ${esc(x.name)}</button>`).join("")}<button class="lh-chip add" id="lhCompNew">+ Competición</button></div>
    ${creating ? creator() : ""}
    <header class="lh-hero t-${c.type}" style="--cc:${compColor(c)}">
      <div class="lh-trophy" aria-hidden="true">${compIc(c)}</div>
      <div class="lh-ht"><small>${esc(TY()[c.type][1].toUpperCase())} · ${esc(c.season.name)}</small>
        <input id="lhCompName" class="lh-season" value="${esc(c.name)}" maxlength="28" aria-label="Nombre de la competición">
        <p>${ps.length} participante${ps.length === 1 ? "" : "s"} · ${c.matches.length} combate${c.matches.length === 1 ? "" : "s"} · ${esc(A.jor().name)}</p>${meChip()}</div>
    </header>
    <nav class="lh-tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" class="lh-tab ${tab === k ? "on" : ""}" data-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join("")}</nav>
    <section class="lh-body">${tab === "comp" ? compTab(c) : tab === "calendario" ? calendario(c) : tab === "equipo" ? equipo(c) : tab === "objetos" ? objetos(c) : tab === "entrenadores" ? (detail ? detalle(part(detail), c) : entrenadores(c)) : tab === "stats" ? estadisticas(c) : tab === "tienda" ? tienda() : tab === "historial" ? historial() : ajustes(c)}</section>`;
    A.paintIcons(root);
  }
  function creator() {
    const info = { liga: "Todos contra todos, a 1 o 2 vueltas, con clasificación y zonas de ascenso, playoff y descenso.", copa: "Eliminatorias con sorteo de cuadro: partido único o ida y vuelta (la final es a partido único).",
      champions: "Formato nuevo de la Champions: fase de liga donde cada uno juega unos cuantos rivales distintos, los mejores pasan directos, los siguientes juegan un playoff y luego eliminatorias." };
    return `<div class="lh-card"><div class="lh-ch"><b>Nueva competición</b></div>
      <input id="lhCName" class="lh-in" maxlength="28" placeholder="Nombre (por ejemplo: Liga de invierno)" autocomplete="off">
      <div class="lh-row"><select id="lhCType" aria-label="Tipo">${Object.entries(TY()).map(([k, v]) => `<option value="${k}" ${k === ncType ? "selected" : ""}>${v[0]} ${v[1]}</option>`).join("")}</select></div>
      <p class="lh-note">${info[ncType]} Empieza con todos tus entrenadores; luego eliges quién participa en Ajustes.</p>
      <label class="lh-chk"><input type="checkbox" id="lhCDraw" checked> 🎲 Sortear Pokémon a los entrenadores que no tengan (te pedirá el porcentaje de calidad de cada uno y dará ${LigaSorteo.opts(L().sorteo).size} Pokémon). Los que controla su jugador se sortean ellos mismos.</label>
      <div class="lh-acts"><button class="btn sm gold" id="lhCCreate">Crear</button><button class="btn sm ghost" id="lhCCancel">Cancelar</button></div></div>`;
  }
  function meChip() {
    const l = L(), me = l.me && part(l.me); if (!me) return "";
    const s = streakOf(me.id);
    return `<p class="lh-mechip">⭐ ${esc(me.name)} · ${s.kind === "V" && s.n >= 2 ? "🔥 " : ""}${esc(LigaCal.streakText(s))}</p>`;
  }
  function jornadaChips(c) {
    return `<div class="lh-chips">${c.jornadas.map(j => `<button class="lh-chip ${j.id === c.cur ? "on" : ""}" data-j="${j.id}">${esc(j.name)}</button>`).join("")}${c.type === "liga" ? `<button class="lh-chip add" id="lhJnew">+ Nueva</button>` : ""}</div>`;
  }

  // ---------- Tabla de clasificación con zonas ----------
  const ZN = { asc: "Ascenso", po: "Playoff", desc: "Descenso" };
  function tabla(st, c, o) {
    o = o || {};
    const zones = o.zones || A.zonesOf(c), zc = LigaCal.zones(st.length, zones), meId = L().me;
    const labels = c.type === "champions" ? { asc: "Directos", po: "Playoff", desc: "Eliminados" } : ZN;
    const used = ["asc", "po", "desc"].filter(z => zc.includes(z));
    return `<div class="lh-tw"><table class="lh-t lh-cl"><thead><tr><th>#</th><th>Entrenador</th><th>PJ</th><th>V</th><th>E</th><th>D</th><th>GF</th><th>GC</th><th>Pts</th></tr></thead><tbody>${st.map((r, i) => {
      const z = zc[i], res = o.resOf ? o.resOf(r.id) : LigaCal.results(c.matches.filter(m => !m.t), r.id);
      const dots = res.length ? `<span class="lh-form">${res.slice(-5).map(x => `${dot(x)}`).join("")}</span>` : "";
      return `<tr class="${z ? "z-" + z : ""} ${i === 0 && r.pj ? "lead" : ""}" ${o.noOpen ? "" : `data-open="${r.id}"`}><td><span class="lh-pos">${i === 0 && r.pj ? "🏆" : i + 1}</span></td>
        <td class="lh-nm"><div class="lh-nmc">${(pp => pp ? pav(pp) : "")(o.partOf ? o.partOf(r.id) : part(r.id))}<div class="lh-nmt"><b>${meId && r.id === meId ? "⭐ " : ""}${esc(r.name)}</b>${dots}</div></div></td><td>${r.pj}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.gf == null ? "–" : r.gf}</td><td>${r.gc == null ? "–" : r.gc}</td><td><b>${r.pts}</b></td></tr>`;
    }).join("")}</tbody></table></div>
    ${used.length ? `<div class="lh-leg">${used.map(z => `<span><i class="z-${z}"></i>${labels[z]} <small>(${zc.filter(x => x === z).length})</small></span>`).join("")}</div>` : (st.length < 4 ? `<p class="lh-note">Con 4 o más entrenadores se marcan las zonas.</p>` : "")}`;
  }
  // ---------- Pestaña de competición ----------
  function compTab(c) {
    if (!A.partsOf(c).length) return `<div class="lh-card"><p class="lh-empty">Esta competición no tiene participantes. Elígelos en <b>Ajustes</b> o añade entrenadores en la pestaña Entrenadores.</p></div>`;
    return c.type === "copa" ? copaView(c) : c.type === "champions" ? champView(c) : ligaView(c);
  }
  // En el centro de un combate: el marcador si se anotó, o «vs» / «=»
  const scoreMid = m => A.hasScore(m) ? `<i class="lh-sc">${m.ga}–${m.gb}</i>` : `<i>${m.w === "d" ? "=" : "vs"}</i>`;
  function matchRow(m, del, c) {
    const a = part(m.a), b = part(m.b), tie = m.t && roundOf(c, m.t);
    return `<div class="lh-m ${m.w === "d" ? "d" : ""}"><span class="lh-ms"><span class="${m.w === "a" ? "win" : ""}">${a ? ic(a) : ""} <b>${esc(nm(m.a))}</b></span>${scoreMid(m)}<span class="${m.w === "b" ? "win" : ""}">${b ? ic(b) : ""} <b>${esc(nm(m.b))}</b></span>${tie ? `<small class="lh-note">${esc(tie.name)}</small>` : ""}</span>${del && !m.t ? `<button class="lh-edit" data-medit="${m.id}" aria-label="Editar marcador" title="Editar marcador">✎</button>` : ""}${del ? `<button class="lh-x" data-mid="${m.id}" aria-label="Borrar combate">×</button>` : ""}</div>`;
  }
  function matchesCard(c) {
    const j = A.jor(), cur = c.matches.filter(m => m.j === c.cur);
    const manual = c.type === "liga" || (c.type === "champions" && !c.ko);
    return `<div class="lh-card"><div class="lh-ch"><b>Combates de ${esc(j.name)}</b></div>
      <div class="lh-ml">${cur.length ? cur.map(m => matchRow(m, true, c)).join("") : `<p class="lh-empty">Sin combates anotados en esta jornada.</p>`}</div>
      ${manual && A.partsOf(c).length >= 2 ? `<details class="lh-det"><summary>➕ Anotar un combate</summary>
        <p class="lh-note">Los combates se juegan en la ROM: al terminar, anota aquí quién ganó.</p>
        <div class="lh-row"><select id="lhMA" aria-label="Entrenador A">${optParts(c, c.partIds[0])}</select><span>vs</span><select id="lhMB" aria-label="Entrenador B">${optParts(c, c.partIds[1])}</select></div>
        <div class="lh-row"><select id="lhMR" aria-label="Resultado"><option value="a">Gana el primero</option><option value="b">Gana el segundo</option><option value="d">Empate</option></select><button class="btn sm gold" id="lhMAdd">Anotar</button></div></details>` : ""}</div>`;
  }
  function optionsCard(c) {
    const j = A.jor();
    return `<details class="lh-card lh-det"><summary><b>Jornada y cierre de ${c.type === "copa" ? "la edición" : "la temporada"}</b></summary>
      <div class="lh-row"><input id="lhJn" value="${esc(j.name)}" maxlength="28" aria-label="Nombre de la jornada"><button class="btn sm ghost" id="lhJdel" ${c.jornadas.length > 1 && c.type === "liga" ? "" : "disabled"}>Borrar esta jornada</button></div>
      <p class="lh-note">Al cerrar ${c.type === "copa" ? "la edición" : "la temporada"} se guarda en el Historial (clasificación, combates, cuadro y equipos) y empieza otra con los mismos entrenadores. Las monedas se conservan.</p>
      <button class="btn sm danger" id="lhClose">🏁 Cerrar ${c.type === "copa" ? "edición" : "temporada"} y empezar otra</button></details>`;
  }
  // La pestaña de clasificación solo lleva la tabla; los combates, el cara a cara y el cierre están en Calendario y Ajustes.
  function ligaView(c) {
    const j = A.jor(), sc = scope === "j" ? c.cur : "", st = A.standings(sc, c);
    return `${jornadaChips(c)}
    <div class="lh-card"><div class="lh-ch"><b>Clasificación</b>
        <select id="lhScope" aria-label="Alcance"><option value="all" ${sc ? "" : "selected"}>Toda la temporada</option><option value="j" ${sc ? "selected" : ""}>Solo «${esc(j.name)}»</option></select></div>
      ${tabla(st, c)}</div>`;
  }
  function h2hCard(c) {
    const h = A.headToHead(c);
    return h.length ? `<details class="lh-card lh-det"><summary><b>Cara a cara</b></summary><div class="lh-ml">${h.map(o => `<div class="lh-m"><span><b>${esc(nm(o.x))}</b> ${o.vx} – ${o.vy} <b>${esc(nm(o.y))}</b>${o.e ? ` <small>(${o.e} empate${o.e === 1 ? "" : "s"})</small>` : ""}</span></div>`).join("")}</div></details>` : "";
  }

  // ----- Cuadro de eliminatorias (copa y Champions) -----
  function tieCard(t, r, c) {
    const info = LigaCal.tieInfo(t, r.legs, c.matches), fx = c.fixtures.filter(f => f.t === t.id).sort((x, y) => x.leg - y.leg);
    const side = (id, w) => `<div class="lh-ts ${info.winner && info.winner === id ? "win" : info.winner ? "lose" : ""}">${id ? `${pav(part(id) || { color: "#6b7a90", emoji: "?" })}<b>${esc(nm(id))}</b>` : `<span class="lh-tbd">Por definir</span>`}<em>${id && !info.bye ? w : ""}</em></div>`;
    return `<div class="lh-tie ${info.winner ? "done" : ""}">${side(t.a, info.wa)}${side(t.b, info.wb)}
      ${info.bye ? `<small class="lh-note">Pasa directo a la siguiente ronda</small>` : ""}
      ${info.needTiebreak ? `<div class="lh-tb"><small>Empatados: elige quién pasa (penaltis)</small><div class="lh-acts"><button class="btn sm gold" data-tb="${t.id}|${t.a}">Pasa ${esc(nm(t.a))}</button><button class="btn sm gold" data-tb="${t.id}|${t.b}">Pasa ${esc(nm(t.b))}</button></div></div>` : ""}
      ${fx.map(f => fxRow(f, null, c, true)).join("")}</div>`;
  }
  function bracket(c) {
    if (!c.ko) return "";
    LigaCal.advance(c.ko, c.matches);
    return c.ko.rounds.map(r => `<div class="lh-card"><div class="lh-ch"><b>${esc(r.name)}</b><span class="lh-note">${r.legs === 2 ? "ida y vuelta" : "partido único"}</span></div><div class="lh-ties">${r.ties.map(t => tieCard(t, r, c)).join("")}</div></div>`).join("");
  }
  const champBanner = c => { const id = c.ko && LigaCal.champion(c.ko, c.matches); return id ? `<div class="lh-champ"><span>🏆</span><div><small>CAMPEÓN</small><b>${esc(nm(id))}</b></div></div>` : ""; };

  function copaView(c) {
    const n = A.partsOf(c).length;
    if (!c.ko) return `<div class="lh-card"><div class="lh-ch"><b>Sorteo del cuadro</b></div>
      <p class="lh-note">${n} participante${n === 1 ? "" : "s"}. ${n > 1 && (n & (n - 1)) ? `Como no son potencia de 2, los ${LigaCal.nextPow2(n) - n} primeros del sorteo pasan directos a la 2.ª ronda.` : ""}</p>
      <div class="lh-row"><select id="lhSeed" aria-label="Sorteo"><option value="sorteo" ${c.seeding === "sorteo" ? "selected" : ""}>🎲 Sorteo aleatorio</option><option value="lista" ${c.seeding === "lista" ? "selected" : ""}>Por orden de la lista</option></select>
        <select id="lhLegs" aria-label="Partidos por eliminatoria"><option value="1" ${c.legs === 1 ? "selected" : ""}>Partido único</option><option value="2" ${c.legs === 2 ? "selected" : ""}>Ida y vuelta (final única)</option></select></div>
      <button class="btn gold" id="lhGenCup" ${n >= 2 ? "" : "disabled"}>🎲 ${c.seeding === "sorteo" ? "Sortear cuadro" : "Generar cuadro"}</button></div>`;
    return `${champBanner(c)}${bracket(c)}${c.draw && !c.matches.length ? `<div class="lh-card"><div class="lh-acts"><button class="btn sm ghost" id="lhGenCup">🎲 Volver a sortear</button></div></div>` : ""}`;
  }
  function champView(c) {
    const n = A.partsOf(c).length, pr = LigaCal.champParams(n), m = n % 2 ? n : n - 1, st = A.standings("", c), pend = c.fixtures.filter(f => !f.t).length;
    const setup = !c.fixtures.length && !c.matches.length && !c.ko;
    const rn = Math.min(c.rounds || 8, m);
    const name = pr ? LigaCal.roundName(pr.direct) : "";
    return `${c.ko ? champBanner(c) : ""}
    ${n < 3 ? `<div class="lh-card"><p class="lh-empty">La Champions necesita al menos 3 entrenadores.</p></div>` : `
    <div class="lh-card"><div class="lh-ch"><b>Formato</b></div>
      <p class="lh-note">${n} participantes: <b>fase de liga</b> (cada uno juega ${rn} rivales distintos) → los <b>${pr.direct} primeros</b> pasan directos a ${name.toLowerCase()}; del <b>${pr.direct + 1}.º al ${pr.direct + pr.playoff}.º</b> juegan un <b>playoff</b> a ida y vuelta${pr.out ? `; los ${pr.out} últimos quedan eliminados` : ""}. Después, eliminatorias hasta la final.</p>
      ${setup ? `<div class="lh-row"><select id="lhRounds" aria-label="Partidos en la fase de liga">${Array.from({ length: m }, (_, i) => i + 1).map(k => `<option value="${k}" ${k === rn ? "selected" : ""}>${k} partido${k === 1 ? "" : "s"} por entrenador</option>`).join("")}</select></div>
        <button class="btn gold" id="lhGenCL">📅 Generar fase de liga</button>` : ""}</div>`}
    ${c.fixtures.length || c.matches.length ? `<div class="lh-card"><div class="lh-ch"><b>Fase de liga</b></div>${tabla(st, c)}
      ${!c.ko ? `<p class="lh-note">${pend ? `Quedan ${pend} partido${pend === 1 ? "" : "s"} de la fase de liga (en la pestaña Calendario).` : "Fase de liga completa."}</p>
        <button class="btn sm gold" id="lhGenCK" ${c.matches.some(x => !x.t) ? "" : "disabled"}>⚔ Generar eliminatorias con esta clasificación</button>` : ""}</div>` : ""}
    ${bracket(c)}`;
  }

  // ---------- Tarjetas y estadísticas de Pokémon ----------
  const toOpts = r => r ? { xa: r.xa || undefined, xb: r.xb || undefined, ga: r.ga, gb: r.gb } : {};
  const askFor = (c, a, b, w, jid, onOk) => A.askMatch({ aName: nm(a), bName: nm(b), ...A.matchInfo(c, a, b, jid), w, onOk });
  function cardLine(o) {
    if (!o) return `<div class="lh-cards"><span>PJ 0</span><span>🟨 0</span></div>`;
    return `<div class="lh-cards"><span>PJ ${o.pj}</span><span>🟨 ${o.yt}</span>${o.sanc ? `<span>🟥 ${o.sanc}</span>` : ""}${o.susp ? `<span class="sus">🟥 Sancionado: se pierde el próximo partido</span>` : o.y ? `<span class="warn">🟨 ${o.y}/2 hacia sanción</span>` : ""}</div>`;
  }
  function susNote(c, f) {
    const mi = A.matchInfo(c, f.a, f.b, f.j), out = [];
    if (mi.aSusp.size) out.push(`${esc(nm(f.a))}: ${[...mi.aSusp].map(s => esc(X().nmSp(s))).join(", ")}`);
    if (mi.bSusp.size) out.push(`${esc(nm(f.b))}: ${[...mi.bSusp].map(s => esc(X().nmSp(s))).join(", ")}`);
    return out.length ? `<small class="lh-sus">🟥 Sancionados (no juegan): ${out.join(" · ")}</small>` : "";
  }
  // Una fila por Pokémon: partidos jugados, amarillas y sanciones (de esta competición o de todas).
  function statRows(c) {
    const l = L(), map = {}, comps = stScope === "all" ? l.comps : [c];
    for (const cc of comps) {
      const st = A.cardState(cc);
      for (const p of A.partsOf(cc)) {
        const own = st[p.id] || {};
        const keys = new Set([...Object.keys(own), ...A.teamOf(p, cc.cur).map(s => s.species)]);
        for (const sp of keys) {
          const o = own[sp] || { pj: 0, y: 0, yt: 0, sanc: 0, susp: 0 }, k = p.id + "|" + sp, r = map[k] || (map[k] = { pid: p.id, sp, pj: 0, y: 0, yt: 0, sanc: 0, susp: 0 });
          r.pj += o.pj; r.yt += o.yt; r.sanc += o.sanc; r.y += o.y; r.susp += o.susp;
        }
      }
    }
    const key = { pj: "pj", yt: "yt", sanc: "sanc" }[stSort] || "pj";
    return Object.values(map).sort((x, y) => y[key] - x[key] || y.yt - x.yt || y.pj - x.pj || x.sp.localeCompare(y.sp));
  }
  function estadisticas(c) {
    const l = L(), rows = statRows(c), who = id => { const p = part(id); return p ? `${ic(p)} ${esc(p.name)}` : ""; };
    const top = (key, n) => rows.filter(r => r[key] > 0).sort((x, y) => y[key] - x[key]).slice(0, n);
    const mini = (title, list, fmt) => `<div class="lh-card"><div class="lh-ch"><b>${title}</b></div>${list.length ? list.map((r, i) => `<div class="lh-st-row"><span class="lh-st-n">${i + 1}</span><span class="lh-st-ic" data-sp="${esc(r.sp)}" data-size="32" data-card="${A.cardClass(r)}"></span><span class="lh-st-nm"><b>${esc(X().nmSp(r.sp))}</b><small>${who(r.pid)}</small></span><b>${fmt(r)}</b></div>`).join("") : `<p class="lh-empty">Todavía no hay datos.</p>`}</div>`;
    const sus = rows.filter(r => r.susp > 0);
    return `<div class="lh-card"><div class="lh-ch"><b>Estadísticas de los Pokémon</b></div>
      <div class="lh-row"><select id="lhStScope" aria-label="Competiciones"><option value="comp" ${stScope === "comp" ? "selected" : ""}>${esc(c.name)}</option><option value="all" ${stScope === "all" ? "selected" : ""}>Todas las competiciones</option></select>
        <select id="lhStSort" aria-label="Ordenar por"><option value="pj" ${stSort === "pj" ? "selected" : ""}>Más partidos jugados</option><option value="yt" ${stSort === "yt" ? "selected" : ""}>Más amarillas</option><option value="sanc" ${stSort === "sanc" ? "selected" : ""}>Más sanciones</option></select></div>
      <p class="lh-note">Cada Pokémon que se debilita recibe una 🟨. A la 2.ª se pierde el siguiente partido (🟥) y no se incluye en el equipo que se exporta a la ROM. Se anotan al registrar cada combate.</p></div>
    ${sus.length ? `<div class="lh-card"><div class="lh-ch"><b>🟥 Sancionados ahora</b></div>${sus.map(r => `<div class="lh-st-row"><span class="lh-st-ic" data-sp="${esc(r.sp)}" data-size="32" data-card="${A.cardClass(r)}"></span><span class="lh-st-nm"><b>${esc(X().nmSp(r.sp))}</b><small>${who(r.pid)}</small></span><b>se pierde el próximo partido</b></div>`).join("")}</div>` : ""}
    ${mini("⚔ Más partidos jugados", top("pj", 5), r => r.pj + " PJ")}
    ${mini("🟨 Más amarillas", top("yt", 5), r => "🟨 " + r.yt)}
    <div class="lh-card"><div class="lh-ch"><b>Todos los Pokémon</b><span class="lh-note">${rows.length}</span></div>
      ${rows.length ? `<div class="lh-tw"><table class="lh-t lh-stt"><thead><tr><th>Pokémon</th><th>PJ</th><th>🟨</th><th>🟥</th><th>Estado</th></tr></thead><tbody>${rows.map(r => `<tr><td class="lh-nm"><span class="lh-st-ic" data-sp="${esc(r.sp)}" data-size="28" data-card="${A.cardClass(r)}"></span><span><b>${esc(X().nmSp(r.sp))}</b><small>${who(r.pid)}</small></span></td><td>${r.pj}</td><td>${r.yt}</td><td>${r.sanc}</td><td>${r.susp ? "🟥 Sancionado" : r.y ? "🟨 " + r.y + "/2" : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="lh-empty">Aún no hay Pokémon en los equipos de esta competición.</p>`}</div>`;
  }

  // ---------- Calendario y rachas ----------
  function fxRow(f, meId, c, inTie) {
    const a = part(f.a), b = part(f.b), l = L(), jn = (c.jornadas.find(j => j.id === f.j) || {}).name || "";
    if (!a || !b) return "";
    const rd = f.t ? roundOf(c, f.t) : null, draw = !rd || rd.legs === 2;
    const mine = meId && (f.a === meId || f.b === meId), rival = mine ? (f.a === meId ? b : a) : null;
    const dr = draw ? `<button class="btn sm ghost" data-fx="${f.id}" data-c="${c.id}" data-w="d">Empate</button>` : "";
    const btns = mine
      ? `<button class="btn sm gold" data-fx="${f.id}" data-c="${c.id}" data-w="${f.a === meId ? "a" : "b"}">🏆 Gané</button>${dr}<button class="btn sm ghost" data-fx="${f.id}" data-c="${c.id}" data-w="${f.a === meId ? "b" : "a"}">Perdí</button>`
      : `<button class="btn sm ghost" data-fx="${f.id}" data-c="${c.id}" data-w="a">Gana ${esc(a.name)}</button>${dr}<button class="btn sm ghost" data-fx="${f.id}" data-c="${c.id}" data-w="b">Gana ${esc(b.name)}</button>`;
    return `<div class="lh-fx ${inTie ? "in" : ""}"><div class="lh-fxh"><span class="lh-day ${f.date && dayTxt(f.date) === "Hoy" ? "hoy" : ""}">${f.date ? esc(dayTxt(f.date)) : "Sin fecha"}</span><small>${l.comps.length > 1 ? ICON(c.type) + " " + esc(c.name) + " · " : ""}${esc(jn)}</small>${f.t ? "" : `<button class="lh-x" data-fxdel="${f.id}" data-c="${c.id}" aria-label="Quitar partido">×</button>`}</div>
      <div class="lh-vs">${mine ? `<span>${pav(part(meId))}<b>Tú</b></span><i>vs</i><span>${pav(rival)}<b>${esc(rival.name)}</b></span>` : `<span>${pav(a)}<b>${esc(a.name)}</b></span><i>vs</i><span>${pav(b)}<b>${esc(b.name)}</b></span>`}</div>
      ${susNote(c, f)}
      <div class="lh-btns">${btns}</div></div>`;
  }
  function calendario(c) {
    const l = L(), j = A.jor(), me = l.me && part(l.me);
    const mine = [];
    if (me) l.comps.forEach(cc => LigaCal.upcoming(cc.fixtures, cc.jornadas).filter(f => f.a === me.id || f.b === me.id).forEach(f => mine.push({ f, cc })));
    mine.sort((x, y) => (x.f.date ? 0 : 1) - (y.f.date ? 0 : 1) || (x.f.date < y.f.date ? -1 : x.f.date > y.f.date ? 1 : 0));
    const sm = me ? streakOf(me.id) : null, resMe = me ? A.allResults(me.id) : [];
    const myStreak = !me ? `<p class="lh-empty">Elige quién eres para ver tus próximos partidos y tu racha.</p>` :
      `<div class="lh-streak"><div class="lh-sbig ${sm.kind}"><b>${sm.n || 0}</b><small>${sm.kind === "V" ? "victorias" : sm.kind === "D" ? "derrotas" : sm.kind === "E" ? "empates" : ""}</small></div>
        <div class="lh-sinfo"><b>${sm.kind === "V" && sm.n >= 2 ? "🔥 " : ""}${esc(LigaCal.streakText(sm))}</b>
          <div class="lh-form big">${sm.last5.map(r => `${dot(r)}`).join("") || "<small>—</small>"}</div>
          <small>Mejor racha de victorias: ${sm.bestWins} · ${resMe.filter(r => r === "V").length}V ${resMe.filter(r => r === "E").length}E ${resMe.filter(r => r === "D").length}D (todas las competiciones)</small></div></div>`;
    const pend = LigaCal.upcoming(c.fixtures, c.jornadas), byJ = {}; pend.forEach(f => (byJ[f.j] = byJ[f.j] || []).push(f));
    const all = c.jornadas.filter(x => byJ[x.id]).map(x => `<div class="lh-hj"><b>${esc(x.name)}${x.date ? " · " + esc(dayTxt(x.date)) : ""}</b>${byJ[x.id].map(f => fxRow(f, null, c)).join("")}</div>`).join("");
    const rows = l.parts.map(p => ({ p, s: streakOf(p.id) })).filter(r => r.s.kind).sort((x, y) => (y.s.kind === "V") - (x.s.kind === "V") || y.s.n - x.s.n);
    const ps = A.partsOf(c), n = ps.length, m = n % 2 ? n : n - 1;
    let gen = "";
    if (c.type === "liga") gen = `<div class="lh-row"><select id="lhVueltas" aria-label="Vueltas"><option value="1" ${c.vueltas === 1 ? "selected" : ""}>1 vuelta (${m} jornadas · ${n * (n - 1) / 2} partidos)</option><option value="2" ${c.vueltas === 2 ? "selected" : ""}>2 vueltas, ida y vuelta (${2 * m} jornadas · ${n * (n - 1)} partidos)</option></select></div>
      <div class="lh-acts"><button class="btn sm gold" id="lhGenLiga" ${n >= 2 ? "" : "disabled"}>📅 Generar calendario completo</button></div>
      <p class="lh-note">Crea todas las jornadas con sus partidos: nadie repite rival hasta completar la vuelta. Solo se puede si no hay combates anotados; al cerrar la temporada puedes generar otro.</p>`;
    else gen = c.type === "copa" ? `<p class="lh-note">Los partidos de la copa se crean solos al sortear el cuadro y según se van decidiendo las eliminatorias. Mira la pestaña Cuadro.</p>`
      : `<p class="lh-note">Los partidos de la Champions se generan en la pestaña Competición (fase de liga y eliminatorias).</p>`;
    return `${jornadaChips(c)}
    <div class="lh-card"><div class="lh-ch"><b>⭐ ${me ? esc(me.name) : "¿Quién eres?"}</b>
        <select id="lhMe" aria-label="Quién eres"><option value="">— Elegir —</option>${l.parts.map(p => `<option value="${p.id}" ${p.id === l.me ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>${myStreak}</div>

    <div class="lh-card"><div class="lh-ch"><b>Mis próximos partidos</b>${mine.length ? `<span class="lh-note">${mine.length} pendiente${mine.length === 1 ? "" : "s"}</span>` : ""}</div>
      ${me ? (mine.length ? mine.slice(0, 12).map(x => fxRow(x.f, me.id, x.cc)).join("") + (mine.length > 12 ? `<p class="lh-note">y ${mine.length - 12} más…</p>` : "") : `<p class="lh-empty">No tienes partidos pendientes en ninguna competición.</p>`) : `<p class="lh-empty">Elige quién eres arriba.</p>`}</div>

    <div class="lh-card"><div class="lh-ch"><b>Calendario de ${ICON(c.type)} ${esc(c.name)}</b></div>
      ${gen}
      <div class="lh-row"><label class="lh-lab">Fecha de ${esc(j.name)}<input type="date" id="lhJdate" value="${esc(j.date || "")}"></label></div>
      ${all || `<p class="lh-empty">No hay partidos pendientes.</p>`}
      ${c.type !== "copa" && n >= 2 ? `<details class="lh-det"><summary>➕ Añadir un partido a mano</summary>
        <div class="lh-row"><select id="lhFA" aria-label="Entrenador A">${optParts(c, c.partIds[0])}</select><span>vs</span><select id="lhFB" aria-label="Entrenador B">${optParts(c, c.partIds[1])}</select></div>
        <div class="lh-row"><input type="date" id="lhFD" aria-label="Fecha"><button class="btn sm gold" id="lhFxAdd">Añadir a ${esc(j.name)}</button></div></details>` : ""}
      ${A.partsOf(c).some(q => ctl(q) === "ia") ? `<div class="lh-acts"><button class="btn sm gold" id="lhAiPrep">🤖 Preparar las alineaciones de la IA</button></div><p class="lh-note">La IA elige sus 6 titulares de esta jornada según su rival y el siguiente (también lo hace sola al anotar un combate y al exportar a la ROM).</p>` : ""}
      ${c.fixtures.some(f => f.j === c.cur && !f.t) ? `<div class="lh-acts"><button class="btn sm ghost" id="lhFxClear">Quitar los pendientes de esta jornada</button></div>` : ""}</div>

    ${matchesCard(c)}
    ${h2hCard(c)}

    ${rows.length ? `<details class="lh-card lh-det" open><summary><b>Rachas de todos</b></summary><div class="lh-ml">${rows.map(r => `<div class="lh-m"><span>${ic(r.p)} <b>${esc(r.p.name)}</b></span><span>${r.s.kind === "V" && r.s.n >= 2 ? "🔥 " : ""}${esc(LigaCal.streakText(r.s))} ${formDots(r.p.id)}</span></div>`).join("")}</div></details>` : ""}`;
  }

  // Pide el porcentaje de calidad de cada entrenador al que se va a repartir y, con eso, reparte los Pokémon.
  function askRatings(targets, o, onOk) {
    const def = p => Math.max(1, p.rating != null ? p.rating : 50);
    const ov = document.createElement("div"); ov.className = "lg-ov";
    ov.innerHTML = `<div class="lg-sheet" role="dialog" aria-label="Porcentaje de calidad"><div class="lg-sh"><b>⚡ Porcentaje de calidad</b><button class="btn sm ghost" data-x>Cancelar</button></div>
      <p class="lg-note">Antes de repartir los Pokémon, indica el porcentaje de cada entrenador: con <b>90</b> le tocan los más fuertes (equipo de élite), con <b>50</b> unos medios y con <b>20</b> los más flojos.</p>
      <div class="lh-rtsheet">${targets.map(p => `<div class="lh-rt" data-id="${p.id}">${pav(p)}<b>${esc(p.name)}</b><input type="number" inputmode="numeric" min="1" max="100" step="1" value="${def(p)}" data-n aria-label="Porcentaje de ${esc(p.name)} (1 a 100)"><span class="lh-rtl">${esc(LigaSorteo.etiqueta(def(p)))}</span><input type="range" min="1" max="100" step="1" value="${def(p)}" data-r aria-label="Porcentaje de ${esc(p.name)}"></div>`).join("")}</div>
      <div class="lg-row"><small class="lg-note">Todos a:</small>${[30, 50, 70, 90].map(v => `<button class="btn sm ghost" data-all="${v}">${v}</button>`).join("")}<button class="btn sm ghost" data-rand>🎲 Al azar</button></div>
      <div class="lg-row"><button class="btn gold" data-ok>🎲 Repartir ${o.size} Pokémon${targets.length > 1 ? " a cada uno" : ""}</button></div></div>`;
    document.body.append(ov);
    // cualquier número del 1 al 100 (de 1 en 1): se puede escribir o mover el deslizador, y las dos cosas van juntas
    const set = (row, v, from) => { v = Math.max(1, Math.min(100, Math.round(v) || 1)); row.querySelector("[data-r]").value = v; if (from !== "n") row.querySelector("[data-n]").value = v; row.querySelector(".lh-rtl").textContent = LigaSorteo.etiqueta(v); };
    ov.addEventListener("input", e => { if (e.target.hasAttribute("data-r")) set(e.target.closest(".lh-rt"), +e.target.value); else if (e.target.hasAttribute("data-n")) { const v = +e.target.value; if (v >= 1) set(e.target.closest(".lh-rt"), v, "n"); } });
    ov.onclick = e => {
      if (e.target === ov || e.target.hasAttribute("data-x")) return ov.remove();
      if (e.target.dataset.all) return ov.querySelectorAll(".lh-rt").forEach(r => set(r, +e.target.dataset.all));
      if (e.target.hasAttribute("data-rand")) return ov.querySelectorAll(".lh-rt").forEach(r => set(r, 10 + Math.random() * 90));
      if (e.target.hasAttribute("data-ok")) { const m = {}; ov.querySelectorAll(".lh-rt").forEach(r => { m[r.dataset.id] = +r.querySelector("[data-r]").value; }); ov.remove(); onOk(m); }
    };
  }
  function drawFlow(c, targets, quiet) {
    if (!targets.length) { if (!quiet) alert("Nadie necesita equipo con estas opciones."); return; }
    const o = LigaSorteo.opts(L().sorteo);
    askRatings(targets, o, ratings => {
      const n = A.sortearEquipos(c, { only: targets.map(p => p.id), ratings });
      alert(`Sorteo hecho: ${n} entrenador${n === 1 ? "" : "es"} con ${o.size} Pokémon.`); A.refresh();
    });
  }

  // Megapiedras: no se sortean; el jugador se la equipa a un Pokémon cuando quiera (y se la puede quitar).
  const stonesFor = species => X().Dex.items.all().filter(i => i.exists && i.megaStone && i.megaStone[species]);
  const isStone = name => !!(name && (X().Dex.items.get(name) || {}).megaStone);
  // ---------- Objetos: dar a cada Pokémon el que se quiera, con su imagen ----------
  const itemPic = (name, cls) => { const u = name ? X().itemUrls(name) : []; return u.length ? `<img class="lh-ip ${cls || ""}" loading="lazy" alt="" src="${u[0]}" data-alt="${u[1]}" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}else this.style.visibility='hidden'">` : `<span class="lh-ip ${cls || ""} none">${name ? "🎒" : ""}</span>`; };
  function objetos(c) {
    const l = L(), ps = A.partsOf(c);
    if (!ps.length) return `<div class="lh-card"><p class="lh-empty">Esta competición no tiene participantes.</p></div>`;
    const p = eqPlayer(c), squad = A.teamOf(p), can = canEdit(p), k = A.startersCount(squad);
    const row = (m, i) => { const it = m.item ? X().Dex.items.get(m.item) : null; return `<div class="lh-orow">
        <div class="lh-ob"><span data-sp="${esc(m.species)}" data-size="48"></span><div><b>${esc(X().nmSp(m.species))}</b><small>${i < Math.max(k, 6) ? (i < k ? "Titular" : "Titular (sin elegir)") : "Suplente"}</small></div></div>
        <div class="lh-oi">${itemPic(m.item)}<div><b>${it && it.exists ? esc(X().nmItem(m.item)) : (m.item ? esc(m.item) : "Sin objeto")}</b><small>${it && it.exists ? esc(X().dItem(m.item)) : "Toca «Cambiar» para darle uno"}</small></div></div>
        ${can ? `<div class="lh-acts"><button class="btn sm gold" data-item="${i}">🎒 Cambiar</button>${m.item ? `<button class="btn sm ghost" data-itemx="${i}">✖ Quitar</button>` : ""}</div>` : ""}</div>`; };
    return `${jornadaChips(c)}
    <div class="lh-card"><div class="lh-ch"><b>${pav(p)} Objetos de ${l.me === p.id ? "mi equipo" : esc(p.name)}</b>
        <select id="lhEqP" aria-label="Entrenador">${ps.map(q => `<option value="${q.id}" ${q.id === p.id ? "selected" : ""}>${l.me === q.id ? "⭐ " : ""}${esc(q.name)}</option>`).join("")}</select></div>
      <p class="lh-note">Da a cada Pokémon el objeto que quieras en «${esc(c.name)}» · ${esc(A.jor().name)} (y las jornadas siguientes que heredan este equipo). Puedes repetir objetos.</p>
      ${lockNote(p)}</div>
    <div class="lh-card">${squad.length ? squad.map(row).join("") : `<p class="lh-empty">${emptyMsg(p)}</p>`}</div>`;
  }
  function pickItem(p, c, i) {
    const m = A.teamOf(p)[i]; if (!m) return;
    const X_ = X(), bat = new Set((X_.RITEMS || []).map(o => o.id));
    const items = X_.ITEMLIST.map(o => ({ label: X_.nmItem(o.name), sub: X_.dItem(o.name), name: o.name, pic: itemPic(o.name),
      cat: ["all"].concat(bat.has(o.id) ? ["bat"] : [], /berry$/i.test(o.name) ? ["ber"] : [], o.megaStone ? ["mega"] : []) }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
    A.pickSheet(`Objeto para ${X_.nmSp(m.species)}`, items, it => { A.setItem(p, c.cur, i, it.name); A.refresh(); }, [["all", "Todos"], ["bat", "Combate"], ["ber", "Bayas"], ["mega", "Megapiedras"]]);
  }
  function megaBtn(m, i) {
    const st = stonesFor(m.species); if (!st.length) return "";
    return `<button class="btn sm ${isStone(m.item) ? "gold" : "ghost"}" data-mega="${i}">💎 ${isStone(m.item) ? "Megapiedra: " + esc(X().nmItem(m.item)) : "Equipar megapiedra"}</button>`;
  }
  function pickMega(p, c, i) {
    const m = A.teamOf(p)[i]; if (!m) return;
    const items = stonesFor(m.species).map(it => { const mega = Object.values(it.megaStone || {})[0]; return { label: X().nmItem(it.name), sub: "Se convierte en " + (mega || "mega") + " en combate", name: it.name }; });
    if (isStone(m.item)) items.push({ label: "Quitar la megapiedra", sub: "El Pokémon se queda sin objeto", name: "" });
    A.pickSheet(`Megapiedra para ${X().nmSp(m.species)}`, items, it => { A.setItem(p, c.cur, i, it.name); A.refresh(); });
  }

  // ---------- Equipo: plantilla y 6 titulares ----------
  function eqPlayer(c) {
    const l = L(), ps = A.partsOf(c);
    return (eqP && ps.find(x => x.id === eqP)) || (l.me && ps.find(x => x.id === l.me)) || ps[0];
  }
  function equipo(c) {
    const l = L(), ps = A.partsOf(c);
    if (!ps.length) return `<div class="lh-card"><p class="lh-empty">Esta competición no tiene participantes.</p></div>`;
    const p = eqPlayer(c), squad = A.teamOf(p), k = A.startersCount(squad), st = squad.slice(0, k), bench = squad.slice(k), lu = A.lineup(c, p.id, c.cur), cs = A.cardState(c)[p.id];
    const can = canEdit(p);
    const roleBtns = (i) => !can ? "" : `<div class="lh-acts">${i < k ? `<button class="btn sm ghost" data-eq="down" data-i="${i}">✖ Quitar de titulares</button>` : `<button class="btn sm gold" data-eq="up" data-i="${i}">＋ Hacer titular</button>`}${megaBtn(squad[i], i)}</div>`;
    const slot = i => i < k ? `<button class="lh-slot on" ${can ? `data-eq="down" data-i="${i}"` : "disabled"} title="${esc(X().nmSp(squad[i].species))}"><span data-sp="${esc(squad[i].species)}" data-size="40"></span><small>${esc(X().nmSp(squad[i].species))}</small></button>` : `<div class="lh-slot"><small>—</small></div>`;
    const strip = squad.length ? `<div class="lh-card"><div class="lh-ch"><b>Mis 6 titulares</b><span class="lh-note">${k}/6</span></div><div class="lh-strip">${[0, 1, 2, 3, 4, 5].map(slot).join("")}</div>${k < 6 ? `<p class="lh-note">${k ? "Faltan " + (6 - k) + " por elegir" : "Aún no has elegido titulares"}: ${can ? "pulsa «Hacer titular» en un Pokémon de abajo. " : ""}Si no completas los 6, juegan los primeros de la lista.</p>` : ""}</div>` : "";
    const lineupNote = lu.out.length ? `<p class="lh-sus" style="text-align:left">🟥 Sancionados (no juegan el próximo partido): ${lu.out.map(m => esc(X().nmSp(m.species))).join(", ")}${lu.subs.length ? " · entran: " + lu.subs.map(m => esc(X().nmSp(m.species))).join(", ") : ""}</p>` : "";
    return `${jornadaChips(c)}
    <div class="lh-card"><div class="lh-ch"><b>${pav(p)} ${l.me === p.id ? "Mi equipo" : "Equipo de " + esc(p.name)}</b>
        <select id="lhEqP" aria-label="Entrenador">${ps.map(q => `<option value="${q.id}" ${q.id === p.id ? "selected" : ""}>${l.me === q.id ? "⭐ " : ""}${esc(q.name)}</option>`).join("")}</select></div>
      <p class="lh-note">Plantilla de hasta 12 Pokémon en «${esc(c.name)}» · ${esc(A.jor().name)}. Los <b>6 titulares</b> son los que juegan; el resto es el banquillo. Si un titular está sancionado (2 🟨), entra un suplente al exportar a la ROM.</p>
      ${lineupNote}
      ${lockNote(p)}
      ${canDraw(p) ? `<div class="lh-acts"><button class="btn sm gold" data-eqdraw="1">🎲 ${squad.length ? "Volver a sortear" : "Sortear"} ${l.me === p.id ? "mis" : "los"} Pokémon</button></div>` : ""}</div>
    ${strip}
    ${squad.length ? "" : `<div class="lh-card"><p class="lh-empty">${emptyMsg(p)}</p></div>`}
    ${k ? `<div class="lh-card"><div class="lh-ch"><b>Titulares</b><span class="lh-note">${k}/6</span></div>
      <div class="lh-mons">${st.map((m, i) => monCard(m, cs, `<span class="lh-role t">Titular ${i + 1}</span>${roleBtns(i)}`)).join("")}</div></div>` : ""}
    ${squad.length ? `<div class="lh-card"><div class="lh-ch"><b>${k ? "Banquillo" : "Plantilla"}</b><span class="lh-note">${bench.length}</span></div>
      ${bench.length ? `<div class="lh-mons">${bench.map((m, j) => monCard(m, cs, `<span class="lh-role">${k < 6 ? "Sin elegir" : "Suplente"}</span>${roleBtns(k + j)}`)).join("")}</div>` : `<p class="lh-empty">Todos son titulares.</p>`}</div>` : ""}`;
  }

  // ---------- Entrenadores ----------
  function entrenadores(c) {
    const l = L();
    return `${jornadaChips(c)}
    <div class="lh-grid">${l.parts.map(p => {
      const r = A.standings("", c).find(x => x.id === p.id), n = A.teamOf(p).length, inC = A.inComp(p, c), comps = l.comps.filter(x => A.inComp(p, x));
      return `<button class="lh-tc ${inC ? "" : "off"}" data-open="${p.id}" style="--c:${p.color}"><div class="lh-tch">${pav(p)}<b>${esc(p.name)}</b></div>
        <div class="lh-rec">${r ? `${rec(r)} · <b>${r.pts}</b> pts` : "No juega aquí"}</div>${formDots(p.id)}
        ${n ? `<div class="lh-icons" data-icons="${p.id}"></div>` : `<div class="lh-empty sm">Sin Pokémon</div>`}
        <small>${comps.map(x => ICON(x.type)).join(" ") || "Sin competición"} · 🪙 ${A.bal(p.id)}${p.rating != null ? " · ⚡ " + p.rating + "%" : ""}${ctl(p) === "self" ? " · 🔒" : ctl(p) === "ia" ? " · 🤖" : ""}</small></button>`;
    }).join("") || `<p class="lh-empty">Aún no hay entrenadores. Añade el primero abajo.</p>`}</div>
    ${sorteoCard(c)}
    <div class="lh-card"><div class="lh-ch"><b>Añadir entrenador</b></div>
      <input id="lhNew" class="lh-in" maxlength="16" placeholder="Nombre del entrenador" autocomplete="off">
      <div class="lh-emo col" id="lhCol">${A.COLORS.map(x => `<span data-c="${x}" style="background:${x}" class="${x === newCol ? "on" : ""}"></span>`).join("")}<label class="lh-cpick" title="Otro color"><input type="color" id="lhColNew" value="${/^#[0-9a-f]{6}$/i.test(newCol) ? newCol : "#2f7bff"}"></label></div>
      <label class="lh-lab" style="margin-bottom:6px">¿Quién lo controla?<select id="lhNewCtl"><option value="mine">🎮 Lo controlo yo</option><option value="self">🔒 Lo controla su jugador</option><option value="ia">🤖 La controla la IA</option></select></label>
      <p class="lh-note">Entra en «${esc(c.name)}»; en su ficha eliges en qué otras competiciones participa. Los entrenadores son también los jugadores de la pantalla de entrada.</p>
      <button class="btn gold sm" id="lhAdd">+ Añadir</button></div>`;
  }
  function sorteoCard(c) {
    const o = LigaSorteo.opts(L().sorteo), sel = (k, opts) => `<select data-so="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(o[k]) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select>`;
    const R = A.R(), all = A.partsOf(c), ps = all.filter(controllable), selfN = all.length - ps.length, vac = ps.filter(p => !A.teamOf(p).length).length;
    return `<details class="lh-card lh-det" id="lhSorteo" ${soOpen ? "open" : ""}><summary><b>🎲 Sorteo de equipos</b></summary>
      ${selfN ? `<p class="lh-lock">🔒 ${selfN} entrenador${selfN === 1 ? "" : "es"} lo controla${selfN === 1 ? "" : "n"} su${selfN === 1 ? "" : "s"} jugador${selfN === 1 ? "" : "es"}: no entra${selfN === 1 ? "" : "n"} en este sorteo y sortea${selfN === 1 ? "" : "n"} el suyo en la pestaña Equipo.</p>` : ""}
      <p class="lh-note">Reparte Pokémon al azar entre los participantes de «${esc(c.name)}» para ${esc(A.jor().name)} (las jornadas siguientes lo heredan). ${R.ready ? "Con la ROM abierta, solo salen Pokémon, ataques, habilidades y objetos que existen en ella." : "Abre la ROM en el Editor ROM para que solo salga lo que existe en el juego."}</p>
      <div class="lh-cfg">
        <label>A quién${sel("scope", [["empty", `Solo sin equipo (${vac})`], ["all", `Todos (${ps.length})`]])}</label>
        <label>Pokémon por equipo${sel("size", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => [n, n > 6 ? n + " (6 titulares + " + (n - 6) + " suplentes)" : n]))}</label>
        <label>Nivel<input type="number" inputmode="numeric" min="1" max="100" data-so="level" value="${o.level}"></label>
        <label>Hasta la generación${sel("gen", [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [n, n + ".ª"]))}</label>
        <label>Configuración${sel("mode", [["random", "🎲 Azar total (habilidad, objeto, naturaleza y ataques)"], ["coherent", "Coherente (habilidad de su especie, ataques sugeridos)"]])}</label></div>
      <p class="lh-note">⚡ <b>Antes de repartir</b> te pedirá el <b>porcentaje de calidad</b> de cada entrenador: con <b>90</b> le tocan los Pokémon más fuertes (como un equipo de élite), con <b>50</b> unos medios y con <b>20</b> los más flojos.</p>
      <label class="lh-chk"><input type="checkbox" data-so="final" ${o.final ? "checked" : ""}> Solo Pokémon totalmente evolucionados</label>
      <label class="lh-chk"><input type="checkbox" data-so="legend" ${o.legend ? "checked" : ""}> Permitir legendarios y míticos</label>
      <label class="lh-chk"><input type="checkbox" data-so="unique" ${o.unique ? "checked" : ""}> Sin repetir Pokémon (ni su familia) entre entrenadores</label>
      <button class="btn gold" id="lhSortear" ${ps.length ? "" : "disabled"}>🎲 Sortear equipos</button></details>`;
  }
  function monCard(m, cs, extra) {
    const Dex = X().Dex, sp = Dex.species.get(m.species), lvl = m.level || 50, ivs = m.ivs || {}, evs = m.evs || {};
    const stats = KS.map(k => ({ k, v: calcStat(k, sp.baseStats[k], ivs[k] == null ? 31 : ivs[k], evs[k] || 0, lvl, m.nature) }));
    const ab = Dex.abilities.get(m.ability), it = m.item ? Dex.items.get(m.item) : null;
    const evTxt = KS.filter(k => evs[k]).map(k => `${evs[k]} ${LB[k]}`).join(" / "), ivTxt = KS.filter(k => ivs[k] != null && ivs[k] !== 31).map(k => `${ivs[k]} ${LB[k]}`).join(" / ");
    return `<article class="lh-mon" style="--c:${X().tCol(sp.types[0])}">
      <div class="lh-mh"><div data-sp="${esc(m.species)}" data-size="64" data-card="${A.cardClass(cs && cs[m.species])}"></div>
        <div class="lh-mi"><b>${esc(X().nmSp(m.species))}</b><span>${sp.types.map(t => X().tchip(t)).join("")}</span><small>Nv. ${lvl}${m.shiny ? " · ✨" : ""}${m.teraType ? " · Tera " + esc(X().tES(m.teraType)) : ""}</small></div></div>
      <div class="lh-kv"><span>Habilidad</span><b>${esc(X().nmAb(m.ability))}</b><small>${esc(X().dAb(m.ability))}</small></div>
      <div class="lh-kv"><span>Objeto</span><b>${it ? esc(X().nmItem(m.item)) : "Ninguno"}</b><small>${it ? esc(X().dItem(m.item)) : ""}</small></div>
      <div class="lh-kv"><span>Naturaleza</span><b>${esc(natText(m.nature))}</b></div>
      <div class="lh-mv">${(m.moves || []).map(mv => { const d = Dex.moves.get(mv); return `<span class="lh-mvp" style="--c:${X().tCol(d.type)}"><b>${esc(X().nmMove(mv))}</b><small>${esc(X().tES(d.type))}${d.basePower ? " · " + d.basePower : ""}</small><small class="lh-md">${esc(X().dMove(mv))}</small></span>`; }).join("") || `<small>Sin ataques</small>`}</div>
      <div class="lh-st">${stats.map(s => `<div class="lh-sr"><span>${LB[s.k]}</span><div class="lh-bar"><i style="width:${Math.min(100, Math.round(s.v / (lvl * 2 + 110) * 100))}%"></i></div><b>${s.v}</b></div>`).join("")}</div>
      ${cardLine(cs && cs[m.species])}
      ${extra || ""}
      ${evTxt || ivTxt ? `<small class="lh-ev">${evTxt ? "EVs: " + esc(evTxt) : ""}${evTxt && ivTxt ? " · " : ""}${ivTxt ? "IVs: " + esc(ivTxt) : ""}</small>` : ""}</article>`;
  }
  function detalle(p, c) {
    const l = L(), st = A.standings("", c).find(r => r.id === p.id) || { v: 0, e: 0, d: 0, pts: 0, pj: 0 };
    const sets = A.teamOf(p), own = !!(p.teams && p.teams[c.cur] && p.teams[c.cur].length);
    const mine = []; l.comps.forEach(cc => cc.matches.forEach(m => { if (m.a === p.id || m.b === p.id) mine.push({ m, cc }); }));
    const log = (l.log || []).filter(x => x.p === p.id).slice(0, 8), R = A.R();
    return `<button class="btn ghost sm" id="lhBackList">← Entrenadores</button>
    <div class="lh-card lh-dh" style="--c:${p.color}"><div class="lh-dhh">${pav(p, "big")}<div><input class="lh-rename" data-rename value="${esc(p.name)}" maxlength="16" aria-label="Nombre">
        <div class="lh-pills"><span>${st.pj} PJ</span><span>${esc(LigaCal.streakText(streakOf(p.id)))}</span><span>${rec(st)}</span><span><b>${st.pts}</b> pts</span><span>🪙 ${A.bal(p.id)}</span></div></div></div>
      ${formDots(p.id)}${R.ready && A.slotOf(p) ? `<small class="lh-note">🎮 En la ROM: ${esc(A.trainerLabel(A.slotOf(p)))}</small>` : ""}</div>
    <div class="lh-card"><div class="lh-ch"><b>Escudo</b></div>
      <div class="lh-shield">${pav(p, "big")}<div class="lh-sbtn"><label class="btn sm gold">📷 Elegir imagen<input type="file" id="lhImgP" accept="image/*" hidden></label>
        ${p.img ? `<button class="btn sm ghost" data-act="rmimg">Quitar imagen</button>` : ""}</div></div>
      <div class="lh-emo col">${swatches("data-pc", p.color)}<label class="lh-cpick" title="Otro color"><input type="color" id="lhColP" value="${/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#2f7bff"}"></label></div>
      <p class="lh-note">Con imagen se ve tu escudo; sin ella, el emoji sobre el color elegido.</p></div>
    <div class="lh-card"><div class="lh-ch"><b>🎮 Quién lo controla</b></div>
      <div class="lh-acts">${Object.entries(CTL).map(([k, v]) => `<button class="btn sm ${ctl(p) === k ? "gold" : "ghost"}" data-ctl="${k}">${v[0]} ${v[1]}</button>`).join("")}</div>
      <p class="lh-note">${ctl(p) === "self" ? "Solo este jugador elige sus Pokémon, titulares y megapiedras (entrando con su jugador). Tú no puedes tocar su equipo." : ctl(p) === "ia" ? "El ordenador sortea su plantilla (con su porcentaje) y elige sus 6 titulares en cada jornada según su rival y el siguiente." : "Cualquiera que use la app puede gestionar su equipo (sorteo, titulares, megapiedras)."}</p></div>
    <div class="lh-card"><div class="lh-ch"><b>⚡ Calidad del equipo</b><span class="lh-note">${p.rating != null ? p.rating + "% · " + esc(LigaSorteo.etiqueta(p.rating)) : "Sin porcentaje"}</span></div>
      <div class="lh-rtrow"><input type="range" min="1" max="100" step="1" class="lh-range" data-rtp="${p.id}" value="${p.rating != null ? p.rating : 50}" aria-label="Porcentaje de calidad"><input type="number" inputmode="numeric" min="1" max="100" step="1" class="lh-rtnum" data-rtp="${p.id}" value="${p.rating != null ? p.rating : ""}" placeholder="50" aria-label="Porcentaje (1 a 100)"></div>
      <p class="lh-note">Sirve para el sorteo de equipos: con 90 le tocan los Pokémon más fuertes (como un equipo de élite) y con valores bajos, los más flojos. ${p.rating != null ? `<button class="btn sm ghost" data-act="rtclear">Quitar porcentaje</button>` : ""}</p></div>
    <div class="lh-card"><div class="lh-ch"><b>Participa en</b></div>
      <div class="lh-chips wrap">${l.comps.map(x => `<button class="lh-chip ${A.inComp(p, x) ? "on" : ""}" data-member="${x.id}">${A.inComp(p, x) ? "✓ " : ""}${ICON(x.type)} ${esc(x.name)}</button>`).join("")}</div>
      <p class="lh-note">Toca una competición para que entre o salga.</p></div>
    ${jornadaChips(c)}
    <div class="lh-card"><div class="lh-ch"><b>Equipo en ${esc(c.name)} · ${esc(A.jor().name)}</b><span class="lh-note">${Math.min(6, sets.length)} titulares${sets.length > 6 ? " + " + (sets.length - 6) + " suplentes" : ""}</span></div>
      ${lockNote(p)}
      ${canDraw(p) ? `<div class="lh-acts"><button class="btn sm gold" data-eqdraw="1">🎲 ${sets.length ? "Volver a sortear" : "Sortear Pokémon"}</button>
        ${canEdit(p) ? `${own ? `<button class="btn sm ghost" data-act="inherit">↩ Igual que la jornada anterior</button>` : ""}<button class="btn sm ghost" data-act="prof">👤 Traer de un jugador</button>` : ""}</div>` : ""}
      <p class="lh-note">${own ? "Titulares propios de esta jornada." : "Hereda los de la jornada anterior."} Elige tus 6 titulares en la pestaña Equipo.</p>
      <div class="lh-mons">${sets.map((m, i) => monCard(m, A.cardState(c)[p.id], `<span class="lh-role ${i < 6 ? "t" : ""}">${i < 6 ? "Titular " + (i + 1) : "Suplente"}</span>`)).join("") || `<p class="lh-empty">Este entrenador no tiene Pokémon todavía.</p>`}</div></div>
    <div class="lh-card"><div class="lh-ch"><b>Combates</b></div><div class="lh-ml">${mine.length ? mine.slice().reverse().slice(0, 30).map(x => `<div class="lh-mj"><small>${ICON(x.cc.type)} ${esc(x.cc.name)} · ${esc((x.cc.jornadas.find(j => j.id === x.m.j) || {}).name || "")}</small>${matchRow(x.m, false, x.cc)}</div>`).join("") : `<p class="lh-empty">Sin combates todavía.</p>`}</div></div>
    ${log.length ? `<details class="lh-card lh-det"><summary><b>Movimientos de monedas</b></summary><ul class="lh-log">${log.map(x => `<li><b>${x.d > 0 ? "+" : ""}${x.d}</b> ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}
    <div class="lh-acts"><button class="btn sm ${l.me === p.id ? "gold" : "ghost"}" data-act="me">${l.me === p.id ? "⭐ Eres tú" : "⭐ Este soy yo"}</button></div>
    <button class="btn sm danger" data-act="del">🗑 Quitar a este entrenador de la liga</button>`;
  }

  // ---------- Tienda ----------
  const shopEnv = () => { const R = A.R(); return { Dex: X().Dex, abils: X().ABILS, natures: X().NATURES, moves: X().MOVES, items: X().RITEMS, learnable: X().learnable,
    ok: (k, o) => !R.ready || (k === "ability" ? R.res.ability(o) : k === "move" ? R.res.move(o) : R.res.item(o)) >= 0 }; };
  function tienda() {
    const l = L(), c = C();
    if (!l.parts.length) return `<p class="lh-empty">Añade entrenadores para darles monedas.</p>`;
    const p = shopPlayer(), cf = A.cfg(), env = shopEnv(), sets = A.teamOf(p), can = canEdit(p);
    const mons = sets.map((m, i) => `<div class="lh-sm"><div class="lh-smh"><span data-sp="${esc(m.species)}" data-size="40"></span><div><b>${esc(X().nmSp(m.species))}</b><small>${esc(X().nmAb(m.ability))} · ${esc(m.nature || "—")} · ${m.item ? esc(X().nmItem(m.item)) : "sin objeto"}</small>
        <small>${(m.moves || []).map(v => esc(X().nmMove(v))).join(" / ") || "sin ataques"}</small></div></div>
      ${can ? `<div class="lh-btns">${["ab", "natR", "nat", "mvR", "mv", "itR", "iv"].map(k => {
        const price = cf.prices[k], why = LigaShop.why(k, m, env), dis = A.bal(p.id) < price || why;
        return `<button class="btn sm ${dis ? "ghost" : ""}" data-shop="${k}" data-i="${i}" ${dis ? "disabled" : ""} title="${esc(why)}">${esc(LigaShop.LABELS[k])} · 🪙${price}</button>`;
      }).join("")}</div>` : ""}</div>`).join("");
    const log = (l.log || []).filter(x => x.p === p.id).slice(0, 12);
    return `<div class="lh-card"><div class="lh-ch"><b>Monedas</b></div>
      <p class="lh-note">Las monedas son de cada entrenador y valen para todas las competiciones. Cada combate anotado da monedas; se gastan en retocar los Pokémon de la jornada actual de «${esc(c.name)}» (los cambios pasan a las jornadas siguientes).</p>
      <div class="lh-row"><select id="lhSP" aria-label="Entrenador">${l.parts.map(q => `<option value="${q.id}" ${q.id === p.id ? "selected" : ""}>${esc(q.name)} · 🪙${A.bal(q.id)}</option>`).join("")}</select></div>
      <div class="lh-row"><input id="lhCoinN" type="number" inputmode="numeric" min="1" value="50" aria-label="Cantidad"><button class="btn sm" id="lhCoinGive">Dar monedas</button><button class="btn sm ghost" id="lhCoinTake">Quitar</button></div></div>
    <div class="lh-card"><div class="lh-ch"><b>Retocar Pokémon de ${esc(p.name)}</b></div>${lockNote(p)}${mons || `<p class="lh-empty">No tiene Pokémon en «${esc(A.jor().name)}».</p>`}</div>
    ${log.length ? `<details class="lh-card lh-det"><summary><b>Últimos movimientos</b></summary><ul class="lh-log">${log.map(x => `<li><b>${x.d > 0 ? "+" : ""}${x.d}</b> ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}`;
  }

  // ---------- Historial ----------
  const snapTeam = (s, pid, jid) => { const o = (s.teams || {})[pid] || {}; for (let i = s.jornadas.findIndex(j => j.id === jid); i >= 0; i--) if (o[s.jornadas[i].id]) return o[s.jornadas[i].id]; return []; };
  function historial() {
    const l = L(), all = [];
    l.comps.forEach(c => c.history.forEach(s => all.push({ s, c })));
    all.sort((x, y) => y.s.closedAt - x.s.closedAt);
    if (!all.length) return `<p class="lh-empty">Aquí aparecerán las temporadas y copas cerradas, con su clasificación, cuadro, combates y equipos.</p>`;
    return all.map(({ s, c }) => {
      const open = openHist === s.id, champ = s.standings[0], nmS = id => (s.parts.find(p => p.id === id) || { name: "(borrado)" }).name;
      const win = s.champion ? "Campeón: " + nmS(s.champion) : (champ && champ.pj ? "Campeón: " + champ.name + " · " + champ.pts + " pts" : "Sin combates");
      return `<div class="lh-card lh-hs"><button class="lh-hsh" data-hist="${s.id}"><span class="lh-hst">${ICON(s.type || c.type)}</span><span><b>${esc(c.name)} · ${esc(s.name)}</b><small>${esc(win)} · ${s.matches.length} combates · ${esc(fmtDate(s.closedAt))}</small></span><i>${open ? "▲" : "▼"}</i></button>
        ${open ? histBody(s) : ""}</div>`;
    }).join("");
  }
  function histBody(s) {
    const nmS = id => (s.parts.find(p => p.id === id) || { name: "(borrado)" }).name, emS = id => { const p = s.parts.find(q => q.id === id); return p ? ic(p) : ""; };
    const ctx = { matches: s.matches, type: s.type };
    const table = s.standings.some(r => r.pj) ? tabla(s.standings, { type: s.type, matches: s.matches }, { zones: s.zones, noOpen: true, partOf: id => s.parts.find(p => p.id === id), resOf: id => LigaCal.results(s.matches.filter(m => !m.t), id) }) : "";
    const ko = s.ko ? s.ko.rounds.map(r => `<div class="lh-hj"><b>${esc(r.name)}</b>${r.ties.map(t => { const i = LigaCal.tieInfo(t, r.legs, s.matches); return `<div class="lh-m"><span class="lh-ms"><span class="${i.winner === t.a ? "win" : ""}">${emS(t.a)} <b>${esc(nmS(t.a))}</b></span><i>${i.wa}–${i.wb}</i><span class="${i.winner === t.b ? "win" : ""}">${emS(t.b)} <b>${esc(nmS(t.b))}</b></span></span></div>`; }).join("")}</div>`).join("") : "";
    return `${table}${ko}
      ${s.jornadas.map(j => {
        const ms = s.matches.filter(m => m.j === j.id && !(s.ko && m.t));
        const teams = s.parts.map(p => { const t = snapTeam(s, p.id, j.id); return t.length ? `<div class="lh-ht2"><small>${ic(p)} ${esc(p.name)}</small><div data-spl="${esc(t.map(x => x.species).join(","))}"></div></div>` : ""; }).join("");
        if (!ms.length && !teams) return "";
        return `<div class="lh-hj"><b>${esc(j.name)}</b>
          ${ms.map(m => `<div class="lh-m"><span class="lh-ms"><span class="${m.w === "a" ? "win" : ""}">${emS(m.a)} <b>${esc(nmS(m.a))}</b></span><i>${A.hasScore(m) ? m.ga + "–" + m.gb : (m.w === "d" ? "=" : "vs")}</i><span class="${m.w === "b" ? "win" : ""}">${emS(m.b)} <b>${esc(nmS(m.b))}</b></span></span></div>`).join("")}
          <details class="lh-det"><summary class="lh-note">Equipos de la jornada</summary><div class="lh-hteams">${teams}</div></details></div>`;
      }).join("")}`;
  }

  // ---------- Ajustes ----------
  function ajustes(c) {
    const l = L(), cf = A.cfg(), lab = { win: "Victoria", draw: "Empate", loss: "Derrota" }, pl = LigaShop.LABELS, z = c.zones;
    const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${String(val) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select>`;
    const typeOpts = c.type === "liga"
      ? `<div class="lh-cfg">${[["asc", "Plazas de ascenso"], ["po", "Plazas de playoff"], ["desc", "Plazas de descenso"]].map(([k, n]) => `<label>${n}<input type="number" inputmode="numeric" min="0" data-zone="${k}" value="${z[k]}"></label>`).join("")}</div>
         <p class="lh-note">Las zonas se marcan desde 4 entrenadores. Si no caben, se mantienen ascenso y descenso y se recorta el playoff. Las vueltas se eligen al generar el calendario.</p>`
      : c.type === "copa"
        ? `<div class="lh-row">${sel("lhSLegs", c.legs, [[1, "Partido único"], [2, "Ida y vuelta"]])}${sel("lhSFinal", c.finalLegs, [[1, "Final: partido único"], [2, "Final: ida y vuelta"]])}${sel("lhSSeed", c.seeding, [["sorteo", "Sorteo aleatorio"], ["lista", "Por orden de la lista"]])}</div>`
        : `<div class="lh-row">${sel("lhSLegs", c.legs, [[1, "Eliminatorias: partido único"], [2, "Eliminatorias: ida y vuelta"]])}${sel("lhSFinal", c.finalLegs, [[1, "Final: partido único"], [2, "Final: ida y vuelta"]])}</div><p class="lh-note">Los partidos de la fase de liga se eligen al generarla, en la pestaña Competición.</p>`;
    const lockCard = `<div class="lh-card"><div class="lh-ch"><b>🎮 Quién controla a cada entrenador</b></div>
      <p class="lh-note"><b>🎮 Lo controlo yo:</b> cualquiera que use la app gestiona su equipo. <b>🔒 Lo controla su jugador:</b> solo se toca entrando con ese jugador. <b>🤖 La IA:</b> el ordenador sortea su plantilla y elige sus 6 titulares en cada jornada según su rival y el siguiente.</p>
      <div class="lh-chips wrap">${l.parts.map(p => `<button class="lh-chip ${ctl(p) !== "mine" ? "on" : ""}" data-ctlp="${p.id}">${CTL[ctl(p)][0]} ${esc(p.name)}</button>`).join("") || `<span class="lh-note">Aún no hay entrenadores.</span>`}</div>
      <p class="lh-note">Toca un nombre para cambiar: 🎮 lo controlo yo → 🔒 su jugador → 🤖 la IA.</p>
      <div class="lh-acts"><button class="btn sm ghost" id="lhCtlMine">🎮 Todos míos</button><button class="btn sm ghost" id="lhCtlSelf">🔒 Cada uno el suyo</button><button class="btn sm ghost" id="lhCtlIa">🤖 Todos de la IA</button></div></div>`;
    return `${lockCard}<div class="lh-card"><div class="lh-ch"><b>${ICON(c.type)} ${esc(c.name)}</b><span class="lh-note">${esc(TY()[c.type][1])}</span></div>
      <div class="lh-ch"><b>Escudo de la competición</b></div>
      <div class="lh-shield"><span class="lh-av big sq" style="background:${compColor(c)}">${compIc(c)}</span><div class="lh-sbtn"><label class="btn sm gold">📷 Elegir imagen<input type="file" id="lhImgC" accept="image/*" hidden></label>
        ${c.img ? `<button class="btn sm ghost" id="lhRmImgC">Quitar imagen</button>` : ""}</div></div>
      <div class="lh-emo col">${swatches("data-cc", compColor(c))}<label class="lh-cpick" title="Otro color"><input type="color" id="lhColC" value="${/^#[0-9a-f]{6}$/i.test(compColor(c)) ? compColor(c) : "#2f7bff"}"></label></div>
      <label class="lh-lab">Nombre de la ${c.type === "copa" ? "edición" : "temporada"}<input id="lhSeasonName" value="${esc(c.season.name)}" maxlength="28"></label>
      <div class="lh-ch" style="margin-top:10px"><b>Participantes</b><span class="lh-acts"><button class="btn sm ghost" id="lhAll">Todos</button><button class="btn sm ghost" id="lhNone">Ninguno</button></span></div>
      <div class="lh-chips wrap">${l.parts.map(p => `<button class="lh-chip ${A.inComp(p, c) ? "on" : ""}" data-pm="${p.id}">${A.inComp(p, c) ? "✓ " : ""}${ic(p)} ${esc(p.name)}</button>`).join("") || `<span class="lh-note">Aún no hay entrenadores.</span>`}</div>
      <p class="lh-note">Cambiar los participantes después de generar el calendario no lo rehace: genera el calendario (o sortea el cuadro) cuando ya estén todos.</p>
      <div class="lh-ch" style="margin-top:10px"><b>Formato</b></div>${typeOpts}
      ${l.comps.length > 1 ? `<button class="btn sm danger" id="lhDelComp">🗑 Borrar esta competición</button>` : ""}</div>
    ${optionsCard(c)}
    <div class="lh-card"><div class="lh-ch"><b>Premios y precios (monedas)</b></div>
      <div class="lh-cfg">${["win", "draw", "loss"].map(k => `<label>${lab[k]}<input type="number" inputmode="numeric" min="0" data-cfg="${k}" value="${cf[k]}"></label>`).join("")}
      ${Object.keys(cf.prices).map(k => `<label>${esc(pl[k])}<input type="number" inputmode="numeric" min="0" data-cfg="p.${k}" value="${cf.prices[k]}"></label>`).join("")}</div></div>
    <div class="lh-card"><div class="lh-ch"><b>Copia de seguridad</b></div>
      <textarea id="lhBk" spellcheck="false" placeholder="Aquí aparece la copia de todas las competiciones para guardarla o pasarla a otro dispositivo"></textarea>
      <div class="lh-row"><button class="btn sm" id="lhBkOut">Generar copia</button><button class="btn sm ghost" id="lhBkIn">Restaurar desde el texto</button></div></div>`;
  }

  // ---------- Acciones ----------
  const comp = id => L().comps.find(x => x.id === id) || C();
  function onClick(e) {
    const t = e.target, id = t.id, l = L(), c = C();
    if (id === "lhBack") return X().show("title");
    if (id === "lhGoRom") return X().show("rom");
    if (t.closest("#lhSorteo > summary")) { soOpen = !soOpen; return; }
    const tb = t.closest("[data-tab]"); if (tb) { tab = tb.dataset.tab; detail = null; return render(); }
    const cp = t.closest("[data-comp]"); if (cp) { l.cc = cp.dataset.comp; scope = "all"; A.save(); return A.refresh(); }
    if (id === "lhCompNew") { creating = !creating; return render(); }
    if (id === "lhCCancel") { creating = false; return render(); }
    if (id === "lhCCreate") {
      const name = root.querySelector("#lhCName").value.trim(), draw = !!(root.querySelector("#lhCDraw") && root.querySelector("#lhCDraw").checked), nc = A.addComp(root.querySelector("#lhCType").value, name || undefined);
      creating = false; tab = "comp"; scope = "all"; A.refresh();
      if (draw) drawFlow(nc, A.partsOf(nc).filter(p => controllable(p) && !A.teamOf(p).length), true);       // pide los porcentajes y reparte
      return;
    }
    const jc = t.closest("[data-j]"); if (jc) { c.cur = jc.dataset.j; A.save(); return A.refresh(); }
    const op = t.closest("[data-open]"); if (op) { tab = "entrenadores"; detail = op.dataset.open; const sc = root.closest(".screen"); if (sc) sc.scrollTop = 0; return render(); }
    if (id === "lhBackList") { detail = null; return render(); }
    const hs = t.closest("[data-hist]"); if (hs) { openHist = openHist === hs.dataset.hist ? null : hs.dataset.hist; return render(); }
    if (t.dataset && t.dataset.mid) { A.deleteMatch(c, t.dataset.mid); return A.refresh(); }
    if (t.dataset && t.dataset.shop) { const q = shopPlayer(); if (!canEdit(q)) return; return A.buy(t.dataset.shop, +t.dataset.i, q.id); }
    if (id === "lhCoinGive" || id === "lhCoinTake") {
      const n = Math.floor(+root.querySelector("#lhCoinN").value); if (!(n > 0)) return;
      A.addCoins(shopPlayer().id, id === "lhCoinGive" ? n : -n, "Ajuste manual"); A.save(); return A.refresh();
    }
    if (id === "lhMAdd") {
      const a = root.querySelector("#lhMA").value, b = root.querySelector("#lhMB").value;
      if (a === b) { alert("Elige dos entrenadores distintos."); return; }
      const w = root.querySelector("#lhMR").value;
      return askFor(c, a, b, w, c.cur, r => { A.recordMatch(a, b, w, null, toOpts(r)); A.refresh(); });
    }
    const fx = t.closest("[data-fx]");
    if (fx) {
      const cc = comp(fx.dataset.c), f = cc.fixtures.find(x => x.id === fx.dataset.fx), w = fx.dataset.w;
      if (!f) return A.refresh();
      return askFor(cc, f.a, f.b, w, f.j, r => { A.playFixture(cc, f.id, w, toOpts(r)); A.refresh(); });
    }
    const me = t.closest("[data-medit]");
    if (me) {
      const m = c.matches.find(x => x.id === me.dataset.medit); if (!m) return;
      const sc = A.scoreOf(m);
      return A.askMatch({ aName: nm(m.a), bName: nm(m.b), aTeam: m.pa || [], bTeam: m.pb || [], aSusp: new Set(), bSusp: new Set(), w: m.w, def: { xa: m.xa, xb: m.xb, na: sc[1], nb: sc[0], edit: true },
        onOk: r => { A.editMatch(c, m.id, r); A.refresh(); } });
    }
    const fd = t.closest("[data-fxdel]"); if (fd) { const cc = comp(fd.dataset.c); cc.fixtures = cc.fixtures.filter(x => x.id !== fd.dataset.fxdel); A.save(); return A.refresh(); }
    const tbk = t.closest("[data-tb]"); if (tbk) { const [tid, w] = tbk.dataset.tb.split("|"); A.setTiebreak(c, tid, w); return A.refresh(); }
    if (id === "lhFxAdd") {
      const a = root.querySelector("#lhFA").value, b = root.querySelector("#lhFB").value;
      if (a === b) { alert("Elige dos entrenadores distintos."); return; }
      c.fixtures.push({ id: A.uid(), j: c.cur, a, b, date: root.querySelector("#lhFD").value || "" }); A.save(); return A.refresh();
    }
    if (id === "lhFxClear") { c.fixtures = c.fixtures.filter(f => f.j !== c.cur || f.t); A.save(); return A.refresh(); }
    if (id === "lhGenLiga") {
      if ((c.fixtures.length || c.jornadas.length > 1) && !confirm("Esto sustituye las jornadas y los partidos pendientes actuales por el calendario nuevo. ¿Continuar?")) return;
      const err = A.genLeague(c, +root.querySelector("#lhVueltas").value); if (err) alert(err); return A.refresh();
    }
    if (id === "lhGenCL") { const err = A.genChampLeague(c, +root.querySelector("#lhRounds").value); if (err) alert(err); return A.refresh(); }
    if (id === "lhGenCK") {
      const pend = c.fixtures.filter(f => !f.t).length;
      if (pend && !confirm(`Quedan ${pend} partidos de la fase de liga sin jugar; se descartarán. ¿Generar las eliminatorias con la clasificación actual?`)) return;
      const err = A.genChampKO(c); if (err) alert(err); return A.refresh();
    }
    if (id === "lhGenCup") {
      if (c.ko && !confirm("Se volverá a sortear el cuadro. ¿Continuar?")) return;
      const err = A.genCup(c); if (err) alert(err); return A.refresh();
    }
    const co = t.closest("#lhCol span"); if (co) { newCol = co.dataset.c; const n = root.querySelector("#lhNew").value; render(); root.querySelector("#lhNew").value = n; return; }
    if (id === "lhAdd") {
      const inp = root.querySelector("#lhNew"), name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      const p = { id: A.uid(), name, emoji: "", color: newCol, teams: {}, slots: {}, control: root.querySelector("#lhNewCtl").value };
      l.parts.push(p); c.partIds.push(p.id); A.save(); A.syncPlayers(); return A.refresh();
    }
    const pc = t.closest("[data-pc]"); if (pc && detail) { part(detail).color = pc.dataset.pc; A.save(); return A.refresh(); }
    const cc = t.closest("[data-cc]"); if (cc) { c.color = cc.dataset.cc; A.save(); return A.refresh(); }
    if (id === "lhRmImgC") { delete c.img; A.save(); return A.refresh(); }
    if (id === "lhSortear") {
      const o = LigaSorteo.opts(L().sorteo), ps = A.partsOf(c), targets = ps.filter(p => controllable(p) && (o.scope === "all" || !A.teamOf(p).length));
      if (o.scope === "all" && targets.length && !confirm("Se sustituirá la plantilla de todos los participantes en esta jornada (y las siguientes que la heredan). ¿Continuar?")) return;
      return drawFlow(c, targets);
    }
    const cp2 = t.closest("[data-ctlp]"); if (cp2) { const q = part(cp2.dataset.ctlp); if (q) { q.control = { mine: "self", self: "ia", ia: "mine" }[ctl(q)]; delete q.selfControl; A.save(); A.refresh(); } return; }
    const ct = t.closest("[data-ctl]"); if (ct && detail) { const q = part(detail); if (q) { q.control = ct.dataset.ctl; delete q.selfControl; A.save(); A.refresh(); } return; }
    if (id === "lhCtlMine" || id === "lhCtlSelf" || id === "lhCtlIa") { l.parts.forEach(q => { q.control = id === "lhCtlSelf" ? "self" : id === "lhCtlIa" ? "ia" : "mine"; delete q.selfControl; }); A.save(); return A.refresh(); }
    if (id === "lhAiPrep") { const r = A.aiPrepare(c, c.cur); A.refresh(); if (!r.length) alert("No hay entrenadores de la IA en esta competición."); else alert(`La IA ha preparado ${r.length} alineación${r.length === 1 ? "" : "es"} de ${A.jor().name}.`); return; }
    const itb = t.closest("[data-item]"); if (itb) { const p = eqPlayer(c); if (p && canEdit(p)) pickItem(p, c, +itb.dataset.item); return; }
    const itx = t.closest("[data-itemx]"); if (itx) { const p = eqPlayer(c); if (p && canEdit(p)) { A.setItem(p, c.cur, +itx.dataset.itemx, ""); A.refresh(); } return; }
    const mg = t.closest("[data-mega]"); if (mg) { const p = eqPlayer(c); if (p && canEdit(p)) pickMega(p, c, +mg.dataset.mega); return; }
    if (t.closest("[data-eqdraw]")) {
      const p = detail && tab === "entrenadores" ? part(detail) : eqPlayer(c); if (!p || !canDraw(p)) return;
      if (A.teamOf(p).length && !confirm(`Se sustituirá la plantilla de ${p.name} en esta jornada (y las siguientes que la heredan). ¿Continuar?`)) return;
      return drawFlow(c, [p]);
    }
    const eq = t.closest("[data-eq]");
    if (eq) {
      const p = eqPlayer(c), i = +eq.dataset.i, squad = A.teamOf(p), nmS = m => X().nmSp(m.species); if (!canEdit(p)) return;
      if (!squad[i]) return;
      if (!A.toggleStarter(p, c.cur, i)) { alert("Ya tienes 6 titulares. Quita uno antes de añadir otro."); return; }
      return A.refresh();
    }
    const mem = t.closest("[data-member]"); if (mem && detail) { A.toggleMember(comp(mem.dataset.member), detail, !A.inComp(part(detail), comp(mem.dataset.member))); return A.refresh(); }
    const pm = t.closest("[data-pm]"); if (pm) { A.toggleMember(c, pm.dataset.pm, !c.partIds.includes(pm.dataset.pm)); return A.refresh(); }
    if (id === "lhAll") { c.partIds = l.parts.map(p => p.id); A.save(); return A.refresh(); }
    if (id === "lhNone") { c.partIds = []; A.save(); return A.refresh(); }
    if (id === "lhJnew") {
      const nj = { id: "j" + A.uid(), name: "Jornada " + (c.jornadas.length + 1) };
      c.jornadas.push(nj); c.cur = nj.id; A.save(); return A.refresh();
    }
    if (id === "lhJdel") {
      if (!confirm(`¿Borrar «${A.jor().name}» y sus equipos y partidos pendientes?`)) return;
      const gone = c.cur; c.fixtures = c.fixtures.filter(f => f.j !== gone); c.matches = c.matches.filter(m => m.j !== gone); c.jornadas = c.jornadas.filter(x => x.id !== gone); l.parts.forEach(p => { if (p.teams) delete p.teams[gone]; });
      c.cur = c.jornadas[0].id; A.save(); return A.refresh();
    }
    if (id === "lhClose") {
      if (!c.matches.length && !confirm("Todavía no hay combates anotados. ¿Cerrar de todas formas?")) return;
      if (!confirm(`¿Cerrar «${c.season.name}» de ${c.name}? Se guarda en el Historial y empieza otra.`)) return;
      A.closeSeason(c); scope = "all"; tab = "historial"; openHist = c.history[c.history.length - 1].id; return A.refresh();
    }
    if (id === "lhDelComp") { if (confirm(`¿Borrar «${c.name}» con todos sus combates e historial? Los entrenadores no se borran.`)) { A.delComp(c.id); tab = "comp"; A.refresh(); } return; }
    if (id === "lhBkOut") { root.querySelector("#lhBk").value = JSON.stringify(l); return; }
    if (id === "lhBkIn") {
      try {
        const d = JSON.parse(root.querySelector("#lhBk").value);
        if (!d || !Array.isArray(d.parts) || !(Array.isArray(d.comps) || Array.isArray(d.jornadas))) throw 0;
        if (!confirm("Esto sustituye todas las competiciones actuales por las de la copia. ¿Continuar?")) return;
        A.setL(d); detail = null; A.refresh();
      } catch (_) { alert("El texto no es una copia válida de la liga."); }
      return;
    }
    // Acciones sobre el entrenador abierto
    const act = t.closest("[data-act]");
    if (act && detail) {
      const p = part(detail), a = act.dataset.act; if (!p) return;
      if (a === "rtclear") { delete p.rating; A.save(); return A.refresh(); }
      if (a === "rmimg") { delete p.img; A.save(); return A.refresh(); }
      if (a === "me") { l.me = l.me === p.id ? null : p.id; A.save(); return A.refresh(); }
      if ((a === "inherit" || a === "prof") && !canEdit(p)) return;
      if (a === "inherit") { delete p.teams[c.cur]; A.save(); return A.refresh(); }
      if (a === "del") {
        if (confirm(`¿Quitar a «${p.name}» y todos sus equipos de la liga?`)) {
          A.removePlayer(p.id); detail = null; A.refresh();
        } return;
      }
      if (a === "prof") {
        const profs = X().profileTeams().filter(q => q.team.length);
        if (!profs.length) { alert("Ningún jugador tiene equipo guardado todavía (se crea en «Elegir equipo»)."); return; }
        return A.pickSheet("Traer el equipo de un jugador", profs.map(q => ({ id: q.id, label: q.name, sub: q.team.map(s => X().nmSp(s.species)).join(", ") })), it => {
          const q = profs.find(z => z.id === it.id); A.setTeam(p, c.cur, q.team.slice(0, 6)); A.save(); A.refresh();
        });
      }
    }
  }
  function onChange(e) {
    const t = e.target, l = L(), c = C();
    if ((t.id === "lhImgP" || t.id === "lhImgC") && t.files[0]) {
      shieldFromFile(t.files[0]).then(url => { if (t.id === "lhImgP") { const p = part(detail); if (p) p.img = url; } else c.img = url; A.save(); A.refresh(); }).catch(err => alert(err.message));
      return;
    }
    if (t.id === "lhColNew") { const n = root.querySelector("#lhNew").value; newCol = t.value; render(); root.querySelector("#lhNew").value = n; return; }
    if (t.id === "lhColP") { const p = part(detail); if (p) { p.color = t.value; A.save(); A.refresh(); } return; }
    if (t.id === "lhColC") { c.color = t.value; A.save(); return A.refresh(); }
    if (t.dataset && t.dataset.rt !== undefined || (t.dataset && t.dataset.rtp !== undefined)) {
      const pid = t.dataset.rt || t.dataset.rtp, q = part(pid); if (!q) return;
      if (t.value === "") delete q.rating; else q.rating = Math.max(0, Math.min(100, Math.floor(+t.value) || 0));
      A.save();
      if (t.dataset.rtp !== undefined) return A.refresh();                       // ficha del entrenador: se repinta
      const lab = t.closest(".lh-rt").querySelector(".lh-rtl"), o = L().sorteo || {};
      lab.textContent = LigaSorteo.etiqueta(q.rating != null ? q.rating : (o.rating != null ? o.rating : 50)); return;
    }
    if (t.dataset && t.dataset.so) {
      const o = (l.sorteo = LigaSorteo.opts(l.sorteo)), k = t.dataset.so; if (k === "size") o.sizeSet = true;
      o[k] = t.type === "checkbox" ? t.checked : k === "rating" ? Math.max(0, Math.min(100, Math.floor(+t.value) || 0)) : (["size", "level", "gen"].includes(k) ? Math.max(1, Math.min(k === "gen" ? 9 : k === "size" ? 12 : 100, Math.floor(+t.value) || 1)) : t.value);
      A.save(); return;
    }
    if (t.id === "lhCType") { const n = root.querySelector("#lhCName").value; ncType = t.value; render(); root.querySelector("#lhCName").value = n; return; }
    if (t.id === "lhCompName") { c.name = t.value.trim() || c.name; A.save(); return A.refresh(); }
    if (t.id === "lhSeasonName") { c.season.name = t.value.trim() || c.season.name; A.save(); return A.refresh(); }
    if (t.id === "lhMe") { l.me = t.value || null; A.save(); return A.refresh(); }
    if (t.id === "lhJdate") { A.jor().date = t.value || ""; A.save(); return A.refresh(); }
    if (t.id === "lhVueltas") { c.vueltas = +t.value; A.save(); return render(); }
    if (t.id === "lhRounds") { c.rounds = +t.value; A.save(); return render(); }
    if (t.id === "lhSeed" || t.id === "lhSSeed") { c.seeding = t.value; A.save(); return render(); }
    if (t.id === "lhLegs" || t.id === "lhSLegs") { c.legs = +t.value; A.save(); return render(); }
    if (t.id === "lhSFinal") { c.finalLegs = +t.value; A.save(); return render(); }
    if (t.id === "lhEqP") { eqP = t.value; return render(); }
    if (t.id === "lhStScope") { stScope = t.value; return render(); }
    if (t.id === "lhStSort") { stSort = t.value; return render(); }
    if (t.id === "lhScope") { scope = t.value === "j" ? "j" : "all"; return render(); }
    if (t.id === "lhSP") { shopP = t.value; return render(); }
    if (t.id === "lhJn") { A.jor().name = t.value.trim() || A.jor().name; A.save(); return A.refresh(); }
    if (t.dataset && t.dataset.zone) { c.zones[t.dataset.zone] = Math.max(0, Math.floor(+t.value) || 0); A.save(); return render(); }
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
