const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const Sorteo = require("../lib/ligasorteo.js");
const w = {}; w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../lib/pkmn.bundle.js"), "utf8"), w);
const { Dex } = w.PKMN;
const pool = Dex.species.all().filter(s => s.exists && s.num > 0 && !s.battleOnly && !s.isMega && !/Gmax|Eternamax|Totem|Cosplay|Rock-Star|Belle|Pop-Star|Libre|PhD/.test(s.name) && !["CAP", "CAP-Future", "Custom", "Gigantamax"].includes(s.isNonstandard || ""));
const env = { Dex, pool, abils: Dex.abilities.all().filter(a => a.exists && a.id !== "noability"), natures: Dex.natures.all(),
  moves: Dex.moves.all().filter(m => m.exists && !m.isZ && !m.isMax && m.id !== "struggle"), items: Dex.items.all().filter(i => i.exists && !i.isNonstandard && !i.isPokeball && !i.megaStone && !i.zMove),
  types: Dex.types.all().map(t => t.name).filter(t => t !== "Stellar"),
  defaultSet: (name, o) => { const sp = Dex.species.get(name), b = sp.baseStats, off = b.atk >= b.spa ? "atk" : "spa"; return { species: sp.name, level: (o && o.level) || 50, ability: Object.values(sp.abilities)[0], item: "Leftovers", nature: off === "atk" ? "Jolly" : "Timid", moves: ["Tackle"], evs: { hp: 4, atk: 0, def: 0, spa: 0, spd: 0, spe: 252, [off]: 252 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, teraType: sp.types[0], name: "", gender: "" }; } };
let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fam = sp => { let s = Dex.species.get(sp), g = 0; while (s.prevo && g++ < 4) s = Dex.species.get(s.prevo); return s.id; };

// 20 entrenadores, 6 Pokémon, sin repetir familias en toda la liga
const teams = Sorteo.draw(env, { size: 6, level: 50 }, 20, rand);
assert.equal(teams.length, 20); assert.ok(teams.every(t => t.length === 6));
const fams = teams.flat().map(s => fam(s.species)); assert.equal(new Set(fams).size, 120, "sin familias repetidas entre entrenadores");
for (const s of teams.flat()) { const sp = Dex.species.get(s.species); assert.ok(!(sp.evos && sp.evos.length), s.species + " no está totalmente evolucionado"); assert.ok(!(sp.tags || []).some(t => /Legendary|Mythical/.test(t)), s.species + " es legendario"); assert.equal(s.level, 50); assert.equal(s.moves.length, 4); assert.equal(new Set(s.moves).size, 4); }
// azar total: la configuración varía y los ataques incluyen al menos 2 de daño
const t0 = teams[0]; assert.ok(new Set(t0.map(s => s.nature)).size > 1 || new Set(t0.map(s => s.item)).size > 1, "naturaleza/objeto al azar");
assert.ok(teams.flat().every(s => s.moves.filter(m => Dex.moves.get(m).basePower > 0).length >= 2), "al menos 2 ataques de daño");
assert.ok(teams.flat().some(s => !Object.values(Dex.species.get(s.species).abilities).includes(s.ability)), "habilidades ajenas a la especie en azar total");
// coherente: habilidad de su especie
const co = Sorteo.draw(env, { size: 3, mode: "coherent", level: 30 }, 5, rand);
assert.ok(co.flat().every(s => Object.values(Dex.species.get(s.species).abilities).includes(s.ability) && s.level === 30), "coherente: habilidad de la especie");
// opciones: generación, legendarios, nivel, tamaño
const g1 = Sorteo.draw(env, { size: 4, gen: 1 }, 3, rand); assert.ok(g1.flat().every(s => Dex.species.get(s.species).gen === 1));
const lg = Sorteo.pool(env, { legend: true, final: true, gen: 9 }).some(s => (s.tags || []).some(t => /Legendary|Mythical/.test(t))); assert.ok(lg, "con legendarios activados pueden salir");
assert.ok(Sorteo.draw(env, { size: 2 }, 3, rand).every(t => t.length === 2));
// pocos Pokémon: repite lo mínimo pero entrega equipos completos
const few = Sorteo.draw({ ...env, pool: pool.filter(s => s.gen === 1 && !(s.evos && s.evos.length)).slice(0, 8) }, { size: 6, final: false, legend: true }, 3, rand);
assert.ok(few.every(t => t.length >= 1), "no se queda sin equipo");
// la ROM limita las especies
const rom = Sorteo.draw({ ...env, ok: (k, o) => k !== "species" || o.num <= 151 }, { size: 6 }, 4, rand); assert.ok(rom.flat().every(s => Dex.species.get(s.species).num <= 151));
// porcentajes: con 95 salen Pokémon mucho más fuertes que con 5, y 50 queda en medio
const avg = ts => { const l = ts.flat().map(x => Sorteo.bst(Dex.species.get(x.species))); return l.reduce((a, b) => a + b, 0) / l.length; };
const R = (r, n) => Sorteo.draw(env, { size: 6, unique: false }, n, rand, Array(n).fill(r));
const a95 = avg(R(95, 20)), a50 = avg(R(50, 20)), a5 = avg(R(5, 20));
assert.ok(a95 > a50 + 60 && a50 > a5 + 60, `media por porcentaje: 95→${a95.toFixed(0)} 50→${a50.toFixed(0)} 5→${a5.toFixed(0)}`);
assert.ok(a95 >= 560, "un 95 da equipos de élite: " + a95.toFixed(0)); assert.ok(a5 <= 400, "un 5 da equipos humildes: " + a5.toFixed(0));
// cada entrenador con su porcentaje, sin repetir familias entre ellos y con equipos completos
const mix = Sorteo.draw(env, { size: 6 }, 3, rand, [90, 50, 10]);
assert.ok(mix.every(t => t.length === 6) && avg([mix[0]]) > avg([mix[1]]) && avg([mix[1]]) > avg([mix[2]]), "orden por porcentaje 90 > 50 > 10");
assert.equal(new Set(mix.flat().map(s => fam(s.species))).size, 18, "sin familias repetidas");
assert.equal(Sorteo.etiqueta(92), "Élite"); assert.equal(Sorteo.etiqueta(5), "Humilde");
// con pocos Pokémon disponibles y porcentaje, no se queda sin equipo
const poor = Sorteo.draw({ ...env, pool: pool.filter(s => s.gen === 1 && !(s.evos && s.evos.length)).slice(0, 8) }, { size: 6, final: false, legend: true }, 3, rand, [90, 90, 90]);
assert.ok(poor.every(t => t.length >= 1));
// plantilla de 12 (6 titulares + 6 suplentes): todos distintos, también entre entrenadores
const big12 = Sorteo.draw(env, { size: 12 }, 20, rand);
assert.ok(big12.every(t => t.length === 12), "cada entrenador recibe 12");
assert.equal(new Set(big12.flat().map(s => fam(s.species))).size, 240, "240 familias distintas en la liga");
assert.equal(Sorteo.DEFAULTS().size, 12, "por defecto, 12");
assert.equal(Sorteo.opts({ size: 6 }).size, 12, "un 6 guardado de antes no manda si nunca se eligió"); assert.equal(Sorteo.opts({ size: 6, sizeSet: true }).size, 6, "pero sí si se eligió a mano");
console.log("SORTEO OK");
