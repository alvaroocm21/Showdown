const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const IA = require("../lib/ligaia.js");
const w = {}; w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../lib/pkmn.bundle.js"), "utf8"), w);
const { Dex } = w.PKMN;
const mon = (species, moves) => ({ species, level: 50, ability: "", item: "", nature: "Timid", moves });
// tipos
assert.equal(IA.typeMult(Dex, "Water", ["Fire"]), 2); assert.equal(IA.typeMult(Dex, "Water", ["Grass"]), 0.5);
assert.equal(IA.typeMult(Dex, "Electric", ["Ground"]), 0); assert.equal(IA.typeMult(Dex, "Rock", ["Fire", "Flying"]), 4);
// contra un rival de fuego, la IA prefiere agua a planta
const squad = [mon("Venusaur", ["Giga Drain", "Sludge Bomb"]), mon("Blastoise", ["Surf", "Ice Beam"]), mon("Charizard", ["Flamethrower", "Air Slash"])];
const rival = [mon("Charizard", ["Flamethrower", "Air Slash"])];
let order = IA.pick(Dex, squad, { n: 1, rivals: rival });
assert.equal(squad[order[0]].species, "Blastoise", "agua contra fuego");
// contra un rival de agua, prefiere planta o eléctrico a fuego
const squad2 = [mon("Charizard", ["Flamethrower"]), mon("Venusaur", ["Giga Drain"]), mon("Pikachu", ["Thunderbolt"])];
order = IA.pick(Dex, squad2, { n: 1, rivals: [mon("Blastoise", ["Surf", "Ice Beam"])] });
assert.notEqual(squad2[order[0]].species, "Charizard", "fuego pierde contra agua: " + squad2[order[0]].species);
// devuelve todos los índices, titulares primero
order = IA.pick(Dex, squad, { n: 2, rivals: rival }); assert.deepEqual([...order].sort(), [0, 1, 2]); assert.equal(order.length, 3);
// sancionados fuera, salvo que no quede nadie
order = IA.pick(Dex, squad, { n: 2, rivals: rival, suspended: new Set(["Blastoise"]) });
assert.ok(!order.slice(0, 2).includes(1), "el sancionado no es titular");
order = IA.pick(Dex, squad, { n: 3, rivals: rival, suspended: new Set(["Blastoise", "Venusaur", "Charizard"]) }); assert.equal(order.length, 3);
// amarillas: con una amarilla se evita si hay alternativas parecidas
const twin = [mon("Blastoise", ["Surf"]), mon("Blastoise", ["Surf"])];
order = IA.pick(Dex, twin, { n: 1, rivals: rival, yellows: { Blastoise: 0 } }); assert.equal(order.length, 2);
// siguiente rival más duro: se guardan los más fuertes en el banquillo
const big = [mon("Mewtwo", ["Psychic"]), mon("Garchomp", ["Earthquake"]), mon("Pidgey", ["Gust"]), mon("Rattata", ["Tackle"]), mon("Caterpie", ["Tackle"])];
order = IA.pick(Dex, big, { n: 3, rests: 0, rest: 2 });
const starters = order.slice(0, 3).map(i => big[i].species);
assert.ok(!starters.includes("Mewtwo") && !starters.includes("Garchomp"), "se guardan Mewtwo y Garchomp: " + starters);
order = IA.pick(Dex, big, { n: 3 }); assert.ok(order.slice(0, 3).map(i => big[i].species).includes("Mewtwo"), "sin descanso, juegan los fuertes");
// con rival débil/sin rival y plantilla de 12: elige 6 distintos
const names = ["Pikachu", "Gengar", "Snorlax", "Charizard", "Blastoise", "Venusaur", "Gyarados", "Alakazam", "Machamp", "Dragonite", "Lapras", "Arcanine"];
const sq12 = names.map(n => mon(n, ["Tackle"])); order = IA.pick(Dex, sq12, { n: 6, rivals: [mon("Charizard", ["Flamethrower"])] });
assert.equal(new Set(order).size, 12); assert.equal(order.slice(0, 6).length, 6);
console.log("IA OK");
