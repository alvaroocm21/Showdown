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
// zonas de la tabla
const z = (n, c) => Cal.zones(n, c).join(",");
assert.equal(z(3, { asc: 1, po: 1, desc: 1 }), ",,", "menos de 4: sin zonas");
assert.equal(z(8, { asc: 2, po: 2, desc: 2 }), "asc,asc,po,po,,,desc,desc");
assert.equal(z(20, { asc: 2, po: 4, desc: 3 }).split(",").filter(x => x === "po").length, 4);
assert.equal(z(5, { asc: 2, po: 2, desc: 2 }), "asc,asc,po,desc,desc", "si no caben, se recorta primero el playoff");
assert.equal(z(4, { asc: 3, po: 3, desc: 3 }), "asc,asc,asc,po", "ascenso primero, luego descenso, y el playoff con lo que sobra");
assert.equal(z(6, { asc: 0, po: 0, desc: 1 }), ",,,,,desc");
// ---- calendarios completos
const sc1 = Cal.schedule(ids, 1), sc2 = Cal.schedule(ids, 2);
assert.equal(sc1.length, 5); assert.equal(sc2.length, 10);
assert.deepEqual(sc2.slice(5).map(r => r.map(([a, b]) => [b, a])), sc1, "la vuelta repite las parejas con el orden cambiado");
assert.equal(Cal.schedule(["a", "b", "c"], 1).length, 3, "impar: n rondas, uno descansa");
assert.equal(Cal.schedule(big, 1, 8).length, 8, "fase de liga limitada a 8 rondas");
const pl = {}; Cal.schedule(big, 1, 8).flat().forEach(([x, y]) => { pl[x] = (pl[x] || 0) + 1; pl[y] = (pl[y] || 0) + 1; });
assert.ok(big.every(p => pl[p] === 8), "todos juegan 8 partidos");
// ---- cuadro de copa
assert.deepEqual(Cal.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
const cup = Cal.buildKO(["s1", "s2", "s3", "s4", "s5", "s6"], { legs: 1 });
assert.deepEqual(cup.rounds.map(r => r.name), ["Cuartos de final", "Semifinales", "Final"]);
assert.ok(cup.rounds[0].ties[0].bye && cup.rounds[0].ties[2].bye, "con 6 equipos, los 2 mejores descansan");
const M = []; let k = 0;
const play = (tieId, w, a, b) => M.push({ id: "m" + k++, t: tieId, a, b, w });
Cal.advance(cup, M);
assert.equal(cup.rounds[1].ties[0].a, "s1", "el cabeza de serie 1 pasa directo");
// jugar todo: gana siempre el de menor número de seed
for (const r of cup.rounds) { Cal.advance(cup, M); for (const t of r.ties) if (t.a && t.b && !Cal.tieInfo(t, r.legs, M).winner) play(t.id, +t.a.slice(1) < +t.b.slice(1) ? "a" : "b", t.a, t.b); }
Cal.advance(cup, M); assert.equal(Cal.champion(cup, M), "s1");
// ida y vuelta: empate en victorias → desempate manual
const cup2 = Cal.buildKO(["x", "y"], { legs: 2, finalLegs: 2 }), M2 = [];
Cal.advance(cup2, M2); const f = cup2.rounds[0].ties[0];
M2.push({ t: f.id, a: "x", b: "y", w: "a" }); assert.equal(Cal.tieInfo(f, 2, M2).winner, null, "falta la vuelta");
M2.push({ t: f.id, a: "y", b: "x", w: "a" }); let ti = Cal.tieInfo(f, 2, M2);
assert.deepEqual([ti.wa, ti.wb, ti.needTiebreak], [1, 1, true]);
f.manual = "y"; assert.equal(Cal.tieInfo(f, 2, M2).winner, "y");
// ---- Champions (nuevo formato)
assert.deepEqual(Cal.champParams(36), { B: 16, direct: 8, playoff: 16, out: 12 }, "como la Champions real: 8 directos, 16 de playoff, 12 fuera");
assert.deepEqual(Cal.champParams(20), { B: 8, direct: 4, playoff: 8, out: 8 });
assert.equal(Cal.champParams(2), null);
const order20 = big.slice(), ch = Cal.buildChampKO(order20, { legs: 2, finalLegs: 1 }), MC = [];
assert.deepEqual(ch.rounds.map(r => r.name), ["Playoff", "Cuartos de final", "Semifinales", "Final"]);
assert.deepEqual(ch.rounds.map(r => r.ties.length), [4, 4, 2, 1]);
assert.deepEqual(ch.rounds.map(r => r.legs), [2, 2, 2, 1]);
const po = ch.rounds[0].ties; assert.deepEqual([po[0].a, po[0].b, po[3].a, po[3].b], ["p4", "p11", "p7", "p8"], "5.º-12.º, 6.º-11.º… 8.º-9.º");
Cal.advance(ch, MC);
const q = ch.rounds[1].ties.map(t => t.a); assert.deepEqual([...q].sort(), ["p0", "p1", "p2", "p3"], "los 4 mejores pasan directos a cuartos");
// el playoff: gana el de mejor puesto; ida y vuelta
for (const t of po) { MC.push({ t: t.id, a: t.a, b: t.b, w: "a" }, { t: t.id, a: t.b, b: t.a, w: "b" }); }
Cal.advance(ch, MC);
assert.ok(ch.rounds[1].ties.every(t => t.a && t.b), "los ganadores del playoff se colocan en los cuartos");
assert.equal(ch.rounds[1].ties.find(t => t.a === "p0").b, "p7", "el 1.º se enfrenta al ganador del 8.º-9.º");
assert.equal(Cal.buildChampKO(["a", "b"], {}), null, "faltan entrenadores"); assert.ok(Cal.buildChampKO(["a", "b", "c", "d"], {}), "con 4: 1 directo, 2.º y 3.º juegan el playoff");
console.log("CALENDARIO OK");
