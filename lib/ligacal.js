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
  return { round, results, streak, streakText, dayLabel, upcoming };
})();
if (typeof module !== "undefined") module.exports = LigaCal;
