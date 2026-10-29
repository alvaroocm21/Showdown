/**
 * Genera los iconos de la app (PNG) sin dependencias: dibuja una bola sobre un degradado con supermuestreo
 * y escribe los ficheros PNG a mano.   Uso: npm run make-icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];
/** Pone `top` (con su alfa) encima de `base`. */
const over = (base: [number, number, number], top: [number, number, number], alpha: number) => mix(base, top, Math.max(0, Math.min(1, alpha)));

const C = {
  bg1: hex('#5b21b6'), bg2: hex('#be185d'), red: hex('#ef4444'), redLight: hex('#fca5a5'),
  white: hex('#f8fafc'), grey: hex('#cbd5e1'), dark: hex('#1f1235'), black: hex('#000000'), shine: hex('#ffffff'),
};

function sample(x: number, y: number, R: number): [number, number, number] {
  // fondo: degradado diagonal con un brillo suave arriba a la izquierda
  let c = mix(C.bg1, C.bg2, (x + y) / 2);
  c = over(c, C.shine, Math.max(0, 0.18 - Math.hypot(x - 0.25, y - 0.2)) * 1.2);
  const dx = x - 0.5;
  const dy = y - 0.5;
  const d = Math.hypot(dx, dy);
  // sombra debajo de la bola
  c = over(c, C.black, Math.max(0, 1 - Math.hypot(dx, dy - 0.03) / (R * 1.12)) * 0.45);
  if (d > R) return c;

  const edge = Math.max(0, (R - d) / R); // 0 en el borde, 1 en el centro
  let ball: [number, number, number];
  if (Math.abs(dy) < R * 0.085) ball = C.dark;
  else if (dy < 0) ball = mix(C.red, C.redLight, Math.max(0, 0.55 - Math.hypot(dx + R * 0.35, dy + R * 0.45) / R) * 0.9);
  else ball = mix(C.white, C.grey, Math.min(1, (dy / R) * 0.9));
  // botón central
  const b = Math.hypot(dx, dy);
  if (b < R * 0.2) ball = C.dark;
  if (b < R * 0.135) ball = mix(C.white, C.grey, b / (R * 0.135) * 0.4);
  // contorno oscuro
  if (edge < 0.07) ball = mix(C.dark, ball, edge / 0.07 * 0.3);
  return ball;
}

function render(size: number, R: number, ss = 3): Buffer {
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const c = sample((i + (si + 0.5) / ss) / size, (j + (sj + 0.5) / ss) / size, R);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = ss * ss;
      const o = (j * size + i) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = 255;
    }
  }
  return px;
}

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // sin filtro
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons: [string, number, number][] = [
  ['icon-192.png', 192, 0.34],
  ['icon-512.png', 512, 0.34],
  // "maskable": el sistema recorta un círculo/cuadrado redondeado; la bola queda dentro de la zona segura (40 %)
  ['maskable-512.png', 512, 0.27],
  ['apple-touch-icon.png', 180, 0.34],
];
for (const [name, size, radius] of icons) {
  writeFileSync(join(OUT, name), png(size, render(size, radius)));
  console.log(`icons/${name} (${size}×${size})`);
}
