// Genera archivos Pokémon (.pk7 de Ultra Sol/Luna, .pk6 de Rubí Omega/Zafiro Alfa) a partir de las plantillas de la liga,
// para meterlos en la caja de una partida (PKHeX u otro editor de partidas). Módulo puro: sirve en el navegador y en Node.
// Formato «almacenado» de 232 bytes sin cifrar, el mismo que exporta PKHeX.
const LigaPK = (() => {
  const { norm } = typeof LigaMap !== "undefined" ? LigaMap : require("./ligamap.js");
  const NATURES = (typeof LigaMap !== "undefined" ? LigaMap : require("./ligamap.js")).NATURES;
  // Experiencia necesaria para cada nivel según el grupo de crecimiento (0 rápido medio, 1 errático, 2 fluctuante, 3 parabólico, 4 rápido, 5 lento)
  function expFor(group, n) {
    n = Math.max(1, Math.min(100, n | 0)); const c = n * n * n; let e;
    switch (group) {
      case 1: e = n <= 50 ? c * (100 - n) / 50 : n <= 68 ? c * (150 - n) / 100 : n <= 98 ? c * Math.floor((1911 - 10 * n) / 3) / 500 : c * (160 - n) / 100; break;
      case 2: e = n <= 15 ? c * (Math.floor((n + 1) / 3) + 24) / 50 : n <= 35 ? c * (n + 14) / 50 : c * (Math.floor(n / 2) + 32) / 50; break;
      case 3: e = 6 * c / 5 - 15 * n * n + 100 * n - 140; break;
      case 4: e = 4 * c / 5; break;
      case 5: e = 5 * c / 4; break;
      default: e = c;
    }
    return Math.max(0, Math.floor(e));
  }
  const KEYS = ["hp", "atk", "def", "spe", "spa", "spd"];     // orden de los datos en el archivo
  const IVK = ["hp", "atk", "def", "spe", "spa", "spd"];
  function putStr(d, off, s, max) { s = String(s || "").slice(0, max); for (let i = 0; i < s.length; i++) { d[off + i * 2] = s.charCodeAt(i) & 255; d[off + i * 2 + 1] = s.charCodeAt(i) >> 8; } }

  // R: { Dex, gen, data: { personal }, species(sp), move(mv), item(it), ability(ab) } (como el de LigaMap, o uno de respaldo por número de Pokédex)
  // opts: { ot, tid, sid, lang, nick, rand }
  function build(set, R, opts = {}) {
    const { Dex, gen } = R, warns = [], w = m => warns.push(m), rand = opts.rand || Math.random;
    let sp = Dex.species.get(set.species);
    if (!sp.exists) return { data: null, warns: [`no conozco la especie «${set.species}»`] };
    let item = set.item ? Dex.items.get(set.item) : null;
    if (sp.isMega && sp.requiredItem) { item = Dex.items.get(sp.requiredItem); sp = Dex.species.get(sp.baseSpecies); }
    const base = Dex.species.get(sp.baseSpecies || sp.name), label = sp.name;
    const species = R.species(base);
    if (species < 0) return { data: null, warns: [`${label} no existe en esta ROM`] };
    let form = 0;
    if (sp.name !== base.name) { const k = (base.formeOrder || []).indexOf(sp.name); if (k > 0) form = k; else w(`${label}: se usa la forma normal`); }
    const per = (R.data && R.data.personal && R.data.personal[species]) || null;
    const level = Math.max(1, Math.min(100, set.level | 0 || 50));
    const d = new Uint8Array(232), dv = new DataView(d.buffer);
    const ec = Math.floor(rand() * 0x100000000) >>> 0; dv.setUint32(0, ec, true);
    const tid = opts.tid != null ? opts.tid : 12345, sid = opts.sid != null ? opts.sid : 54321;
    dv.setUint16(0x08, species, true);
    let itemId = 0; if (item && item.exists) { itemId = R.item(item); if (itemId < 0) { w(`${label}: el objeto ${item.name} no existe en la ROM; sin objeto`); itemId = 0; } }
    dv.setUint16(0x0A, itemId, true); dv.setUint16(0x0C, tid, true); dv.setUint16(0x0E, sid, true);
    dv.setUint32(0x10, expFor(per && per.expGroup != null ? per.expGroup : 0, level), true);
    // habilidad
    let abId = 0, abNum = 1;
    if (set.ability) {
      const ab = Dex.abilities.get(set.ability); abId = R.ability(ab);
      if (abId < 0) { w(`${label}: la habilidad ${set.ability} no existe en la ROM`); abId = 0; }
      const key = Object.keys(base.abilities || {}).find(k => norm(base.abilities[k]) === norm(ab.name));
      abNum = key === "H" ? 4 : key === "1" ? 2 : 1;
    }
    if (abId > 255) { w(`${label}: la habilidad no cabe en este formato; se deja sin habilidad (PKHeX la corrige)`); abId = 0; }
    d[0x14] = abId; d[0x15] = abNum;
    // PID (con brillo si toca) y naturaleza
    let pid = Math.floor(rand() * 0x100000000) >>> 0;
    if (set.shiny) { const lo = pid & 0xFFFF; pid = ((((tid ^ sid ^ lo) & 0xFFFF) << 16) | lo) >>> 0; }
    dv.setUint32(0x18, pid, true);
    let nat = NATURES.indexOf(norm(set.nature)); if (nat < 0) nat = 0; d[0x1C] = nat;
    // sexo
    let gender = set.gender === "F" ? 1 : set.gender === "M" ? 0 : null;
    if (gender == null) {
      const r = per ? per.gender : null;
      gender = base.gender === "N" || r === 255 ? 2 : base.gender === "F" || r === 254 ? 1 : 0;
    }
    d[0x1D] = (gender << 1) | ((form & 31) << 3);
    const evs = KEYS.map(k => Math.max(0, Math.min(252, (set.evs && set.evs[k] != null ? set.evs[k] : 0) | 0)));
    evs.forEach((v, i) => d[0x1E + i] = v);
    // ataques (y PP máximos)
    const mv = [];
    for (const m of (set.moves || []).slice(0, 4)) { const o = Dex.moves.get(m), id = o.exists ? R.move(o) : -1; if (id < 0) w(`${label}: el ataque ${m} no existe en la ROM; se omite`); else mv.push([id, o.pp || 5]); }
    mv.forEach(([id, pp], i) => { dv.setUint16(0x5A + i * 2, id, true); d[0x62 + i] = pp; });
    // IVs
    const iv = IVK.map(k => Math.max(0, Math.min(31, set.ivs && set.ivs[k] != null ? set.ivs[k] | 0 : 31)));
    let ivw = 0; iv.forEach((v, i) => ivw |= v << (5 * i)); dv.setUint32(0x74, ivw >>> 0, true);
    // nombre, entrenador original, versión, datos de captura
    putStr(d, 0x40, opts.nick ? opts.nick(set) : sp.name, 12);
    putStr(d, 0xB0, opts.ot || "Liga", 12);
    d[0xCA] = 70;                                    // amistad con el entrenador original
    const now = new Date(); d[0xD4] = now.getFullYear() - 2000; d[0xD5] = now.getMonth() + 1; d[0xD6] = now.getDate();
    d[0xDC] = 4;                                     // Poké Ball
    d[0xDD] = Math.min(100, level);                  // nivel de captura
    d[0xDF] = gen === 7 ? 33 : 27;                   // Ultra Luna / Rubí Omega
    d[0xE3] = opts.lang != null ? opts.lang : 7;     // español
    // suma de comprobación
    let sum = 0; for (let o = 8; o < 232; o += 2) sum = (sum + dv.getUint16(o, true)) & 0xFFFF;
    dv.setUint16(0x06, sum, true);
    return { data: d, warns: warns.map(m => m.startsWith(label) ? m : `${label}: ${m}`), ext: gen === 7 ? "pk7" : "pk6" };
  }

  // Respaldo cuando no hay ROM abierta: números de la Pokédex (valen en Ultra Sol/Luna para especies y ataques «de siempre»).
  function fallbackResolver(Dex) {
    return { Dex, gen: 7, data: { personal: [] }, species: s => s.num > 0 ? s.num : -1, move: m => m.num > 0 ? m.num : -1, ability: a => a.num > 0 ? a.num : -1, item: () => -1, offline: true };
  }
  return { build, expFor, fallbackResolver };
})();
if (typeof module !== "undefined") module.exports = LigaPK;
