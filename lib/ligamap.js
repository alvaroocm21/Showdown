// Traduce equipos de Showdown (nombres en inglés) a Pokémon de entrenador de la ROM (ORAS / USUM).
// Módulo puro (sin DOM): funciona en el navegador (global LigaMap) y en Node (para las pruebas).
const LigaMap = (() => {
  const norm = s => String(s == null ? "" : s).replace(/♀/g, "f").replace(/♂/g, "m").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const NATURES = ["hardy", "lonely", "brave", "adamant", "naughty", "bold", "docile", "relaxed", "impish", "lax", "timid", "hasty", "serious", "jolly", "naive", "modest", "mild", "quiet", "bashful", "rash", "calm", "gentle", "sassy", "careful", "quirky"];
  const KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

  // texts: lista de tablas de texto (una por idioma) tal como las devuelve Core.loadText.
  // names: { s, m, a, i } con los nombres en español de Showdown por id (opcional, para ROMs sin textos en inglés).
  function makeResolver({ Dex, texts, names, data, gen }) {
    const idx = {};
    for (const list of ["species", "moves", "items", "abilities"]) {
      const m = new Map();
      for (const t of texts) (t[list] || []).forEach((s, i) => { const k = norm(s); if (k && !m.has(k)) m.set(k, i); });
      idx[list] = m;
    }
    const es = (kind, id) => (names && names[kind] && names[kind][id]) || "";
    function look(list, kind, obj) {
      const m = idx[list];
      if (m.has(norm(obj.name))) return m.get(norm(obj.name));
      const e = es(kind, obj.id);
      if (e && m.has(norm(e))) return m.get(norm(e));
      return -1;
    }
    return {
      gen, data, Dex,
      species: sp => look("species", "s", sp),
      move: mv => look("moves", "m", mv),
      item: it => look("items", "i", it),
      ability: ab => look("abilities", "a", ab),
      has: list => idx[list].size > 0
    };
  }

  // Devuelve { mon, warns } o { mon: null, warns } si el Pokémon no existe en la ROM.
  function setToMon(set, R, base, label) {
    const { Dex, gen, data } = R, warns = [];
    const w = m => warns.push(`${label}: ${m}`);
    let sp = Dex.species.get(set.species);
    if (!sp.exists) { w(`no conozco la especie «${set.species}»`); return { mon: null, warns }; }
    let item = set.item ? Dex.items.get(set.item) : null;
    // Una megaevolución ya hecha se escribe como el Pokémon base con su megapiedra (el rival megaevoluciona en combate).
    if (sp.isMega && sp.requiredItem) { item = Dex.items.get(sp.requiredItem); sp = Dex.species.get(sp.baseSpecies); }
    const baseSp = Dex.species.get(sp.baseSpecies || sp.name);
    let species = R.species(baseSp);
    if (species < 0) { w(`${sp.name} no existe en esta ROM`); return { mon: null, warns }; }
    let form = 0;
    if (sp.name !== baseSp.name) {
      const order = baseSp.formeOrder || [];
      const k = order.indexOf(sp.name);
      const per = data.personal[species];
      if (k > 0 && per && k < per.formCount) form = k;
      else w(`la forma ${sp.name} no está en la ROM; se usa ${baseSp.name}`);
    }
    const per = data.personal[Core_formEntry(data.personal, species, form)] || data.personal[species] || { abilities: [0, 0, 0] };

    // Habilidad: 0 = al azar entre las dos primeras, 1/2 = primera/segunda, 3 = oculta
    let ability = 0;
    if (set.ability) {
      const ab = R.ability(Dex.abilities.get(set.ability));
      if (ab < 0) w(`la habilidad ${set.ability} no existe en la ROM`);
      else {
        const a = per.abilities;
        if (ab === a[0]) ability = 1; else if (ab === a[1]) ability = 2; else if (ab === a[2]) ability = 3;
        else w(`${baseSp.name} no puede tener ${set.ability} en esta ROM; habilidad al azar`);
      }
    }
    let itemId = 0;
    if (item && item.exists) {
      itemId = R.item(item);
      if (itemId < 0) { w(`el objeto ${item.name} no existe en la ROM; sin objeto`); itemId = 0; }
    }
    const moves = [];
    for (const m of (set.moves || []).slice(0, 4)) {
      const mv = Dex.moves.get(m), id = mv.exists ? R.move(mv) : -1;
      if (id < 0) w(`el movimiento ${m} no existe en la ROM; se omite`); else moves.push(id);
    }
    while (moves.length < 4) moves.push(0);
    const gender = set.gender === "M" ? 1 : set.gender === "F" ? 2 : 0;
    const level = Math.max(1, Math.min(100, set.level | 0 || 50));
    const ivs = KEYS.map(k => set.ivs && set.ivs[k] != null ? Math.max(0, Math.min(31, set.ivs[k] | 0)) : 31);
    const evs = KEYS.map(k => set.evs && set.evs[k] != null ? Math.max(0, Math.min(255, set.evs[k] | 0)) : 0);

    let mon;
    if (gen === 7) {
      let nat = NATURES.indexOf(norm(set.nature)); if (nat < 0) nat = 0;
      mon = { gender, ability, nature: nat, evs, ivs, shiny: !!set.shiny, level, species, form, item: itemId, moves, raw: base && base.raw ? base.raw.slice() : null };
    } else {
      const iv = Math.round(ivs.reduce((a, b) => a + b, 0) / 6 * 255 / 31);
      mon = { iv, ability, ubit: 0, gender, level, species, form, item: itemId, moves };
    }
    return { mon, warns };
  }
  // formEntry se inyecta (viene de Core) para no depender del orden de carga
  let Core_formEntry = (personal, species) => species;
  function useCore(Core) { Core_formEntry = Core.formEntry; }

  // Aplica los equipos de la liga sobre los entrenadores de la ROM.
  // assignments: [{ slot, name, sets }] → { trainers: [entrenadores nuevos], warns: [..] }
  function applyLeague(assignments, R, byId) {
    const trainers = [], warns = [];
    for (const a of assignments) {
      const orig = byId[a.slot];
      if (!orig) { warns.push(`${a.name}: el entrenador #${a.slot} no existe en esta ROM`); continue; }
      const team = [];
      (a.sets || []).slice(0, 6).forEach((set, i) => {
        const r = setToMon(set, R, orig.team[i] || orig.team[0], `${a.name} · ${set.species}`);
        warns.push(...r.warns);
        if (r.mon) team.push(r.mon);
      });
      if (!team.length) { warns.push(`${a.name}: no tiene ningún Pokémon válido; se deja el equipo original del entrenador #${a.slot}`); continue; }
      const t = JSON.parse(JSON.stringify(orig));
      t.team = team; t.num = team.length;
      if (R.gen === 6) { t.moves = true; t.items = true; }
      trainers.push(t);
    }
    return { trainers, warns };
  }

  return { norm, makeResolver, setToMon, applyLeague, useCore, NATURES };
})();
if (typeof module !== "undefined") module.exports = LigaMap;
