// Prueba con una partida real si existe (SAVE_MAIN=ruta) y, si no, con una partida sintética.
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const w = {}; w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../lib/pkmn.bundle.js"), "utf8"), w);
const { Dex } = w.PKMN;
const PK = require("../lib/ligapk.js"), SV = require("../lib/ligasave.js");
// cifrado ida y vuelta
const pk = PK.build({ species: "Pikachu", level: 50, moves: ["Thunderbolt"] }, PK.fallbackResolver(Dex), { rand: () => 0.3 }).data;
const back = SV.decrypt(SV.encrypt(pk)); assert.deepStrictEqual([...back], [...pk], "cifrar y descifrar da lo mismo");
// partida sintética: cajas con huecos vacíos cifrados
const buf = new Uint8Array(SV.SIZE), BI = SV.SIZE - 0x200;
const blank = new Uint8Array(232); new DataView(blank.buffer).setUint32(0, 0x12345678, true); new DataView(blank.buffer).setUint16(6, SV.checksum(blank), true);
for (let s = 0; s < 960; s++) buf.set(SV.encrypt(blank), 0x5200 + s * 232);
const e = BI + 0x14 + 14 * 8; new DataView(buf.buffer).setUint32(e, 960 * 232, true); new DataView(buf.buffer).setUint16(e + 6, SV.crc16(buf, 0x5200, 960 * 232), true);
assert.ok(SV.inspect(buf).ok); assert.equal(SV.freeSlots(buf).length, 960);
const r = SV.inject(buf, [pk, pk, pk]); assert.equal(r.placed.length, 3); assert.equal(SV.freeSlots(r.out).length, 957); assert.ok(SV.inspect(r.out).ok, "la suma de comprobación se actualiza");
assert.equal(SV.decrypt(r.out.subarray(0x5200, 0x5200 + 232))[8], 25);
assert.throws(() => SV.inspect(new Uint8Array(10)).ok || (() => { throw 1; })());
const f = process.env.SAVE_MAIN;
if (f && fs.existsSync(f)) {
  const real = new Uint8Array(fs.readFileSync(f)); const i = SV.inspect(real); assert.ok(i.ok, i.error);
  const t = SV.trainerFromParty(real); assert.ok(t && t.ot, "lee tu entrenador");
  const n = SV.freeSlots(real).length, ri = SV.inject(real, [pk]); assert.equal(SV.freeSlots(ri.out).length, n - 1); assert.ok(SV.inspect(ri.out).ok);
  console.log("partida real:", t.ot, t.tid, t.sid, "huecos libres", n);
}
console.log("SAVE OK");
