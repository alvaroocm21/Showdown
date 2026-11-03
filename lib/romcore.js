// Núcleo: lectura de ROM 3DS (NCSD/NCCH/RomFS), GARC, textos y entrenadores de ORAS.
const Core = (() => {
  const MU = 0x200;
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 4294967296;
  const ascii = (b, o, n) => { let s = ""; for (let i = 0; i < n; i++) { const c = b[o + i]; if (!c) break; s += String.fromCharCode(c); } return s; };
  const align = (v, a) => Math.ceil(v / a) * a;
  const hex64 = (b, o) => { let s = ""; for (let i = 7; i >= 0; i--) s += b[o + i].toString(16).padStart(2, "0"); return s.toUpperCase(); };

  class RomError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

  function fileReader(file) {
    return {
      size: file.size,
      async read(off, len) {
        const buf = await file.slice(off, off + len).arrayBuffer();
        if (buf.byteLength !== len) throw new RomError("short", "El archivo se acabó antes de lo esperado.");
        return new Uint8Array(buf);
      }
    };
  }

  // ---------- ROM ----------
  async function openRom(reader) {
    if (reader.size < 0x4000) throw new RomError("small", "El archivo es demasiado pequeño para ser una ROM de 3DS.");
    const head = await reader.read(0, 0x200);
    let ncchOff;
    if (ascii(head, 0x100, 4) === "NCSD") ncchOff = u32(head, 0x120) * MU;
    else if (ascii(head, 0x100, 4) === "NCCH") ncchOff = 0;
    else throw new RomError("format", "No parece una ROM .3ds/.cci (falta la cabecera NCSD).");

    const n = await reader.read(ncchOff, 0x200);
    if (ascii(n, 0x100, 4) !== "NCCH") throw new RomError("format", "No encuentro la partición del juego dentro de la ROM.");
    const titleId = hex64(n, 0x118);
    const productCode = ascii(n, 0x150, 16);
    const noCrypto = (n[0x18F] & 4) !== 0;
    const romfsOff = ncchOff + u32(n, 0x1B0) * MU;
    if (!u32(n, 0x1B0)) throw new RomError("format", "La ROM no tiene RomFS.");

    const ivfc = await reader.read(romfsOff, 0x60);
    if (ascii(ivfc, 0, 4) !== "IVFC")
      throw new RomError("encrypted", noCrypto
        ? "El sistema de archivos del juego está dañado."
        : "La ROM está cifrada. Necesitas un volcado descifrado (por ejemplo, GodMode9 → «Decrypt file» o el .3ds que usa Azahar).");
    const mhs = u32(ivfc, 0x08);
    const bs = 2 ** u32(ivfc, 0x4C);
    let lvl3 = -1, info;
    for (const c of [align(0x60 + mhs, bs), align(mhs, bs), 0x1000]) {
      const h = await reader.read(romfsOff + c, 0x28);
      if (u32(h, 0) === 0x28) { lvl3 = romfsOff + c; info = h; break; }
    }
    if (lvl3 < 0) throw new RomError("format", "No consigo leer la tabla de archivos del juego.");
    const dirMeta = await reader.read(lvl3 + u32(info, 0x0C), u32(info, 0x10));
    const fileMeta = await reader.read(lvl3 + u32(info, 0x1C), u32(info, 0x20));
    const dataBase = lvl3 + u32(info, 0x24);

    const name16 = (b, o, len) => { let s = ""; for (let i = 0; i < len; i += 2) s += String.fromCharCode(u16(b, o + i)); return s; };
    const NONE = 0xFFFFFFFF;
    function findDir(dir, name) {
      for (let d = u32(dirMeta, dir + 8); d !== NONE; d = u32(dirMeta, d + 4))
        if (name16(dirMeta, d + 24, u32(dirMeta, d + 20)) === name) return d;
      return -1;
    }
    function findFile(dir, name) {
      for (let f = u32(dirMeta, dir + 12); f !== NONE; f = u32(fileMeta, f + 4))
        if (name16(fileMeta, f + 32, u32(fileMeta, f + 28)) === name) return f;
      return -1;
    }
    function stat(path) {
      const parts = path.split("/");
      let d = 0;
      for (let i = 0; i < parts.length - 1; i++) { d = findDir(d, parts[i]); if (d < 0) return null; }
      const f = findFile(d, parts[parts.length - 1]);
      if (f < 0) return null;
      return { offset: dataBase + u64(fileMeta, f + 8), size: u64(fileMeta, f + 16) };
    }
    async function readFile(path) {
      const s = stat(path);
      if (!s) return null;
      return reader.read(s.offset, s.size);
    }
    // Lista de todos los archivos del RomFS: [{ path, size }]
    function list() {
      const out = [];
      (function walk(dir, prefix) {
        for (let f = u32(dirMeta, dir + 12); f !== NONE; f = u32(fileMeta, f + 4))
          out.push({ path: prefix + name16(fileMeta, f + 32, u32(fileMeta, f + 28)), size: u64(fileMeta, f + 16) });
        for (let d = u32(dirMeta, dir + 8); d !== NONE; d = u32(dirMeta, d + 4))
          walk(d, prefix + name16(dirMeta, d + 24, u32(dirMeta, d + 20)) + "/");
      })(0, "");
      return out;
    }
    return { titleId, productCode, stat, readFile, list };
  }

  // ---------- GARC ----------
  function parseGarc(b) {
    if (ascii(b, 0, 4) !== "CRAG") throw new RomError("garc", "Archivo GARC no válido.");
    const hdrSize = u32(b, 4), version = u16(b, 0xA), dataOff = u32(b, 0x10);
    const padTo = version === 0x0600 ? u32(b, 0x20) || 4 : 4;
    let p = hdrSize;
    if (ascii(b, p, 4) !== "OTAF") throw new RomError("garc", "GARC sin tabla FATO.");
    const fatoSize = u32(b, p + 4), count = u16(b, p + 8);
    const fato = []; for (let i = 0; i < count; i++) fato.push(u32(b, p + 12 + i * 4));
    p += fatoSize;
    if (ascii(b, p, 4) !== "BTAF") throw new RomError("garc", "GARC sin tabla FATB.");
    const fatbBase = p + 12;
    const entries = [];
    for (let i = 0; i < count; i++) {
      let q = fatbBase + fato[i];
      const vector = u32(b, q); q += 4;
      const subs = [];
      for (let bit = 0; bit < 32; bit++) {
        if (!((vector >>> bit) & 1)) continue;
        const start = u32(b, q), len = u32(b, q + 8); q += 12;
        subs.push({ bit, data: b.slice(dataOff + start, dataOff + start + len) });
      }
      entries.push({ vector, subs });
    }
    return { hdrSize, version, padTo, entries };
  }
  const garcFile = (g, i) => g.entries[i] && g.entries[i].subs[0] ? g.entries[i].subs[0].data : null;

  function buildGarc(g) {
    const n = g.entries.length;
    const fatoSize = 0xC + 4 * n;
    let fatbBody = 0; const fatoOffs = [];
    for (const e of g.entries) { fatoOffs.push(fatbBody); fatbBody += 4 + 12 * e.subs.length; }
    const fatbSize = 0xC + fatbBody;
    const dataOff = g.hdrSize + fatoSize + fatbSize + 0xC;
    let od = 0, largest = 0, largestPad = 0;
    const lay = g.entries.map(e => e.subs.map(s => {
      const len = s.data.length, pad = (g.padTo - (len % g.padTo)) % g.padTo;
      const r = { start: od, end: od + len + pad, len, pad };
      if (len > largest) { largest = len; largestPad = len + pad; }
      od = r.end; return r;
    }));
    const out = new Uint8Array(dataOff + od);
    const dv = new DataView(out.buffer);
    const w32 = (o, v) => dv.setUint32(o, v >>> 0, true), w16 = (o, v) => dv.setUint16(o, v, true);
    const wmag = (o, s) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
    wmag(0, "CRAG"); w32(4, g.hdrSize); w16(8, 0xFEFF); w16(0xA, g.version); w32(0xC, 4);
    w32(0x10, dataOff); w32(0x14, out.length);
    if (g.hdrSize >= 0x24) { w32(0x18, largestPad); w32(0x1C, largest); w32(0x20, g.padTo); }
    else w32(0x18, largest);
    let p = g.hdrSize;
    wmag(p, "OTAF"); w32(p + 4, fatoSize); w16(p + 8, n); w16(p + 10, 0xFFFF);
    fatoOffs.forEach((v, i) => w32(p + 12 + i * 4, v));
    p += fatoSize;
    wmag(p, "BTAF"); w32(p + 4, fatbSize); w32(p + 8, n);
    let q = p + 12;
    g.entries.forEach((e, i) => {
      w32(q, e.vector); q += 4;
      lay[i].forEach(r => { w32(q, r.start); w32(q + 4, r.end); w32(q + 8, r.len); q += 12; });
    });
    p += fatbSize;
    wmag(p, "BMIF"); w32(p + 4, 0xC); w32(p + 8, od);
    g.entries.forEach((e, i) => e.subs.forEach((s, j) => {
      const r = lay[i][j];
      out.set(s.data, dataOff + r.start);
      out.fill(0xFF, dataOff + r.start + r.len, dataOff + r.end);
    }));
    return out;
  }

  // ---------- Texto ----------
  function decodeText(b) {
    if (!b || b.length < 0x14) return [];
    const lines = u16(b, 2), sdo = u32(b, 0xC);
    const res = [];
    let key = 0x7C89;
    for (let i = 0; i < lines; i++) {
      const off = u32(b, sdo + 4 + i * 8) + sdo, len = u16(b, sdo + 8 + i * 8);
      let k = key; const chars = [];
      for (let j = 0; j < len; j++) {
        chars.push(u16(b, off + j * 2) ^ k);
        k = ((k << 3) | (k >>> 13)) & 0xFFFF;
      }
      let s = "";
      for (let j = 0; j < chars.length; j++) {
        const c = chars[j];
        if (c === 0) break;
        if (c === 0x10) {
          const cnt = chars[j + 1], v = chars[j + 2];
          j += 1 + cnt;
          if (v === 0xBE02 || v === 0xBDFF) j += 1;
          continue;
        }
        s += c === 0xE08E ? "♂" : c === 0xE08F ? "♀" : c === 0xE08D ? "…" : c === 0xE07F ? " " : String.fromCharCode(c);
      }
      res.push(s);
      key = (key + 0x2983) & 0xFFFF;
    }
    return res;
  }


  // Reescribe líneas de un archivo de texto (las demás se copian tal cual). changes: { línea: "texto nuevo" }
  function editText(b, changes) {
    const n = u16(b, 2), sdo = u32(b, 0xC), key0 = 0x7C89;
    const lines = [];
    for (let i = 0; i < n; i++) {
      const off = u32(b, sdo + 4 + i * 8) + sdo, len = u16(b, sdo + 8 + i * 8), extra = u16(b, sdo + 10 + i * 8);
      let words;
      if (Object.prototype.hasOwnProperty.call(changes, i)) {
        const units = [];
        for (const ch of String(changes[i])) {
          const c = ch === "♂" ? 0xE08E : ch === "♀" ? 0xE08F : ch.codePointAt(0);
          if (c > 0xFFFF) { units.push(0xD800 + ((c - 0x10000) >> 10), 0xDC00 + ((c - 0x10000) & 0x3FF)); } else units.push(c);
        }
        units.push(0);
        let k = (key0 + i * 0x2983) & 0xFFFF; words = [];
        for (const c of units) { words.push(c ^ k); k = ((k << 3) | (k >>> 13)) & 0xFFFF; }
      } else { words = []; for (let j = 0; j < len; j++) words.push(u16(b, off + j * 2)); }
      lines.push({ words, extra });
    }
    let dataLen = 0; lines.forEach(l => dataLen += l.words.length * 2);
    const total = 4 + 8 * n + dataLen, out = new Uint8Array(sdo + total), dv = new DataView(out.buffer);
    out.set(b.subarray(0, sdo)); dv.setUint32(4, total, true); dv.setUint32(sdo, total, true);
    let o = 4 + 8 * n;
    lines.forEach((l, i) => {
      dv.setUint32(sdo + 4 + i * 8, o, true); dv.setUint16(sdo + 8 + i * 8, l.words.length, true); dv.setUint16(sdo + 10 + i * 8, l.extra, true);
      l.words.forEach((w, j) => dv.setUint16(sdo + o + j * 2, w, true)); o += l.words.length * 2;
    });
    return out;
  }
  // Pone nombre a entrenadores en los textos de la ROM. renames: { idEntrenador: "Nombre" }
  // langs: idiomas a escribir (por defecto, todos los que haya); con uno solo el .zip pesa mucho menos.
  async function buildNames(rom, game, renames, langs) {
    const out = {};
    for (const [l] of LANGS) {
      if (langs && !langs.includes(l)) continue;
      const path = garcPath(game.textBase + l), raw = await rom.readFile(path);
      if (!raw) continue;
      let g; try { g = parseGarc(raw); } catch (e) { continue; }
      const idx = game.text.trainers, f = garcFile(g, idx);
      if (!f) continue;
      const count = decodeText(f).length, ch = {};
      for (const [id, name] of Object.entries(renames)) if (+id < count) ch[id] = name;
      if (!Object.keys(ch).length) continue;
      g.entries[idx].subs[0].data = editText(f, ch);
      out[path] = buildGarc(g);
    }
    return out;
  }

  // ---------- Juegos ----------
  const garcPath = n => `a/${Math.floor(n / 100) % 10}/${Math.floor(n / 10) % 10}/${n % 10}`;
  const GAMES = {
    oras: {
      gen: 6, name: "Rubí Omega / Zafiro Alfa", personalSize: 0x50,
      paths: { trdata: garcPath(36), trpoke: garcPath(38), personal: garcPath(195), levelup: garcPath(191) },
      textBase: 71,
      text: { forms: 5, moves: 14, types: 18, classes: 21, trainers: 22, abilities: 37, natures: 51, species: 98, items: 114 },
      titles: { "000400000011C400": "Rubí Omega", "000400000011C500": "Zafiro Alfa" }
    },
    usum: {
      gen: 7, name: "Ultra Sol / Ultra Luna", personalSize: 0x54,
      paths: { trdata: garcPath(106), trpoke: garcPath(107), personal: garcPath(17), levelup: garcPath(13) },
      textBase: 30,
      text: { items: 40, species: 60, natures: 92, abilities: 101, trainers: 110, classes: 111, types: 112, moves: 118, forms: 119 },
      titles: { "00040000001B5000": "Ultra Sol", "00040000001B5100": "Ultra Luna" }
    }
  };
  const LANGS = [[6, "Español"], [2, "English"], [3, "Français"], [4, "Italiano"], [5, "Deutsch"], [1, "日本語 (漢字)"], [0, "日本語 (カナ)"], [7, "한국어"], [8, "简体中文"], [9, "繁體中文"]];

  async function detectGame(rom) {
    for (const [k, g] of Object.entries(GAMES)) if (g.titles[rom.titleId]) return { key: k, ...g, title: g.titles[rom.titleId] };
    // Hack con otro Title ID: probar por los archivos
    for (const [k, g] of Object.entries(GAMES)) {
      const p = await rom.readFile(g.paths.personal);
      if (!p) continue;
      try {
        const last = garcFile(parseGarc(p), parseGarc(p).entries.length - 1);
        if (last && last.length % g.personalSize === 0 && await rom.readFile(g.paths.trpoke)) return { key: k, ...g, title: g.name };
      } catch (e) {}
    }
    throw new RomError("game", "No reconozco el juego. Este editor funciona con Rubí Omega, Zafiro Alfa, Ultra Sol y Ultra Luna.");
  }

  async function loadText(rom, game, lang) {
    const raw = await rom.readFile(garcPath(game.textBase + lang));
    if (!raw) return null;
    let g; try { g = parseGarc(raw); } catch (e) { return null; }
    const t = {};
    for (const [k, i] of Object.entries(game.text)) t[k] = decodeText(garcFile(g, i));
    if (!t.species.length || !t.moves.length) return null;
    return t;
  }

  function parsePersonal(g, size) {
    const all = garcFile(g, g.entries.length - 1);
    const count = Math.floor(all.length / size), list = [];
    for (let i = 0; i < count; i++) {
      const o = i * size;
      list.push({
        types: [all[o + 6], all[o + 7]], gender: all[o + 0x12],
        abilities: [all[o + 0x18], all[o + 0x19], all[o + 0x1A]],
        formIndex: u16(all, o + 0x1C), formCount: all[o + 0x20]
      });
    }
    return list;
  }
  function formEntry(personal, species, form) {
    const p = personal[species]; if (!p) return 0;
    if (form <= 0 || p.formIndex <= 0 || form >= p.formCount) return species;
    return p.formIndex + form - 1;
  }
  function parseLearnset(b) {
    const r = [];
    if (!b) return r;
    for (let o = 0; o + 4 <= b.length; o += 4) {
      const m = u16(b, o), l = u16(b, o + 2);
      if (m === 0xFFFF) break;
      r.push([m, l]);
    }
    return r;
  }
  function levelMoves(learnset, level) {
    const arr = [];
    for (const [m, l] of learnset || []) {
      if (l > level) continue;
      const k = arr.indexOf(m); if (k >= 0) arr.splice(k, 1);
      arr.push(m); if (arr.length > 4) arr.shift();
    }
    while (arr.length < 4) arr.push(0);
    return arr;
  }

  // ---------- Entrenadores gen 6 (ORAS) ----------
  function parseTrainer6(id, trd, trp) {
    const format = u16(trd, 0);
    const t = { id, gen: 6, cls: u16(trd, 2), num: trd[7], moves: (format & 1) === 1, items: (format & 2) === 2, battleType: trd[6], team: [] };
    if (t.num > 0 && trp && trp.length) {
      const sz = Math.floor(trp.length / t.num);
      for (let i = 0; i < t.num; i++) {
        const o = i * sz, pid = trp[o + 1];
        const pk = { iv: trp[o], ability: pid >> 4, ubit: (pid >> 3) & 1, gender: pid & 7, level: u16(trp, o + 2), species: u16(trp, o + 4), form: u16(trp, o + 6), item: 0, moves: [0, 0, 0, 0] };
        let q = o + 8;
        if (t.items) { pk.item = u16(trp, q); q += 2; }
        if (t.moves) for (let m = 0; m < 4; m++) pk.moves[m] = u16(trp, q + m * 2);
        t.team.push(pk);
      }
    }
    return t;
  }
  function writeTrainer6(t, origTrd) {
    const trd = new Uint8Array(origTrd);
    const items = t.items || t.team.some(p => p.item > 0);
    const fmt = (u16(trd, 0) & ~3) | (t.moves ? 1 : 0) | (items ? 2 : 0);
    trd[0] = fmt & 0xFF; trd[1] = fmt >> 8;
    trd[7] = t.team.length;
    const sz = 8 + (items ? 2 : 0) + (t.moves ? 8 : 0);
    const trp = new Uint8Array(sz * t.team.length);
    const dv = new DataView(trp.buffer);
    t.team.forEach((p, i) => {
      const o = i * sz;
      trp[o] = p.iv & 0xFF;
      trp[o + 1] = ((p.ability & 0xF) << 4) | ((p.ubit & 1) << 3) | (p.gender & 7);
      dv.setUint16(o + 2, p.level, true); dv.setUint16(o + 4, p.species, true); dv.setUint16(o + 6, p.form, true);
      let q = o + 8;
      if (items) { dv.setUint16(q, p.item, true); q += 2; }
      if (t.moves) p.moves.forEach((m, k) => dv.setUint16(q + k * 2, m, true));
    });
    return { trd, trp };
  }

  // ---------- Entrenadores gen 7 (USUM) ----------
  const P7 = 0x20;
  function parseTrainer7(id, trd, trp) {
    const t = { id, gen: 7, cls: u16(trd, 0), battleType: trd[2], num: trd[3], moves: true, items: true, team: [] };
    const n = Math.min(t.num, Math.floor((trp ? trp.length : 0) / P7));
    for (let i = 0; i < n; i++) {
      const o = i * P7, iv = u32(trp, o + 8);
      t.team.push({
        gender: trp[o] & 3, ability: (trp[o] >> 4) & 3, nature: trp[o + 1],
        evs: Array.from(trp.slice(o + 2, o + 8)),
        ivs: [0, 5, 10, 15, 20, 25].map(s => (iv >>> s) & 31), shiny: ((iv >>> 30) & 1) === 1,
        level: trp[o + 0xE], species: u16(trp, o + 0x10), form: trp[o + 0x12], item: u16(trp, o + 0x14),
        moves: [0, 1, 2, 3].map(k => u16(trp, o + 0x18 + k * 2)),
        raw: Array.from(trp.slice(o, o + P7))
      });
    }
    return t;
  }
  function writeTrainer7(t, origTrd) {
    const trd = new Uint8Array(origTrd);
    trd[3] = t.team.length;
    const trp = new Uint8Array(P7 * t.team.length);
    const dv = new DataView(trp.buffer);
    t.team.forEach((p, i) => {
      const o = i * P7;
      if (p.raw && p.raw.length === P7) trp.set(p.raw, o);
      trp[o] = (trp[o] & 0xCC) | ((p.ability & 3) << 4) | (p.gender & 3);
      trp[o + 1] = p.nature & 0xFF;
      p.evs.forEach((v, k) => trp[o + 2 + k] = Math.max(0, Math.min(255, v | 0)));
      let iv = (dv.getUint32(o + 8, true) & 0x80000000) >>> 0;
      p.ivs.forEach((v, k) => { iv = (iv | ((Math.max(0, Math.min(31, v | 0))) << (k * 5))) >>> 0; });
      if (p.shiny) iv = (iv | 0x40000000) >>> 0;
      dv.setUint32(o + 8, iv, true);
      trp[o + 0xE] = p.level & 0xFF;
      dv.setUint16(o + 0x10, p.species, true); trp[o + 0x12] = p.form & 0xFF;
      dv.setUint16(o + 0x14, p.item, true);
      p.moves.forEach((m, k) => dv.setUint16(o + 0x18 + k * 2, m, true));
    });
    return { trd, trp };
  }
  const parseTrainer = (gen, id, trd, trp) => gen === 7 ? parseTrainer7(id, trd, trp) : parseTrainer6(id, trd, trp);
  const writeTrainer = (t, trd) => t.gen === 7 ? writeTrainer7(t, trd) : writeTrainer6(t, trd);
  function newMon(gen, base) {
    if (gen === 7) return { gender: 0, ability: 0, nature: 0, evs: [0, 0, 0, 0, 0, 0], ivs: [31, 31, 31, 31, 31, 31], shiny: false, level: base.level, species: base.species, form: 0, item: 0, moves: [0, 0, 0, 0], raw: null };
    return { iv: base.iv, ability: 0, ubit: 0, gender: 0, level: base.level, species: base.species, form: 0, item: 0, moves: [0, 0, 0, 0] };
  }

  async function loadGame(rom, game) {
    const garc = {};
    for (const [k, p] of Object.entries(game.paths)) {
      const raw = await rom.readFile(p);
      if (!raw) throw new RomError("missing", `Falta el archivo ${p} en la ROM.`);
      garc[k] = parseGarc(raw);
    }
    const n = Math.min(garc.trdata.entries.length, garc.trpoke.entries.length);
    const trainers = [];
    for (let i = 1; i < n; i++) {
      const trd = garcFile(garc.trdata, i);
      if (!trd || trd.length < 8) continue;
      trainers.push(parseTrainer(game.gen, i, trd, garcFile(garc.trpoke, i)));
    }
    const personal = parsePersonal(garc.personal, game.personalSize);
    const learnsets = garc.levelup.entries.map(e => parseLearnset(e.subs[0] && e.subs[0].data));
    return { garc, trainers, personal, learnsets };
  }

  function buildMod(game, data, edited) {
    const copy = g => ({ ...g, entries: g.entries.map(e => ({ ...e, subs: e.subs.map(s => ({ ...s })) })) });
    const trdG = copy(data.garc.trdata), trpG = copy(data.garc.trpoke);
    for (const t of edited) {
      const { trd, trp } = writeTrainer(t, garcFile(data.garc.trdata, t.id));
      trdG.entries[t.id].subs[0].data = trd;
      trpG.entries[t.id].subs[0].data = trp;
    }
    return { [game.paths.trdata]: buildGarc(trdG), [game.paths.trpoke]: buildGarc(trpG) };
  }

  // ---------- Mod en .zip (superpuesto a la ROM) ----------
  async function inflateRaw(data) {
    const ds = new DecompressionStream("deflate-raw");
    const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function openModZip(reader) {
    const tailLen = Math.min(reader.size, 65557);
    const tail = await reader.read(reader.size - tailLen, tailLen);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new RomError("zip", "No es un .zip válido. Si el mod viene en .7z o .rar, descomprímelo y vuelve a comprimir la carpeta en .zip (por ejemplo con ZArchiver).");
    let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF) {
      const loc = e - 20;
      if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new RomError("zip", "Formato ZIP64 no compatible.");
      const z = await reader.read(u64(tail, loc + 8), 56);
      count = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48);
    }
    const cd = await reader.read(cdOff, cdSize);
    const files = new Map(); let tid = null;
    const dec = new TextDecoder();
    for (let p = 0, i = 0; i < count && p + 46 <= cd.length; i++) {
      if (u32(cd, p) !== 0x02014b50) break;
      const method = u16(cd, p + 10), nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32);
      let comp = u32(cd, p + 20), size = u32(cd, p + 24), off = u32(cd, p + 42);
      const name = dec.decode(cd.slice(p + 46, p + 46 + nl)).replace(/\\/g, "/");
      for (let x = p + 46 + nl; x + 4 <= p + 46 + nl + xl;) {
        const id = u16(cd, x), len = u16(cd, x + 2); let y = x + 4;
        if (id === 1) {
          if (size === 0xFFFFFFFF) { size = u64(cd, y); y += 8; }
          if (comp === 0xFFFFFFFF) { comp = u64(cd, y); y += 8; }
          if (off === 0xFFFFFFFF) { off = u64(cd, y); }
        }
        x += 4 + len;
      }
      const m = name.match(/(?:^|\/)romfs\/(a\/\d\/\d\/\d)$/i);
      if (m) {
        files.set(m[1].toLowerCase(), { method, comp, size, off });
        const t = name.match(/([0-9A-Fa-f]{16})\/romfs\//); if (t) tid = t[1].toUpperCase();
      }
      p += 46 + nl + xl + cl;
    }
    if (!files.size) throw new RomError("zip", "En el .zip no hay ninguna carpeta romfs con archivos del juego.");
    async function readFile(path) {
      const f = files.get(path); if (!f) return null;
      const lh = await reader.read(f.off, 30);
      const start = f.off + 30 + u16(lh, 26) + u16(lh, 28);
      const data = await reader.read(start, f.comp);
      if (f.method === 0) return data;
      if (f.method === 8) return inflateRaw(data);
      throw new RomError("zip", "El .zip usa una compresión no compatible. Vuelve a comprimirlo en formato ZIP normal.");
    }
    return { files, titleId: tid, readFile };
  }
  function overlay(rom, mod) {
    if (!mod) return rom;
    return { ...rom, async readFile(p) { return mod.files.has(p) ? mod.readFile(p) : rom.readFile(p); } };
  }

  // ---------- ZIP (sin compresión) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    const now = new Date();
    const dosT = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosD = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const [name, data] of files) {
      const nm = enc.encode(name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 10, true); lh.setUint16(6, 0x800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 10, true); ch.setUint16(8, 0x800, true);
      ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const cSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }

  return { RomError, fileReader, openRom, parseGarc, buildGarc, garcFile, decodeText, editText, buildNames, GAMES, LANGS, detectGame, loadText, loadGame, parseTrainer, writeTrainer, newMon, buildMod, formEntry, levelMoves, openModZip, overlay, zip, crc32 };
})();
if (typeof module !== "undefined") module.exports = Core;
