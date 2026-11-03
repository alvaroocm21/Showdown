// Pruebas de la tienda de monedas (lib/ligashop.js)
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const Shop = require("../lib/ligashop.js");
const w = {}; w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../lib/pkmn.bundle.js"), "utf8"), w);
const { Dex } = w.PKMN;
const LS = {};
const learnable = sp => LS[sp.id] || (LS[sp.id] = new Set(Object.keys((Dex.species.getLearnsetData(sp.id) || {}).learnset || {})));
const env = { Dex, abils: Dex.abilities.all().filter(a => a.exists && a.id !== "noability"), natures: Dex.natures.all(), moves: Dex.moves.all().filter(m => m.exists && !m.isZ && !m.isMax),
  items: Dex.items.all().filter(i => i.exists && !i.isNonstandard && !i.isPokeball), learnable };
let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mk = () => ({ species: "Gengar", ability: "Cursed Body", item: "Leftovers", nature: "Timid", moves: ["Shadow Ball", "Sludge Bomb", "Thunderbolt", "Hypnosis"], ivs: { hp: 31, atk: 0, def: 31, spa: 31, spd: 31, spe: 31 } });

let s = mk();
// habilidad al azar: entre TODAS las del juego, aunque no sea de su especie
assert.equal(Shop.why("ab", s, env), "");
const seen = new Set(); for (let i = 0; i < 60; i++) { const q = mk(); Shop.apply("ab", q, env, null, rand); assert.notEqual(q.ability, "Cursed Body"); seen.add(q.ability); }
assert.ok([...seen].some(n => !Object.values(Dex.species.get("Gengar").abilities).includes(n)), "salen habilidades ajenas a la especie");
s = mk(); Shop.apply("natR", s, env, null, rand); assert.notEqual(s.nature, "Timid");
s = mk(); Shop.apply("nat", s, env, { nature: "Modest" }); assert.equal(s.nature, "Modest");
s = mk(); t = Shop.apply("mvR", s, env, null, rand); assert.equal(s.moves.length, 4); assert.equal(new Set(s.moves).size, 4, "sin repetidos");
const seenM = new Set(); for (let i = 0; i < 60; i++) { const q = mk(); Shop.apply("mvR", q, env, null, rand); seenM.add(q.moves.find(m => !mk().moves.includes(m))); }
assert.ok([...seenM].some(m => !learnable(Dex.species.get("Gengar")).has(Dex.moves.get(m).id)), "salen ataques que no aprende");
s = mk(); Shop.apply("mv", s, env, { move: "Hex", slot: 2 }); assert.deepEqual(s.moves, ["Shadow Ball", "Sludge Bomb", "Hex", "Hypnosis"]);
s = mk(); Shop.apply("mv", s, env, { move: "Shadow Ball", slot: 3 }); assert.deepEqual(s.moves, ["Sludge Bomb", "Thunderbolt", "Shadow Ball"].length === 3 ? s.moves : [], "el repetido se mueve, no se duplica"); assert.equal(s.moves.filter(m => m === "Shadow Ball").length, 1);
s = mk(); Shop.apply("itR", s, env, null, rand); assert.notEqual(s.item, "Leftovers");
s = mk(); assert.equal(Shop.apply("iv", s, env), "IVs: todos a 31"); assert.equal(s.ivs.atk, 31);
assert.equal(Shop.why("iv", s, env), "Ya tiene todos los IVs a 31"); assert.equal(Shop.apply("iv", s, env), null);
const d = Shop.DEFAULTS(); assert.ok(d.win > d.draw && d.draw > d.loss);
// con la ROM: solo lo que existe
const only = { ...env, ok: (k, o) => o.name === "Hex" || k === "ability" };
s = mk(); Shop.apply("mvR", s, only, null, rand); assert.ok(s.moves.includes("Hex"));
console.log("TIENDA OK");
