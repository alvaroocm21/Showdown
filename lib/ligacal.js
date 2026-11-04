// Calendario y rachas de la Liga: lógica pura (sin DOM).
const LigaCal = (() => {
  // Emparejamientos de la ronda r (método del círculo): con n entrenadores hay n-1 rondas distintas; con n impar, uno descansa.
  function round(ids, r) {
    const a = ids.slice(); if (a.length < 2) return [];
    if (a.length % 2) a.push(null);
    const n = a.length, rest = a.slice(1);
    for (let i = 0; i < (r % (n - 1)); i++) rest.unshift(rest.pop());
    const arr = [a[0], ...rest], pairs = [];
    for (let i = 0; i < n / 2; i++) { const x = arr[i], y = arr[n - 1 - i]; if (x && y) pairs.push([x, y]); }
    return pairs;
  }
  // Resultados de un entrenador, en el orden en que se anotaron: "V", "E" o "D".
  function results(matches, pid) {
    const out = [];
    for (const m of matches) {
      if (m.a !== pid && m.b !== pid) continue;
      out.push(m.w === "d" ? "E" : ((m.w === "a") === (m.a === pid) ? "V" : "D"));
    }
    return out;
  }
  // Racha actual (las últimas iguales seguidas) y mejor racha de victorias.
  function streak(res) {
    let kind = "", n = 0;
    for (let i = res.length - 1; i >= 0; i--) { if (!kind) kind = res[i]; if (res[i] === kind) n++; else break; }
    let best = 0, run = 0;
    for (const r of res) { run = r === "V" ? run + 1 : 0; if (run > best) best = run; }
    return { kind, n, bestWins: best, last5: res.slice(-5) };
  }
  const WORD = { V: ["victoria", "victorias"], E: ["empate", "empates"], D: ["derrota", "derrotas"] };
  function streakText(s) {
    if (!s.kind) return "Sin partidos todavía";
    return `${s.n} ${WORD[s.kind][s.n === 1 ? 0 : 1]} seguida${s.n === 1 ? "" : "s"}`;
  }
  // "Hoy", "Mañana" o "mié, 5 nov"; "" si no hay fecha.
  function dayLabel(date, now) {
    if (!date) return "";
    const d = new Date(date + "T12:00:00"); if (isNaN(d)) return "";
    const t = now ? new Date(now) : new Date(), t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()), d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((d0 - t0) / 86400000);
    if (diff === 0) return "Hoy"; if (diff === 1) return "Mañana"; if (diff === -1) return "Ayer";
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  }
  // Pendientes ordenados: primero con fecha (más cercana antes), luego por jornada y orden de creación.
  function upcoming(fixtures, jornadas) {
    const order = {}, jdate = {}; jornadas.forEach((j, i) => { order[j.id] = i; jdate[j.id] = j.date || ""; });
    return fixtures.map((f, i) => ({ f, i, date: f.date || jdate[f.j] || "" }))
      .sort((x, y) => (x.date ? 0 : 1) - (y.date ? 0 : 1) || (x.date < y.date ? -1 : x.date > y.date ? 1 : 0) || (order[x.f.j] - order[y.f.j]) || x.i - y.i)
      .map(x => ({ ...x.f, date: x.date }));
  }
  // Zonas de la tabla: ascenso (primeros), playoff (siguientes) y descenso (últimos). Devuelve una zona por posición:
  // "asc" | "po" | "desc" | "" (zona media). Con menos de 4 entrenadores no hay zonas; si no caben, se mantiene el ascenso, luego el descenso y se recorta el playoff.
  function zones(n, cfg) {
    const out = new Array(n).fill("");
    if (n < 4 || !cfg) return out;
    let asc = Math.max(0, cfg.asc | 0), po = Math.max(0, cfg.po | 0), desc = Math.max(0, cfg.desc | 0);
    asc = Math.min(asc, n - 1);
    desc = Math.min(desc, n - 1 - asc);
    po = Math.min(po, n - asc - desc);
    for (let i = 0; i < asc; i++) out[i] = "asc";
    for (let i = asc; i < asc + po; i++) out[i] = "po";
    for (let i = n - desc; i < n; i++) out[i] = "desc";
    return out;
  }
  // ===== Calendarios completos y eliminatorias =====
  // Liga: todas las rondas. vueltas = 1 (solo ida) o 2 (ida y vuelta: la 2.ª vuelta repite las parejas con el orden cambiado).
  // limit: máximo de rondas por vuelta (fase de liga de la Champions).
  function schedule(ids, vueltas, limit) {
    const n = ids.length; if (n < 2) return [];
    const m = n % 2 ? n : n - 1, rounds = [], per = Math.min(m, limit || m);
    for (let r = 0; r < per; r++) rounds.push(round(ids, r));
    if (vueltas === 2) for (let r = 0; r < per; r++) rounds.push(round(ids, r).map(([a, b]) => [b, a]));
    return rounds;
  }
  const nextPow2 = n => { let p = 1; while (p < n) p *= 2; return p; };
  // Orden de un cuadro de eliminatorias de tamaño B (potencia de 2): 1 contra B, 2 contra B-1… y los cabezas de serie en mitades distintas.
  function seedOrder(B) { let a = [1]; while (a.length < B) a = a.flatMap(x => [x, 2 * a.length + 1 - x]); return a; }
  const roundName = nTies => ({ 1: "Final", 2: "Semifinales", 4: "Cuartos de final", 8: "Octavos de final", 16: "Dieciseisavos" }[nTies] || `Ronda de ${nTies * 2}`);

  // Cuadro (copa): seeds son los ids en orden de cabeza de serie; si no son potencia de 2, los mejores pasan directos (descansan).
  // opts: { legs: 1|2 (todas las rondas salvo la final), finalLegs: 1|2 }
  function buildKO(seeds, opts) {
    opts = opts || {};
    const B = nextPow2(Math.max(2, seeds.length)), order = seedOrder(B), legs = opts.legs === 2 ? 2 : 1, finalLegs = opts.finalLegs === 2 ? 2 : 1;
    const sd = i => seeds[i - 1] || null;
    const rounds = []; let n = B / 2, ri = 0, prev = null;
    while (n >= 1) {
      const ties = [];
      for (let t = 0; t < n; t++) {
        const id = `r${ri}t${t}`;
        if (!prev) ties.push({ id, a: sd(order[2 * t]), b: sd(order[2 * t + 1]), fa: null, fb: null, bye: !sd(order[2 * t + 1]) });
        else ties.push({ id, a: null, b: null, fa: prev[2 * t].id, fb: prev[2 * t + 1].id });
      }
      rounds.push({ name: roundName(n), legs: n === 1 ? finalLegs : legs, ties });
      prev = ties; n /= 2; ri++;
    }
    return { rounds };
  }
  // Tamaño del cuadro final de la Champions con el nuevo formato: B equipos en la ronda de B; los B/2 primeros pasan directos,
  // los B siguientes juegan el playoff (B/2 eliminatorias) y el resto queda fuera. Hacen falta 1,5·B entrenadores como mínimo.
  function champParams(n) {
    let B = 2; while (B * 2 * 1.5 <= n) B *= 2;
    if (n < 3) return null;
    return { B, direct: B / 2, playoff: B, out: Math.max(0, n - B / 2 - B) };
  }
  // Eliminatorias de la Champions a partir de la clasificación de la fase de liga (ids en orden).
  function buildChampKO(order, opts) {
    opts = opts || {}; const n = order.length, pr = champParams(n); if (!pr || n < pr.direct + pr.playoff) return null;
    const { B, direct: d } = pr, legs = opts.legs === 2 ? 2 : 1, finalLegs = opts.finalLegs === 2 ? 2 : 1;
    const rounds = [], playoffTies = [];
    for (let t = 1; t <= d; t++) playoffTies.push({ id: `p0t${t - 1}`, a: order[d + t - 1], b: order[d + B - t], fa: null, fb: null });
    rounds.push({ name: "Playoff", legs, ties: playoffTies });
    // Ronda de B: el cabeza de serie i (1..d) contra el ganador del playoff d+1-i; los cabezas se colocan en el orden del cuadro.
    const so = seedOrder(d), first = so.map((seed, k) => ({ id: `r0t${k}`, a: order[seed - 1], b: null, fa: null, fb: playoffTies[d - seed].id }));
    let prev = first, ri = 0;
    rounds.push({ name: roundName(first.length), legs: first.length === 1 ? finalLegs : legs, ties: first });
    while (prev.length > 1) {
      ri++; const ties = [];
      for (let t = 0; t < prev.length / 2; t++) ties.push({ id: `r${ri}t${t}`, a: null, b: null, fa: prev[2 * t].id, fb: prev[2 * t + 1].id });
      rounds.push({ name: roundName(ties.length), legs: ties.length === 1 ? finalLegs : legs, ties }); prev = ties;
    }
    return { rounds };
  }
  const allTies = ko => ko.rounds.flatMap(r => r.ties.map(t => ({ ...t, round: r })));
  // Estado de una eliminatoria: victorias de cada lado, si está jugada y quién gana (null si falta jugar o hay empate sin desempatar).
  function tieInfo(tie, legs, matches) {
    if (tie.bye) return { wa: 0, wb: 0, played: legs, bye: true, winner: tie.a || tie.b };
    const ms = matches.filter(m => m.t === tie.id);
    let wa = 0, wb = 0;
    for (const m of ms) { const w = m.w === "d" ? null : (m.w === "a" ? m.a : m.b); if (w === tie.a) wa++; else if (w === tie.b) wb++; }
    const done = ms.length >= legs;
    let winner = null;
    if (done) winner = wa > wb ? tie.a : wb > wa ? tie.b : (tie.manual === tie.a || tie.manual === tie.b ? tie.manual : null);
    return { wa, wb, played: ms.length, bye: false, winner, needTiebreak: done && wa === wb && !winner };
  }
  // Rellena los equipos de cada eliminatoria con los ganadores de las anteriores (y deja en blanco lo que aún no se sabe).
  function advance(ko, matches) {
    const win = {};
    for (const r of ko.rounds) for (const t of r.ties) {
      if (t.fa) t.a = win[t.fa] || null;
      if (t.fb) t.b = win[t.fb] || null;
      let w = null;
      if (t.a && t.b) w = tieInfo(t, r.legs, matches).winner;
      else if (t.bye) w = t.a || t.b || null;            // descanso: pasa directo
      win[t.id] = w;
    }
    return ko;
  }
  const champion = (ko, matches) => { const r = ko.rounds[ko.rounds.length - 1], t = r.ties[0]; return tieInfo(t, r.legs, matches).winner; };
  return { zones, round, results, streak, streakText, dayLabel, upcoming, schedule, nextPow2, seedOrder, roundName, buildKO, champParams, buildChampKO, tieInfo, advance, champion, allTies };
})();
if (typeof module !== "undefined") module.exports = LigaCal;
