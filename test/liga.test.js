// Pruebas del traductor Showdown → ROM (lib/ligamap.js) con ROMs sintéticas.
const fs = require("fs"), vm = require("vm"), assert = require("assert"), path = require("path");
const Core = require("../lib/romcore.js"), LigaMap = require("../lib/ligamap.js");
LigaMap.useCore(Core);
const S = process.argv[2];
const w = {}; w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../lib/pkmn.bundle.js"), "utf8"), w);
const { Dex, Teams, NAMES } = w.PKMN;
const R_ = p => { const b = fs.readFileSync(p); return { size: b.length, async read(o, l) { return new Uint8Array(b.subarray(o, o + l)); } }; };

async function open(file, mod) {
  let rom = await Core.openRom(R_(file));
  if (mod) rom = Core.overlay(rom, await Core.openModZip(R_(mod)));
  const cfg = await Core.detectGame(rom);
  const texts = [];
  for (const l of [6, 2]) { const t = await Core.loadText(rom, cfg, l); if (t) texts.push(t); }
  const data = await Core.loadGame(rom, cfg);
  const byId = {}; data.trainers.forEach(t => byId[t.id] = t);
  return { rom, cfg, texts, data, byId, R: LigaMap.makeResolver({ Dex, texts, names: NAMES, data, gen: cfg.gen }) };
}
const team = txt => Teams.import(txt);

(async () => {
  // ---- ORAS ----
  {
    const g = await open(S + "/fake.3ds");
    const sets = team(`Pikachu @ Leftovers
Ability: Lightning Rod
Level: 42
IVs: 31 HP / 0 Atk
- Surf
- Thunder Shock
- Hydro Pump

Bulbasaur @ Sitrus Berry
Ability: Chlorophyll
Level: 30
- Vine Whip
- Growl
- Flamethrower

Charizard @ Charizardite X
Level: 50
- Ember`);
    const { trainers, warns } = LigaMap.applyLeague([{ slot: 2, name: "Ana", sets }], g.R, g.byId);
    assert.equal(trainers.length, 1);
    const t = trainers[0];
    assert.equal(t.num, 2, "Charizard no existe en la ROM falsa");
    assert.ok(warns.some(x => /Flamethrower/.test(x)) && warns.some(x => /Charizard/.test(x)), warns.join("|"));
    const [a, b] = t.team;
    assert.deepEqual([a.species, a.level, a.item, a.ability, a.moves, a.form], [5, 42, 3, 3, [6, 4, 7, 0], 0]);
    assert.deepEqual([b.species, b.ability, b.item, b.moves], [1, 3, 2, [8, 9, 0, 0]]);
    assert.equal(a.iv, Math.round(155 / 6 * 255 / 31));
    assert.ok(t.moves && t.items);
    // se serializa y se vuelve a leer
    const mod = Core.buildMod(g.cfg, g.data, trainers);
    const back = Core.parseTrainer(6, 2, Core.garcFile(Core.parseGarc(mod["a/0/3/6"]), 2), Core.garcFile(Core.parseGarc(mod["a/0/3/8"]), 2));
    assert.deepEqual([back.num, back.team[0].species, back.team[0].moves, back.team[1].item], [2, 5, [6, 4, 7, 0], 2]);
    console.log("ORAS OK");
  }
  // ---- USUM ----
  {
    const g = await open(S + "/um.3ds");
    const sets = team(`Pikachu (F) @ Leftovers
Ability: Static
Shiny: Yes
Level: 77
EVs: 252 SpA / 252 Spe / 4 SpD
IVs: 0 Atk
Timid Nature
- Surf
- Thunder Shock`);
    const { trainers, warns } = LigaMap.applyLeague([{ slot: 2, name: "Bea", sets }], g.R, g.byId);
    assert.equal(warns.length, 0, warns.join("|"));
    const p = trainers[0].team[0];
    assert.deepEqual([p.species, p.level, p.nature, p.gender, p.shiny, p.ability, p.item, p.moves], [5, 77, 10, 2, true, 3, 3, [6, 4, 0, 0]]);
    assert.deepEqual([p.evs, p.ivs], [[0, 0, 0, 252, 4, 252], [31, 0, 31, 31, 31, 31]]);
    // los bytes desconocidos del Pokémon original se conservan
    const orig = g.byId[2].team[0].raw;
    const mod = Core.buildMod(g.cfg, g.data, trainers);
    const tp = Core.garcFile(Core.parseGarc(mod["a/1/0/7"]), 2);
    assert.equal(tp.length, 0x20);
    assert.equal(tp[0x0D], orig[0x0D]); assert.equal(tp[0x13], orig[0x13]);
    const back = Core.parseTrainer(7, 2, Core.garcFile(Core.parseGarc(mod["a/1/0/6"]), 2), tp);
    assert.deepEqual([back.num, back.team[0].species, back.team[0].nature, back.team[0].evs], [1, 5, 10, [0, 0, 0, 252, 4, 252]]);
    console.log("USUM OK");
  }
  // ---- USUM + mod de expansión (especie nueva) y megapiedra ----
  {
    const g = await open(S + "/um.3ds", S + "/um.3ds.mod.zip");
    const sets = team(`Sprigatito
Level: 20
- Vine Whip`);
    const r = LigaMap.applyLeague([{ slot: 1, name: "Cris", sets }], g.R, g.byId);
    assert.equal(r.warns.length, 0, r.warns.join("|"));
    assert.equal(r.trainers[0].team[0].species, 9);
    console.log("MOD OK");
  }
  // ---- Formas ----
  {
    const g = await open(S + "/um.3ds");
    // Mega ya hecha → base + megapiedra (la piedra no existe en la ROM falsa, solo Gengarita)
    const r = LigaMap.setToMon({ species: "Gengar-Mega", moves: [], ability: "", item: "" }, g.R, null, "x");
    assert.equal(r.mon, null, "Gengar no existe en la ROM falsa");
    const sp = Dex.species.get("Charizard-Mega-X");
    assert.equal(Dex.species.get(sp.baseSpecies).formeOrder.indexOf(sp.name), 1);
    console.log("FORMAS OK");
  }
})().catch(e => { console.error(e); process.exit(1); });
