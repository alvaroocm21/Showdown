// Partida sintética de Ultra Sol/Luna: cajas vacías (huecos cifrados) con las sumas de comprobación correctas.
const SV = require("../lib/ligasave.js");
module.exports = () => {
  const buf = new Uint8Array(SV.SIZE), dv = new DataView(buf.buffer), blank = new Uint8Array(232);
  new DataView(blank.buffer).setUint32(0, 0x12345678, true); new DataView(blank.buffer).setUint16(6, SV.checksum(blank), true);
  for (let s = 0; s < 960; s++) buf.set(SV.encrypt(blank), 0x5200 + s * 232);
  const e = SV.SIZE - 0x200 + 0x14 + 14 * 8; dv.setUint32(e, 960 * 232, true); dv.setUint16(e + 6, SV.crc16(buf, 0x5200, 960 * 232), true);
  dv.setUint32(0x1400, (11193 << 16) | 17826, true);
  return buf;
};
