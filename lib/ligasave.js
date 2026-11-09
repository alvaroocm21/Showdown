// Meter Pokémon en las cajas de una partida de Ultra Sol / Ultra Luna (archivo `main` de Citra/Azahar, 0x6CC00 bytes).
// Módulo puro (navegador y Node). Formato según PKHeX (SAV7USUM): 32 cajas × 30 huecos × 232 bytes cifrados en 0x5200.
const LigaSave = (() => {
  const SIZE = 0x6CC00, BOX = 0x5200, BOX_LEN = 960 * 232, BLOCKINFO = SIZE - 0x200, BOX_BLOCK = 14, STATUS = 0x1400;
  const BS = [[0,1,2,3],[0,1,3,2],[0,2,1,3],[0,3,1,2],[0,2,3,1],[0,3,2,1],[1,0,2,3],[1,0,3,2],[2,0,1,3],[3,0,1,2],[2,0,3,1],[3,0,2,1],[1,2,0,3],[1,3,0,2],[2,1,0,3],[3,1,0,2],[2,3,0,1],[3,2,0,1],[1,2,3,0],[1,3,2,0],[2,1,3,0],[3,1,2,0],[2,3,1,0],[3,2,1,0]];
  const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  function crc16(b, s, len) { let c = 0xFFFF; for (let i = s; i < s + len; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xA001 : c >>> 1; } return (~c) & 0xFFFF; }
  // cifrado de las cajas: se mezclan los 4 bloques de 56 bytes y se aplica un XOR con un generador pseudoaleatorio sembrado con la constante de cifrado
  function xorStream(b) { let s = u32(b, 0); for (let o = 8; o < 232; o += 2) { s = (Math.imul(s, 0x41C64E6D) + 0x6073) >>> 0; const w = (u16(b, o) ^ (s >>> 16)) & 0xFFFF; b[o] = w & 255; b[o + 1] = w >> 8; } }
  function shuffle(b, forward) {
    const sv = ((u32(b, 0) >>> 13) & 31) % 24, out = new Uint8Array(232); out.set(b.subarray(0, 8), 0);
    for (let p = 0; p < 4; p++) { const orig = BS[sv][p]; if (forward) out.set(b.subarray(8 + 56 * orig, 8 + 56 * orig + 56), 8 + 56 * p); else out.set(b.subarray(8 + 56 * p, 8 + 56 * p + 56), 8 + 56 * orig); }
    return out;
  }
  const encrypt = pk => { const x = shuffle(pk, true); xorStream(x); return x; };
  const decrypt = ek => { const x = ek.slice(0, 232); xorStream(x); return shuffle(x, false); };
  const checksum = b => { let s = 0; for (let o = 8; o < 232; o += 2) s = (s + u16(b, o)) & 0xFFFF; return s; };
  const str = (b, o, n) => { let s = ""; for (let i = 0; i < n; i++) { const c = u16(b, o + 2 * i); if (!c) break; s += String.fromCharCode(c); } return s; };

  // Comprueba que es una partida de Ultra Sol/Luna y que los bloques cuadran. Devuelve { ok, error, ot, tid, sid }.
  function inspect(buf) {
    if (buf.length !== SIZE) return { ok: false, error: `Tamaño ${buf.length} bytes: se esperaba una partida de Ultra Sol / Ultra Luna (${SIZE} bytes).` };
    const e = BLOCKINFO + 0x14 + BOX_BLOCK * 8;
    if (u32(buf, e) !== BOX_LEN) return { ok: false, error: "No reconozco el bloque de cajas de este archivo." };
    if (crc16(buf, BOX, BOX_LEN) !== u16(buf, e + 6)) return { ok: false, error: "La suma de comprobación de las cajas no cuadra: ¿está el archivo cifrado o dañado?" };
    const id = u32(buf, STATUS);
    return { ok: true, tid: id & 0xFFFF, sid: id >>> 16 };
  }
  // Hueco libre = Pokémon descifrado con suma correcta y especie 0.
  function freeSlots(buf) {
    const free = [];
    for (let s = 0; s < 960; s++) { const x = decrypt(buf.subarray(BOX + s * 232, BOX + (s + 1) * 232)); if (checksum(x) === u16(x, 6) && u16(x, 8) === 0) free.push(s); }
    return free;
  }
  // Lee un Pokémon propio (de los primeros huecos de equipo) para copiar entrenador, idioma y región.
  function trainerFromParty(buf) {
    for (let i = 0; i < 6; i++) { const x = decrypt(buf.subarray(0x1600 + i * 260, 0x1600 + i * 260 + 232)); if (checksum(x) === u16(x, 6) && u16(x, 8) && x[0xB0]) return { ot: str(x, 0xB0, 12), tid: u16(x, 0x0C), sid: u16(x, 0x0E), lang: x[0xE3], country: x[0xE0], region: x[0xE1], consoleRegion: x[0xE2], version: x[0xDF] }; }
    return null;
  }
  // Escribe los Pokémon (cada uno de 232 bytes sin cifrar) en los huecos libres. Devuelve { out, placed: [{ box, slot }], left }.
  function inject(buf, pks) {
    const info = inspect(buf); if (!info.ok) throw new Error(info.error);
    const out = buf.slice(), free = freeSlots(out), placed = [];
    pks.forEach((pk, i) => {
      if (i >= free.length) return;
      const s = free[i], ek = encrypt(pk); out.set(ek, BOX + s * 232); placed.push({ box: Math.floor(s / 30) + 1, slot: (s % 30) + 1 });
    });
    const c = crc16(out, BOX, BOX_LEN), e = BLOCKINFO + 0x14 + BOX_BLOCK * 8 + 6; out[e] = c & 255; out[e + 1] = c >> 8;
    return { out, placed, left: Math.max(0, pks.length - free.length) };
  }
  return { SIZE, inspect, freeSlots, trainerFromParty, inject, encrypt, decrypt, checksum, crc16 };
})();
if (typeof module !== "undefined") module.exports = LigaSave;
