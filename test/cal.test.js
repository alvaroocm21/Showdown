const assert = require("assert"), Cal = require("../lib/ligacal.js");
// Todos contra todos: con 6 entrenadores hay 5 rondas y cada pareja se juega una vez
const ids = ["a", "b", "c", "d", "e", "f"], seen = new Set();
for (let r = 0; r < 5; r++) {
  const p = Cal.round(ids, r); assert.equal(p.length, 3);
  assert.equal(new Set(p.flat()).size, 6, "cada uno juega una vez por ronda");
  for (const [x, y] of p) { const k = [x, y].sort().join(); assert.ok(!seen.has(k), "pareja repetida " + k); seen.add(k); }
}
assert.equal(seen.size, 15);
// impar: uno descansa por ronda
const odd = Cal.round(["a", "b", "c", "d", "e"], 0); assert.equal(odd.length, 2);
assert.deepEqual(Cal.round(["a"], 0), []);
// 20 entrenadores: 10 partidos por ronda, 19 rondas, 190 parejas
const big = Array.from({ length: 20 }, (_, i) => "p" + i), all = new Set();
for (let r = 0; r < 19; r++) Cal.round(big, r).forEach(([x, y]) => all.add([x, y].sort().join()));
assert.equal(all.size, 190);
// rachas
const ms = [{ a: "x", b: "y", w: "a" }, { a: "y", b: "x", w: "a" }, { a: "x", b: "z", w: "d" }, { a: "x", b: "y", w: "b" }, { a: "q", b: "z", w: "a" }];
assert.deepEqual(Cal.results(ms, "x"), ["V", "D", "E", "D"]);
let s = Cal.streak(["V", "V", "V", "E", "V", "V"]); assert.deepEqual([s.kind, s.n, s.bestWins], ["V", 2, 3]);
assert.equal(Cal.streakText(s), "2 victorias seguidas"); assert.equal(Cal.streakText({ kind: "D", n: 1 }), "1 derrota seguida"); assert.equal(Cal.streakText(Cal.streak([])), "Sin partidos todavía");
assert.deepEqual(Cal.streak(["D", "V", "V", "V", "E", "D", "D"]).last5, ["V", "V", "E", "D", "D"]);
// fechas
const now = "2026-11-04T10:00:00";
assert.equal(Cal.dayLabel("2026-11-04", now), "Hoy"); assert.equal(Cal.dayLabel("2026-11-05", now), "Mañana"); assert.equal(Cal.dayLabel("", now), "");
assert.match(Cal.dayLabel("2026-11-20", now), /20/);
// orden de pendientes: con fecha primero, la más cercana antes
const js = [{ id: "j1" }, { id: "j2", date: "2026-11-10" }];
const up = Cal.upcoming([{ id: 1, j: "j1" }, { id: 2, j: "j2" }, { id: 3, j: "j1", date: "2026-11-12" }, { id: 4, j: "j1", date: "2026-11-06" }], js);
assert.deepEqual(up.map(f => f.id), [4, 2, 3, 1]);
console.log("CALENDARIO OK");
