const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const w = {}; w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../lib/pkmn.bundle.js"), "utf8"), w);
const { Dex } = w.PKMN;
const PK = require("../lib/ligapk.js");
assert.equal(PK.expFor(0, 50), 125000); assert.equal(PK.expFor(4, 100), 800000); assert.equal(PK.expFor(5, 100), 1250000); assert.equal(PK.expFor(3, 100), 1059860); assert.equal(PK.expFor(2, 100), 1640000); assert.equal(PK.expFor(1, 100), 600000);
const res = PK.fallbackResolver(Dex);
const set = { species: "Pikachu", level: 50, ability: "Static", item: "Light Ball", nature: "Timid", moves: ["Thunderbolt", "Volt Tackle", "Surf"], ivs: { hp: 31, atk: 0, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { spa: 252, spe: 252, hp: 4 } };
const r = PK.build(set, res, { ot: "Alvaro", nick: s => "Pikachu", rand: () => 0.5 });
const d = r.data, dv = new DataView(d.buffer);
assert.equal(d.length, 232); assert.equal(r.ext, "pk7");
assert.equal(dv.getUint16(8, true), 25, "especie"); assert.equal(dv.getUint16(0x5A, true), 85, "Rayo"); assert.equal(dv.getUint32(0x10, true), 125000, "EXP nivel 50");
assert.equal(d[0x1C], 10, "Miedosa/Timid"); assert.equal(d[0x14], 9, "Elec. Estática"); assert.equal(d[0x23 - 1], 252, "EV Atq. Esp.");
const iv = dv.getUint32(0x74, true); assert.equal(iv & 31, 31); assert.equal((iv >> 5) & 31, 0, "IV de ataque a 0");
let sum = 0; for (let o = 8; o < 232; o += 2) sum = (sum + dv.getUint16(o, true)) & 0xFFFF; assert.equal(dv.getUint16(6, true), sum, "suma de comprobación");
assert.equal(String.fromCharCode(d[0xB0]), "A");
assert.equal(dv.getUint16(0x0A, true), 236, "sin ROM se usa el número estándar del objeto (Bola Luminosa)"); assert.ok(!r.warns.some(x => /Light Ball/.test(x)));
// brillo: TID ^ SID ^ PID alto ^ PID bajo < 16
const sh = PK.build({ ...set, shiny: true }, res, { tid: 111, sid: 222, rand: () => 0.77 }).data, sv = new DataView(sh.buffer), pid = sv.getUint32(0x18, true);
assert.ok(((111 ^ 222 ^ (pid >>> 16) ^ (pid & 0xFFFF)) & 0xFFFF) < 16, "brillante");
// mega → especie base
assert.equal(new DataView(PK.build({ species: "Charizard-Mega-X", moves: [] }, res).data.buffer).getUint16(8, true), 6);
console.log("PK OK");
